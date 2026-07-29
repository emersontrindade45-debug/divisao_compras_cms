import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { montarRegistry } from "@/lib/assistente/ferramentas";
import { carregarInstrucoes } from "@/lib/assistente/carregarInstrucoes";
import { montarInstrucoesPesquisa } from "@/lib/assistente/instrucoes";
import { montarPromptSistema } from "@/lib/assistente/promptSistema";
import {
  executarTurno,
  MAX_PASSOS_POR_TURNO,
  type EventoTurno,
  type TurnoMensagem,
} from "@/lib/assistente/laco";
import { AssistenteOpenAI, modeloAssistente } from "@/lib/ia/assistenteOpenAI";
import { perplexityConfigurada } from "@/lib/integracoes/perplexity";

// Rota do assistente de pesquisa (M13).
//
// Streaming por SSE porque um turno pode levar dezenas de segundos: sem stream o
// usuário fica olhando um spinner sem saber se o sistema está buscando no PNCP,
// lendo o processo ou travado. Cada passo de ferramenta vira um evento na tela.
//
// `getCurrentUser` em vez de `requireAuth`: esta é uma chamada `fetch`, e
// redirecionar uma chamada fetch devolve HTML no lugar do stream (mesmo motivo
// de `/api/busca`).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Um turno com 8 buscas encosta no teto. 60s é o limite do plano Hobby e é
 * aceito em todos os planos — subir isso exige confirmar o plano da conta antes
 * (o deploy falha se o valor exceder o permitido).
 */
export const maxDuration = 60;

/** Teto de mensagens do histórico reenviadas ao modelo, por custo de tokens. */
const MAX_MENSAGENS_HISTORICO = 30;

const corpoSchema = z.object({
  mensagem: z.string().min(1, "Mensagem vazia.").max(4000),
  /**
   * Ausente na primeira mensagem: a conversa é criada.
   *
   * `nullish` e não `optional`: o cliente guarda o id num `useRef` inicializado
   * com `null` e manda o objeto inteiro, então a primeira mensagem de TODA
   * conversa chega com `conversaId: null`. Com `optional` o Zod rejeitava
   * (`optional` aceita `undefined`, não `null`) e a rota devolvia 400 antes de
   * qualquer coisa — e como o id só é preenchido pelo evento `conversa`, que
   * nunca chegava, nenhuma mensagem passava.
   */
  conversaId: z.string().min(1).nullish(),
  /** Nulo/ausente = conversa global (atalho da Topbar). */
  processoId: z.string().min(1).nullish(),
});

function evento(nome: string, dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const parsed = corpoSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { mensagem, conversaId: conversaInformada } = parsed.data;
  const processoIdInformado = parsed.data.processoId ?? null;

  // Conversa: reaproveita a existente (validando dono) ou cria uma nova.
  // Validar o dono importa — o id vem do cliente, e sem a checagem qualquer
  // usuário autenticado leria a conversa de outro pelo id.
  //
  // Guarda de escopo: se a conversa existente pertence a um processo diferente
  // do processo atual na URL, descarta o id informado e cria uma conversa nova.
  // Isso evita o travamento "presa a outro processo" quando o usuário navega
  // entre processos com conversas persistidas de sessões anteriores.
  let conversa: { id: string; processoId: string | null };
  if (conversaInformada) {
    const existente = await db.conversaAssistente.findUnique({
      where: { id: conversaInformada },
      select: { id: true, processoId: true, userId: true },
    });
    const pertenceAoUsuario = existente && existente.userId === user.id;
    const escopoCompativel =
      pertenceAoUsuario && existente.processoId === processoIdInformado;

    if (!pertenceAoUsuario) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    if (escopoCompativel) {
      conversa = { id: existente.id, processoId: existente.processoId };
    } else {
      // Escopo diverge (conversa presa a outro processo ou era global).
      // Cria uma nova conversa para o processo/escopo atual.
      const criada = await db.conversaAssistente.create({
        data: {
          userId: user.id,
          processoId: processoIdInformado,
          titulo: mensagem.slice(0, 80),
        },
        select: { id: true, processoId: true },
      });
      conversa = criada;
    }
  } else {
    const criada = await db.conversaAssistente.create({
      data: {
        userId: user.id,
        processoId: processoIdInformado,
        // Título provisório derivado da primeira mensagem; a UI permite renomear.
        titulo: mensagem.slice(0, 80),
      },
      select: { id: true, processoId: true },
    });
    conversa = criada;
  }

  const processoId = conversa.processoId;

  const [historicoDb, instrucoesDb, processo] = await Promise.all([
    db.mensagemAssistente.findMany({
      where: { conversaId: conversa.id },
      // `desc` + `take` pega as ÚLTIMAS N mensagens; a ordem cronológica é
      // restaurada abaixo. Com `asc` o `take` traria as N mais ANTIGAS, e numa
      // conversa longa o modelo receberia o começo dela e não veria nada do que
      // acabou de ser dito — perdendo justamente o contexto que o teto existe
      // para preservar.
      orderBy: { createdAt: "desc" },
      take: MAX_MENSAGENS_HISTORICO,
      select: { papel: true, conteudo: true, createdAt: true },
    }),
    carregarInstrucoes(processoId),
    processoId
      ? db.processo.findUnique({ where: { id: processoId }, select: { numero: true } })
      : Promise.resolve(null),
  ]);

  // Só `user`/`assistant` voltam ao modelo: as mensagens `tool` de turnos
  // anteriores são JSON bruto de busca, caras em token e sem valor depois que o
  // assistente já resumiu o que achou. O pareamento
  // `function_call`/`function_call_output` que a Responses API exige vale dentro
  // de um turno, e esse pareamento é construído por `executarTurno`.
  const historico: TurnoMensagem[] = [...historicoDb]
    .reverse()
    .filter((m) => m.papel === "user" || m.papel === "assistant")
    .map((m) => ({ papel: m.papel as "user" | "assistant", conteudo: m.conteudo }));

  historico.push({ papel: "user", conteudo: mensagem });

  await db.mensagemAssistente.create({
    data: { conversaId: conversa.id, papel: "user", conteudo: mensagem },
  });

  const registry = montarRegistry({
    userId: user.id,
    processoId,
    conversaId: conversa.id,
  });

  const temPerplexity = perplexityConfigurada();
  const instrucoesSistema = montarPromptSistema({
    instrucoesPesquisa: montarInstrucoesPesquisa(instrucoesDb),
    processoNumero: processo?.numero ?? null,
    buscaWebOpenAI: true,
    buscaWebPerplexity: temPerplexity,
    maxPassos: MAX_PASSOS_POR_TURNO,
  });

  const modelo = new AssistenteOpenAI({
    instrucoesSistema,
    ferramentas: registry.definicoes.map((d) => ({
      nome: d.nome,
      descricao: d.descricao,
      parametros: d.parametros,
    })),
    habilitarBuscaWeb: true,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (nome: string, dados: unknown) => {
        controller.enqueue(encoder.encode(evento(nome, dados)));
      };

      // O cliente precisa do id antes do fim para conseguir continuar a conversa
      // mesmo que o turno falhe no meio.
      enviar("conversa", { conversaId: conversa.id, processoId });

      try {
        const resultado = await executarTurno({
          historico,
          modelo,
          executar: registry.executar,
          maxPassos: MAX_PASSOS_POR_TURNO,
          onEvento: (ev: EventoTurno) => {
            if (ev.tipo === "passo_inicio") {
              enviar("passo_inicio", { ferramenta: ev.ferramenta, argumentos: ev.argumentos });
            } else if (ev.tipo === "passo_fim") {
              enviar("passo_fim", ev.passo);
            } else {
              enviar("texto", { texto: ev.texto });
            }
          },
        });

        const mensagemAssistente = await db.mensagemAssistente.create({
          select: { id: true },
          data: {
            conversaId: conversa.id,
            papel: "assistant",
            conteudo: resultado.texto,
            // Mapeamento explícito, e não os objetos crus: o campo é `Json` e o
            // que entra aqui é o que a UI lê depois como rastro auditável — a
            // forma persistida precisa ser uma decisão, não um efeito colateral
            // do formato interno do laço.
            ferramentasUsadas: resultado.passos.map((p) => ({
              ferramenta: p.ferramenta,
              argumentos: p.argumentos,
              resumo: p.resumo,
              duracaoMs: p.duracaoMs,
              erro: p.erro ?? null,
              // Os candidatos achados ficam gravados AQUI, e é daqui que a
              // aprovação por clique relê o preço. Sem isso o navegador teria
              // de devolver o candidato, e um cliente forjado poderia injetar
              // valor, órgão ou data numa fonte de estimativa pública.
              ...(p.sugestoes?.length ? { sugestoes: p.sugestoes } : {}),
            })),
            citacoes: modelo.citacoes.map((c) => ({ url: c.url, titulo: c.titulo })),
            modelo: modeloAssistente(),
          },
        });

        await registrarAuditoria({
          userId: user.id,
          ...(processoId ? { processoId } : {}),
          acao: "assistente_turno",
          detalhes: {
            conversaId: conversa.id,
            passos: resultado.passos.length,
            ferramentas: resultado.passos.map((p) => p.ferramenta),
            orcamentoEsgotado: resultado.orcamentoEsgotado,
          },
        });

        // `orcamentoEsgotado` é o que a UI transforma no botão "Continuar
        // procurando". Sem ele o turno acabaria em silêncio e o usuário não
        // saberia que ainda há caminho (CLAUDE.md §9.40).
        enviar("fim", {
          conversaId: conversa.id,
          // O id da mensagem gravada: é a chave que o cartão de candidato usa
          // para pedir a aprovação. Sem ele o cliente só teria um id local,
          // que não existe no banco.
          mensagemId: mensagemAssistente.id,
          texto: resultado.texto,
          passos: resultado.passos,
          citacoes: modelo.citacoes,
          orcamentoEsgotado: resultado.orcamentoEsgotado,
        });
      } catch (erro) {
        console.error("[Assistente] Turno falhou:", erro);
        // Erro vai pelo stream, não por status HTTP: o 200 já foi enviado com o
        // primeiro evento, então lançar aqui deixaria o cliente com um stream
        // truncado e nenhuma explicação na tela.
        enviar("erro", {
          conversaId: conversa.id,
          mensagem:
            erro instanceof Error
              ? erro.message
              : "Falha inesperada ao processar a mensagem.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desliga o buffering de proxy, que seguraria os eventos até o fim e
      // anularia o streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
