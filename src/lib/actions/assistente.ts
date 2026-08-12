"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { acharSugestao, paraCandidato, listaSugestoesSchema } from "@/lib/assistente/sugestoes";
import { getProvedorIA } from "@/lib/ia";
import { candidatoEstaNoTempo } from "@/lib/similaridade/filtroRecencia";
import { calcularScoreFinal } from "@/lib/similaridade/scoreFinal";
import { janelaContratacaoPublica } from "@/lib/domain/in65Rules";
import type { ItemExtraidoTR } from "@/lib/ia/types";

// Leitura da conversa do assistente (M13).
//
// A conversa sempre foi persistida (`ConversaAssistente` + `MensagemAssistente`),
// mas nada no app lia de volta: o chat abria com estado vazio e o `conversaId`
// nulo, então cada abertura do painel criava uma conversa NOVA no banco e o
// usuário perdia o histórico ao fechar. Este módulo é o caminho de leitura que
// faltava.
//
// Escopo é `(userId, processoId)`: dentro de um processo, a conversa é daquele
// processo; fora dele, é a conversa global do atalho da barra superior.

/** Teto de mensagens devolvidas ao reabrir — o mesmo do histórico enviado ao modelo. */
const MAX_MENSAGENS = 30;

const escopoSchema = z.object({
  processoId: z.string().min(1).nullish(),
});

export interface PassoPersistido {
  ferramenta: string;
  argumentos: string;
  resumo?: string;
  duracaoMs?: number;
  erro?: string | null;
  sugestoes?: z.infer<typeof listaSugestoesSchema>;
}

export interface CitacaoPersistida {
  url: string;
  titulo: string;
}

export interface MensagemCarregada {
  id: string;
  papel: "user" | "assistant";
  conteudo: string;
  passos: PassoPersistido[];
  citacoes: CitacaoPersistida[];
}

export interface ConversaCarregada {
  conversaId: string;
  mensagens: MensagemCarregada[];
}

/**
 * O campo é `Json` e o que está lá foi gravado por versões anteriores do
 * código. Ler sem validar significaria confiar num formato que pode ter mudado
 * — e uma mensagem antiga malformada derrubaria a tela inteira em vez de
 * aparecer sem o rastro de passos.
 */
const passoSchema = z.object({
  ferramenta: z.string(),
  argumentos: z.string().optional().default("{}"),
  resumo: z.string().optional(),
  duracaoMs: z.number().optional(),
  erro: z.string().nullish(),
  sugestoes: listaSugestoesSchema.optional(),
});

const citacaoSchema = z.object({ url: z.string(), titulo: z.string() });

function lerPassos(bruto: unknown): PassoPersistido[] {
  const resultado = z.array(passoSchema).safeParse(bruto);
  return resultado.success ? resultado.data : [];
}

function lerCitacoes(bruto: unknown): CitacaoPersistida[] {
  const resultado = z.array(citacaoSchema).safeParse(bruto);
  return resultado.success ? resultado.data : [];
}

/**
 * Devolve a conversa mais recente do usuário no escopo informado, com o
 * histórico já pronto para a tela. `null` quando ainda não houve conversa —
 * o chat abre vazio e a primeira mensagem cria a conversa, como antes.
 */
export async function obterConversaAtiva(
  processoId: string | null,
): Promise<ConversaCarregada | null> {
  const user = await requireAuth();
  const { processoId: escopo } = escopoSchema.parse({ processoId });

  // "Última conversa" é a que recebeu a última mensagem, e não a criada por
  // último: `ConversaAssistente.updatedAt` não é tocado quando chega uma
  // mensagem nova (a escrita é na tabela filha), então ordenar por ele traria a
  // conversa mais recém-aberta em vez da que o usuário estava usando.
  const ultima = await db.mensagemAssistente.findFirst({
    // `userId` no filtro, não só no resultado: conversa é do usuário que a
    // criou, e o escopo nunca pode vazar para outro.
    where: { conversa: { userId: user.id, processoId: escopo ?? null } },
    orderBy: { createdAt: "desc" },
    select: { conversaId: true },
  });

  if (!ultima) return null;

  const conversa = await db.conversaAssistente.findFirst({
    where: { id: ultima.conversaId, userId: user.id },
    select: {
      id: true,
      mensagens: {
        // Só o que a tela mostra. Mensagens `tool` são JSON bruto de busca,
        // já resumidas no texto do assistente.
        where: { papel: { in: ["user", "assistant"] } },
        // `desc` + `take` pega as ÚLTIMAS N e a ordem de leitura é restaurada
        // depois. Com `asc` o `take` traria as N mais ANTIGAS, e uma conversa
        // longa reabriria mostrando o começo esquecido em vez do fim.
        orderBy: { createdAt: "desc" },
        take: MAX_MENSAGENS,
        select: {
          id: true,
          papel: true,
          conteudo: true,
          ferramentasUsadas: true,
          citacoes: true,
        },
      },
    },
  });

  if (!conversa) return null;

  return {
    conversaId: conversa.id,
    // Desfaz o `desc` usado para pegar as últimas: a tela lê de cima para baixo.
    mensagens: [...conversa.mensagens].reverse().map((m) => ({
      id: m.id,
      papel: m.papel as "user" | "assistant",
      conteudo: m.conteudo,
      passos: lerPassos(m.ferramentasUsadas),
      citacoes: lerCitacoes(m.citacoes),
    })),
  };
}

/** Itens do processo, para o cartão de candidato saber a qual deles adicionar. */
export async function listarItensDoProcesso(
  processoId: string,
): Promise<{ id: string; descricao: string }[]> {
  await requireAuth();
  return db.item.findMany({
    where: { processoId },
    orderBy: { createdAt: "asc" },
    select: { id: true, descricao: true },
  });
}

const aprovarSchema = z.object({
  /** Mensagem do assistente onde a busca foi gravada. */
  mensagemId: z.string().min(1),
  /** Id curto do candidato dentro daquela busca (`c1`, `c2`...). */
  candidatoId: z.string().min(1),
  itemId: z.string().min(1),
});

export interface ResultadoAprovacao {
  ok: boolean;
  mensagem: string;
}

// Score mínimo para adição manual via assistente (humano no loop).
// O pipeline automático usa 70; aqui o analista já leu o edital e
// decidiu que o candidato é pertinente — não faz sentido bloquear com
// o mesmo corte de triagem automática. 40 garante alguma relação com o
// objeto sem impedir escolhas informadas do analista.
const SCORE_MINIMO_MANUAL = 40;

/**
 * Adiciona à lista do processo um candidato que o assistente encontrou.
 *
 * É o único caminho de escrita do assistente, e ele começa num clique humano —
 * o modelo propõe, o servidor decide. Três garantias que não dependem do
 * navegador:
 *
 * - **o preço vem da mensagem gravada**, não do corpo da requisição;
 * - **o score é recalculado** pelo provedor de IA, com rastreabilidade igual
 *   ao pipeline automático;
 * - **a janela de recência** respeita a natureza cadastrada do item
 *   (`Item.natureza` — serviço contínuo 730 dias / bem de consumo 365 dias),
 *   não uma escolha feita no momento do clique.
 */
export async function adicionarCandidatoSugerido(
  entrada: z.input<typeof aprovarSchema>,
): Promise<ResultadoAprovacao> {
  // Mesma exigência de papel da promoção a fonte: adicionar candidato mexe na
  // instrução do processo.
  const user = await requireRole("pesquisa");
  const { mensagemId, candidatoId, itemId } = aprovarSchema.parse(entrada);

  const mensagem = await db.mensagemAssistente.findUnique({
    where: { id: mensagemId },
    select: {
      id: true,
      ferramentasUsadas: true,
      // O dono da conversa: sem isto, qualquer usuário autenticado aprovaria
      // um candidato de uma conversa alheia só chutando o id da mensagem.
      conversa: { select: { id: true, userId: true, processoId: true } },
    },
  });

  if (!mensagem || mensagem.conversa.userId !== user.id) {
    return { ok: false, mensagem: "Sugestão não encontrada nesta conversa." };
  }

  const sugestao = acharSugestao(mensagem.ferramentasUsadas, candidatoId);
  if (!sugestao) {
    return { ok: false, mensagem: "Este candidato não está mais disponível nesta busca." };
  }

  const item = await db.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      processoId: true,
      descricao: true,
      unidade: true,
      quantidade: true,
      caracteristicasTecnicas: true,
      natureza: true,
    },
  });
  if (!item) return { ok: false, mensagem: "Item não encontrado." };

  // Conversa presa a um processo não escreve em item de outro.
  if (mensagem.conversa.processoId && item.processoId !== mensagem.conversa.processoId) {
    return { ok: false, mensagem: "Este item pertence a outro processo." };
  }

  // Duplicata: a mesma contratação já registrada no item não precisa entrar de
  // novo. A guarda forte contra duplicidade fica na promoção a Fonte, que tem
  // constraint `@unique` e update condicional (CLAUDE.md §9.14) — aqui poluir a
  // lista é o único dano, e a checagem simples resolve.
  //
  // Exceção: linha DESCARTADA não bloqueia. O descarte grava uma lápide
  // (score 0, ver `descartarCandidatoAssistente`), e tratá-la como duplicata
  // deixava o analista sem saída — ele mandava adicionar de novo, recebia "já
  // está na lista" e o contrato não aparecia em lugar nenhum. Neste caso a
  // lápide é revivida com os dados reais, preservando o id.
  let idParaReviver: string | null = null;
  if (sugestao.fonteUrl) {
    const jaExiste = await db.resultadoSimilaridade.findFirst({
      where: { itemId: item.id, fonteUrl: sugestao.fonteUrl },
      select: { id: true, descartado: true },
    });
    if (jaExiste && !jaExiste.descartado) {
      return { ok: false, mensagem: "Esta contratação já está na lista deste item." };
    }
    if (jaExiste) idParaReviver = jaExiste.id;
  }

  // ── 1. Validar recência com a janela da natureza cadastrada do item ───────
  const janelaDias = janelaContratacaoPublica(item.natureza);
  const candidato = paraCandidato(sugestao);
  if (!candidatoEstaNoTempo(candidato, item.natureza)) {
    return {
      ok: false,
      mensagem:
        `Contrato fora da janela de ${janelaDias} dias admitida para este item. ` +
        (item.natureza
          ? `Se a classificação do item (${item.natureza === "bem_consumo" ? "bem de consumo" : "serviço contínuo"}) estiver errada, ajuste-a na lista de fontes e tente novamente.`
          : `Item ainda não classificado (usa o teto de ${janelaDias} dias); classifique a natureza na lista de fontes para uma janela mais precisa.`),
    };
  }

  // ── 2. Calcular score via IA (rastreabilidade e auditoria) ────────────────
  const itemTR: ItemExtraidoTR = {
    descricao: item.descricao,
    especificacaoTecnica: item.caracteristicasTecnicas ?? "",
    unidade: item.unidade,
    quantidade: item.quantidade,
  };

  const provedor = getProvedorIA();
  const avaliacoes = await provedor.rankearSimilaridade(itemTR, [candidato]);
  const avaliacao = avaliacoes[0];

  if (!avaliacao) {
    return { ok: false, mensagem: "Não foi possível avaliar a similaridade do candidato." };
  }

  const scoreFinal = calcularScoreFinal({
    scoreDescricao: avaliacao.scoreDescricao,
    scoreEspecificacao: avaliacao.scoreEspecificacao,
    scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
  });

  // ── 3. Aplicar limiar reduzido para adição manual (humano no loop) ────────
  if (scoreFinal < SCORE_MINIMO_MANUAL) {
    return {
      ok: false,
      mensagem:
        `Score ${Math.round(scoreFinal)}/100 — abaixo de ${SCORE_MINIMO_MANUAL} mesmo para adição manual. ` +
        `O candidato tem relação muito baixa com este item; verifique se selecionou o item correto.`,
    };
  }

  // Candidato adicionado manualmente com score abaixo do corte automático (70):
  // registrado como "adaptado" para o auditor saber que foi escolha do analista.
  const adaptado = scoreFinal < 70;

  const dadosCandidato = {
    itemId: item.id,
    tipoCandidato: avaliacao.candidato.tipoCandidato,
    fonteDescricao: avaliacao.candidato.fonteDescricao,
    fonteOrgaoOuId: avaliacao.candidato.fonteOrgaoOuId,
    fonteUrl: avaliacao.candidato.fonteUrl ?? null,
    valorUnitario: avaliacao.candidato.valorUnitario,
    dataReferencia: avaliacao.candidato.dataReferencia,
    scoreFinal,
    scoreDescricao: avaliacao.scoreDescricao,
    scoreEspecificacao: avaliacao.scoreEspecificacao,
    scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
    adaptado,
    justificativa: avaliacao.justificativa,
    origem: "assistente" as const,
    conversaId: mensagem.conversa.id,
    termoBuscaUsado: sugestao.termoBuscaUsado,
  };

  if (idParaReviver) {
    await db.resultadoSimilaridade.update({
      where: { id: idParaReviver },
      select: { id: true },
      data: { ...dadosCandidato, descartado: false },
    });
  } else {
    await db.resultadoSimilaridade.create({ select: { id: true }, data: dadosCandidato });
  }

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "assistente_adicionar_candidato",
    detalhes: {
      itemId: item.id,
      conversaId: mensagem.conversa.id,
      mensagemId: mensagem.id,
      candidatoId,
      naturezaObjeto: item.natureza,
      janelaDias,
      termoBuscaUsado: sugestao.termoBuscaUsado,
      scoreFinal,
      adaptado,
      revividoDeDescarte: idParaReviver !== null,
    },
  });

  // Sem isto o candidato entra no banco e a tabela na tela continua a mesma até
  // alguém recarregar a página.
  revalidatePath(`/processos/${item.processoId}`);

  const avisoAdaptado = adaptado
    ? ` (score ${Math.round(scoreFinal)}, abaixo do corte automático de 70 — marcado como adaptado para o auditor)`
    : "";

  return {
    ok: true,
    mensagem: `Adicionado à lista com score ${Math.round(scoreFinal)}${avisoAdaptado}. Promover a fonte da estimativa continua sendo um clique seu, na aba de similaridade.`,
  };
}

// ---------------------------------------------------------------------------
// Descarte de candidato sugerido pelo assistente
// ---------------------------------------------------------------------------

const descartarSchema = z.object({
  mensagemId: z.string().min(1),
  candidatoId: z.string().min(1),
  itemId: z.string().min(1),
});

export interface ResultadoDescarte {
  ok: boolean;
  mensagem: string;
}

/**
 * Persiste o descarte de um candidato sugerido pelo assistente.
 *
 * Grava um `ResultadoSimilaridade` com `descartado = true` para que buscas
 * futuras no PNCP via `buscar_pncp` filtrem contratos já vistos e descartados
 * pelo analista — sem precisar que ele guarde esse contexto na cabeça ou repita
 * o julgamento a cada nova busca.
 *
 * Não chama a IA para pontuar (o descarte é uma recusa, não uma avaliação):
 * os scores ficam zerados e a justificativa explica o motivo.
 */
export async function descartarCandidatoAssistente(
  entrada: z.input<typeof descartarSchema>,
): Promise<ResultadoDescarte> {
  const user = await requireRole("pesquisa");
  const { mensagemId, candidatoId, itemId } = descartarSchema.parse(entrada);

  const mensagem = await db.mensagemAssistente.findUnique({
    where: { id: mensagemId },
    select: {
      ferramentasUsadas: true,
      conversa: { select: { id: true, userId: true, processoId: true } },
    },
  });

  if (!mensagem || mensagem.conversa.userId !== user.id) {
    return { ok: false, mensagem: "Sugestão não encontrada nesta conversa." };
  }

  const sugestao = acharSugestao(mensagem.ferramentasUsadas, candidatoId);
  if (!sugestao) {
    return { ok: false, mensagem: "Candidato não encontrado na mensagem." };
  }

  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, processoId: true },
  });
  if (!item) return { ok: false, mensagem: "Item não encontrado." };

  if (mensagem.conversa.processoId && item.processoId !== mensagem.conversa.processoId) {
    return { ok: false, mensagem: "Item pertence a outro processo." };
  }

  // Se a URL já está registrada para este item (adicionado ou descartado antes),
  // não cria duplicata — o cliente já vai esconder o card pelo state local.
  if (sugestao.fonteUrl) {
    const jaExiste = await db.resultadoSimilaridade.findFirst({
      where: { itemId: item.id, fonteUrl: sugestao.fonteUrl },
      select: { id: true },
    });
    if (jaExiste) {
      return { ok: true, mensagem: "Candidato já registrado." };
    }
  }

  await db.resultadoSimilaridade.create({
    select: { id: true },
    data: {
      itemId: item.id,
      tipoCandidato: sugestao.tipoCandidato,
      fonteDescricao: sugestao.fonteDescricao,
      fonteOrgaoOuId: sugestao.fonteOrgaoOuId,
      fonteUrl: sugestao.fonteUrl ?? null,
      valorUnitario: sugestao.valorUnitario,
      dataReferencia: new Date(sugestao.dataReferencia),
      scoreFinal: 0,
      scoreDescricao: 0,
      scoreEspecificacao: 0,
      scoreUnidadeQuantidade: 0,
      adaptado: false,
      justificativa: "Descartado pelo analista no assistente de pesquisa.",
      descartado: true,
      origem: "assistente",
      conversaId: mensagem.conversa.id,
      termoBuscaUsado: sugestao.termoBuscaUsado,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: item.processoId,
    acao: "assistente_descartar_candidato",
    detalhes: {
      itemId: item.id,
      conversaId: mensagem.conversa.id,
      mensagemId,
      candidatoId,
      fonteUrl: sugestao.fonteUrl ?? null,
    },
  });

  return { ok: true, mensagem: "Candidato descartado." };
}
