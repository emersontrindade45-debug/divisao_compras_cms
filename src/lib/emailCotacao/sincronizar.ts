import "server-only";
import { db } from "@/lib/db";
import { definirPrazo } from "@/lib/domain/cotacaoEmail/prazo";
import { ligarProcesso } from "@/lib/domain/cotacaoEmail/ligarProcesso";
import { dominioDe, ligarRemetente } from "@/lib/domain/cotacaoEmail/ligarResposta";
import { classificarResposta } from "@/lib/domain/cotacaoEmail/classificarResposta";
import { buscarCandidatosPorEmail } from "./candidatos";
import type { PayloadScript, RespostaScript } from "./payload";

/**
 * Aplica no sistema o que o script do Google devolveu (M30.d).
 *
 * SIGILO (decidido com o usuário): este módulo recebe só metadados e marcadores booleanos, e só
 * grava o que a Q28 permitiu — situação, data da resposta, regra aplicada e id da mensagem no
 * Gmail. O remetente completo NUNCA é persistido (a fila guarda só o domínio). Nada aqui escreve
 * em console, e quem chama não deve propagar mensagem de erro com dados do payload.
 *
 * Idempotente: clicar duas vezes não duplica nada (chave única no id da mensagem + guardas
 * atômicas `WHERE situacao = ...` no UPDATE — CLAUDE.md §9.14).
 */

export interface ResumoSincronizacao {
  envios: number;
  enviosNovos: number;
  consultasNovas: number;
  respostasClassificadas: number;
  respostasNaFila: number;
  emailsInvalidos: number;
  enviosSemProcesso: number;
}

const HORA_MS = 60 * 60 * 1000;
const LOTE_CRIACAO = 1000;

/** Ano do dia civil em Santos (UTC−3) — o ano que o assunto "382" costuma querer dizer. */
function anoEmSantos(instante: Date): number {
  return new Date(instante.getTime() - 3 * HORA_MS).getUTCFullYear();
}

function minusculo(e: string): string {
  return e.trim().toLowerCase();
}

type SituacaoAplicada = "orcamento" | "recusa" | "a_confirmar";

interface DesfechoConsulta {
  envioId: string;
  email: string;
  situacoes: Set<"orcamento" | "recusa" | "a_confirmar">;
  regras: Map<string, string>;
  /** Mensagem que originou cada situação — o id gravado é o da que gerou a regra aplicada. */
  mensagens: Map<string, string>;
  primeiraData: Date;
}

/** Uma resposta que a classificação+ligação resolveram para uma consulta. */
function desfechoFinal(d: DesfechoConsulta): {
  situacao: SituacaoAplicada;
  regra: string;
  mensagem: string;
} {
  const classificadas = [...d.situacoes].filter((s) => s !== "a_confirmar");
  // Orçamento E recusa do mesmo fornecedor se contradizem: decide um humano.
  if (classificadas.length === 1) {
    const situacao = classificadas[0]! as SituacaoAplicada;
    return {
      situacao,
      regra: d.regras.get(situacao) ?? "manual",
      mensagem: d.mensagens.get(situacao) ?? "",
    };
  }
  return {
    situacao: "a_confirmar",
    regra: classificadas.length > 1 ? "sinais_conflitantes" : (d.regras.get("a_confirmar") ?? "sinais_ambiguos"),
    mensagem: d.mensagens.get("a_confirmar") ?? [...d.mensagens.values()][0] ?? "",
  };
}

export async function sincronizarRespostasEmail(
  payload: PayloadScript,
  opcoes: { processoId?: string } = {},
): Promise<ResumoSincronizacao> {
  const processos = await db.processo.findMany({ select: { id: true, numero: true } });

  // ── 1. Envios ───────────────────────────────────────────────────────────
  const idsGmail = payload.envios.map((e) => e.id);
  const existentes = await db.envioCotacao.findMany({
    where: { gmailMensagemId: { in: idsGmail } },
    select: { gmailMensagemId: true },
  });
  const jaExistem = new Set(existentes.map((e) => e.gmailMensagemId));
  const novos = payload.envios.filter((e) => !jaExistem.has(e.id));

  for (let i = 0; i < novos.length; i += LOTE_CRIACAO) {
    await db.envioCotacao.createMany({
      data: novos.slice(i, i + LOTE_CRIACAO).map((e) => {
        const dataEnvio = new Date(e.data);
        const { prazo, origem } = definirPrazo({
          prazo: e.prazo,
          prazoOrigem: e.prazoOrigem,
          dataEnvio,
        });
        return {
          gmailMensagemId: e.id,
          gmailFio: e.fio,
          dataEnvio,
          prazo,
          prazoOrigem: origem,
          numeroProcessoAssunto: e.processo,
          processoId: ligarProcesso(e.processo, anoEmSantos(dataEnvio), processos),
          totalDestinatarios: new Set(e.destinatarios.map(minusculo)).size,
        };
      }),
      skipDuplicates: true,
    });
  }

  let enviosDb = await db.envioCotacao.findMany({
    where: { gmailMensagemId: { in: idsGmail } },
    select: {
      id: true,
      gmailMensagemId: true,
      dataEnvio: true,
      processoId: true,
      numeroProcessoAssunto: true,
    },
  });

  // Q51 — envio que esperava o processo se liga sozinho quando a planilha é sincronizada.
  for (const e of enviosDb.filter((x) => x.processoId === null && x.numeroProcessoAssunto)) {
    const processoId = ligarProcesso(e.numeroProcessoAssunto, anoEmSantos(e.dataEnvio), processos);
    if (!processoId) continue;
    // Guarda atômica: só liga se ainda estiver sem processo.
    await db.envioCotacao.updateMany({
      where: { id: e.id, processoId: null },
      data: { processoId },
    });
    e.processoId = processoId;
  }

  if (opcoes.processoId) {
    enviosDb = enviosDb.filter((e) => e.processoId === opcoes.processoId);
  }
  const envioPorGmail = new Map(enviosDb.map((e) => [e.gmailMensagemId, e]));
  const enviosEscopo = payload.envios.filter((e) => envioPorGmail.has(e.id));

  // ── 2. Consultas (um registro por fornecedor consultado) ────────────────
  const idsEscopo = enviosEscopo.map((e) => envioPorGmail.get(e.id)!.id);
  const contagens = await db.consultaCotacao.groupBy({
    by: ["envioId"],
    where: { envioId: { in: idsEscopo } },
    _count: { _all: true },
  });
  const jaTem = new Map(contagens.map((c) => [c.envioId, c._count._all]));

  const incompletos = enviosEscopo.filter((e) => {
    const distintos = new Set(e.destinatarios.map(minusculo)).size;
    return (jaTem.get(envioPorGmail.get(e.id)!.id) ?? 0) < distintos;
  });

  let consultasNovas = 0;
  if (incompletos.length > 0) {
    const emails = incompletos.flatMap((e) => e.destinatarios.map(minusculo));
    const [candidatos, fornecedores] = await Promise.all([
      buscarCandidatosPorEmail(emails),
      db.fornecedor.findMany({ select: { id: true, email: true } }),
    ]);
    const fornecedorPorEmail = new Map(
      fornecedores.filter((f) => f.email).map((f) => [minusculo(f.email), f.id]),
    );

    const linhas = incompletos.flatMap((e) =>
      [...new Set(e.destinatarios.map(minusculo))].map((email) => {
        const c = candidatos.get(email);
        return {
          envioId: envioPorGmail.get(e.id)!.id,
          email,
          cnpj: c?.cnpj ?? null,
          razaoSocial: c?.razaoSocial ?? null,
          cnaeDescricao: c?.cnaeDescricao ?? null,
          fornecedorId: fornecedorPorEmail.get(email) ?? null,
        };
      }),
    );
    for (let i = 0; i < linhas.length; i += LOTE_CRIACAO) {
      const r = await db.consultaCotacao.createMany({
        data: linhas.slice(i, i + LOTE_CRIACAO),
        skipDuplicates: true,
      });
      consultasNovas += r.count;
    }
  }

  // ── 3. Respostas ────────────────────────────────────────────────────────
  const consultas = idsEscopo.length
    ? await db.consultaCotacao.findMany({
        where: { envioId: { in: idsEscopo } },
        select: { id: true, envioId: true, email: true },
      })
    : [];
  const consultaId = new Map(consultas.map((c) => [`${c.envioId}|${c.email}`, c.id]));
  const destinatariosPorEnvio = new Map(
    enviosEscopo.map((e) => [e.id, e.destinatarios.map(minusculo)]),
  );

  const desfechos = new Map<string, DesfechoConsulta>();
  const pendentes: Array<{
    gmailMensagemId: string;
    envioId: string;
    dataResposta: Date;
    remetenteDominio: string;
    sugestaoConsultaId: string | null;
    motivo: string;
    temAnexoOrcamento: boolean;
    contemRecusa: boolean;
    contemValor: boolean;
  }> = [];
  const devolvidos: Array<{ envioId: string; email: string; data: Date; mensagem: string }> = [];
  let respostasClassificadas = 0;

  const ordenadas = [...payload.respostas].sort((a, b) => a.data.localeCompare(b.data));
  for (const r of ordenadas) {
    const envio = r.envioId ? envioPorGmail.get(r.envioId) : undefined;
    if (!r.envioId || !envio) continue;
    const data = new Date(r.data);
    const resultado = classificarResposta(r);

    if (resultado.acao === "ignorar") continue;
    if (resultado.acao === "devolucao") {
      for (const endereco of r.enderecosDevolvidos) {
        devolvidos.push({ envioId: envio.id, email: minusculo(endereco), data, mensagem: r.id });
      }
      continue;
    }

    const ligacao = ligarRemetente(r.remetente, destinatariosPorEnvio.get(r.envioId) ?? []);
    const consulta =
      ligacao.tipo === "fila" ? undefined : consultaId.get(`${envio.id}|${ligacao.email}`);

    let situacao: SituacaoAplicada | null = null;
    let regra = "";
    let motivoFila: string | null = null;

    if (resultado.acao === "aplicar" && consulta) {
      situacao = resultado.situacao;
      regra = ligacao.tipo === "dominio" ? `${resultado.regra}_dominio` : resultado.regra;
    } else {
      motivoFila = ligacao.tipo === "fila" ? ligacao.motivo : resultado.acao === "fila" ? resultado.motivo : "remetente_desconhecido";
      if (consulta) {
        situacao = "a_confirmar";
        regra = motivoFila;
      }
    }

    if (motivoFila !== null) {
      pendentes.push({
        gmailMensagemId: r.id,
        envioId: envio.id,
        dataResposta: data,
        // Só o DOMÍNIO — nunca o endereço completo (Q28).
        remetenteDominio: dominioDe(r.remetente),
        sugestaoConsultaId: consulta ?? null,
        motivo: motivoFila,
        temAnexoOrcamento: r.temAnexoOrcamento,
        contemRecusa: r.contemRecusa,
        contemValor: r.contemValor,
      });
    } else {
      respostasClassificadas += 1;
    }

    if (situacao && consulta && ligacao.tipo !== "fila") {
      const chave = `${envio.id}|${ligacao.email}`;
      const d = desfechos.get(chave) ?? {
        envioId: envio.id,
        email: ligacao.email,
        situacoes: new Set(),
        regras: new Map(),
        mensagens: new Map(),
        primeiraData: data,
      };
      d.situacoes.add(situacao);
      if (!d.regras.has(situacao)) {
        d.regras.set(situacao, regra);
        d.mensagens.set(situacao, r.id);
      }
      desfechos.set(chave, d);
    }
  }

  // ── 4. Gravação ─────────────────────────────────────────────────────────
  if (pendentes.length > 0) {
    await db.respostaEmailPendente.createMany({ data: pendentes, skipDuplicates: true });
  }

  const finais = [...desfechos.values()].map((d) => ({ d, ...desfechoFinal(d) }));
  if (finais.length > 0) {
    await aplicarEmLote(
      finais.map((f) => ({
        envioId: f.d.envioId,
        email: f.d.email,
        situacao: f.situacao,
        regra: f.regra,
        primeiraData: f.d.primeiraData,
        mensagem: f.mensagem,
      })),
    );
  }

  let emailsInvalidos = 0;
  if (devolvidos.length > 0) {
    const r = await db.emailInvalido.createMany({
      data: devolvidos.map((x) => ({
        email: x.email,
        primeiraDevolucao: x.data,
        gmailMensagemId: x.mensagem,
      })),
      skipDuplicates: true,
    });
    emailsInvalidos = r.count;
    await marcarDevolvidos(devolvidos);
  }

  const enviosSemProcesso = await db.envioCotacao.count({ where: { processoId: null } });

  return {
    envios: enviosEscopo.length,
    enviosNovos: novos.length,
    consultasNovas,
    respostasClassificadas,
    respostasNaFila: pendentes.length,
    emailsInvalidos,
    enviosSemProcesso,
  };
}

interface LinhaAplicar {
  envioId: string;
  email: string;
  situacao: SituacaoAplicada;
  regra: string;
  primeiraData: Date;
  mensagem: string;
}

/**
 * UPDATE em lote com guarda atômica no WHERE (§9.14), uma linha por consulta (a redução foi feita
 * em memória: um UPDATE ... FROM com duas linhas para a mesma consulta escolheria uma ao acaso).
 *
 * Passo 1: quem ainda estava `sem_resposta` recebe situação, data (a PRIMEIRA resposta) e regra.
 * Passo 2: quem estava `a_confirmar` e agora tem classificação segura é promovido, sem mexer na
 * data. Consulta que o analista já resolveu nunca é sobrescrita.
 */
async function aplicarEmLote(linhas: LinhaAplicar[]): Promise<void> {
  const envios = linhas.map((l) => l.envioId);
  const emails = linhas.map((l) => l.email);
  const situacoes = linhas.map((l) => l.situacao);
  const datas = linhas.map((l) => l.primeiraData.toISOString());
  const mensagens = linhas.map((l) => l.mensagem);
  const regras = linhas.map((l) => l.regra);

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = v.situacao::"SituacaoConsulta",
        "dataResposta" = v.data::timestamp,
        "gmailRespostaId" = v.mensagem,
        "regra" = v.regra,
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${situacoes}::text[], ${datas}::text[],
                ${mensagens}::text[], ${regras}::text[])
         AS v(envio, email, situacao, data, mensagem, regra)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" = 'sem_resposta'`;

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = v.situacao::"SituacaoConsulta",
        "gmailRespostaId" = v.mensagem,
        "regra" = v.regra,
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${situacoes}::text[],
                ${mensagens}::text[], ${regras}::text[])
         AS v(envio, email, situacao, mensagem, regra)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" = 'a_confirmar'
      AND v.situacao IN ('orcamento', 'recusa')`;
}

async function marcarDevolvidos(
  devolvidos: Array<{ envioId: string; email: string; data: Date; mensagem: string }>,
): Promise<void> {
  const envios = devolvidos.map((d) => d.envioId);
  const emails = devolvidos.map((d) => d.email);
  const datas = devolvidos.map((d) => d.data.toISOString());
  const mensagens = devolvidos.map((d) => d.mensagem);

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = 'email_invalido',
        "dataResposta" = v.data::timestamp,
        "gmailRespostaId" = v.mensagem,
        "regra" = 'devolucao',
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${datas}::text[], ${mensagens}::text[])
         AS v(envio, email, data, mensagem)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" = 'sem_resposta'`;
}

export type { RespostaScript };
