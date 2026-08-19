"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  acharSugestao,
  identidadeDaContratacao,
  paraCandidato,
  listaSugestoesSchema,
} from "@/lib/assistente/sugestoes";
import { getProvedorIA } from "@/lib/ia";
import { candidatoEstaNoTempo } from "@/lib/similaridade/filtroRecencia";
import { calcularScoreFinal } from "@/lib/similaridade/scoreFinal";
import { janelaContratacaoPublica } from "@/lib/domain/in65Rules";
import { listarItensDaCompraPNCP } from "@/lib/integracoes/pncp";
import { resolverUrlsAcompanhamentoPainel, resolverUrlPublicaPorIdCompra } from "@/lib/integracoes/comprasGov";
import {
  idCompraDaUrlAcompanhamento,
  precisaCompletarLinkPainel,
  resolverLinkOrigem,
} from "@/lib/similaridade/linkOrigem";
import type { CandidatoSimilaridade, ItemExtraidoTR } from "@/lib/ia/types";

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

const completarLinksSchema = z.object({
  mensagemId: z.string().min(1),
});

export interface ResultadoLinksOrigem {
  ok: boolean;
  mensagem?: string;
  /** `candidatoId` → URL da contratação específica. */
  urls: Record<string, string>;
}

/**
 * Completa `fonteUrl` dos candidatos do Painel de Preços que foram gravados
 * sem o `idCompra` (conversas antigas) ou com a home do Lite. O card precisa
 * abrir a compra, como o PNCP abre o edital — não o portal genérico.
 *
 * Grava o resultado na própria mensagem para a próxima abertura não repetir
 * a consulta à API.
 */
export async function completarLinksOrigemCandidatos(
  input: unknown,
): Promise<ResultadoLinksOrigem> {
  const user = await requireAuth();
  const { mensagemId } = completarLinksSchema.parse(input);

  const carregada = await carregarMensagemDoUsuario(mensagemId, user.id);
  if (!carregada.ok) {
    return { ok: false, mensagem: carregada.mensagem, urls: {} };
  }

  const passos = lerPassos(carregada.mensagem.ferramentasUsadas);
  const urls: Record<string, string> = {};
  const pendentesPorCampos: { id: string; passoIdx: number; sugestaoIdx: number }[] = [];
  const pendentesPorId: { id: string; passoIdx: number; sugestaoIdx: number; idCompra: string }[] =
    [];

  passos.forEach((passo, passoIdx) => {
    passo.sugestoes?.forEach((sugestao, sugestaoIdx) => {
      const identidade = identidadeDaContratacao(sugestao);
      const origem = resolverLinkOrigem(
        sugestao.tipoCandidato,
        sugestao.fonteUrl,
        identidade,
      );
      if (origem) {
        urls[sugestao.id] = origem.href;
        return;
      }
      const idCompra = sugestao.fonteUrl
        ? idCompraDaUrlAcompanhamento(sugestao.fonteUrl)
        : null;
      if (idCompra) {
        pendentesPorId.push({ id: sugestao.id, passoIdx, sugestaoIdx, idCompra });
        return;
      }
      if (
        !precisaCompletarLinkPainel(sugestao.tipoCandidato, sugestao.fonteUrl, identidade)
      ) {
        return;
      }
      pendentesPorCampos.push({ id: sugestao.id, passoIdx, sugestaoIdx });
    });
  });

  if (pendentesPorCampos.length === 0 && pendentesPorId.length === 0) {
    return { ok: true, urls };
  }

  const resolvidasPorCampos =
    pendentesPorCampos.length > 0
      ? await resolverUrlsAcompanhamentoPainel(
          pendentesPorCampos.map(({ passoIdx, sugestaoIdx }) => {
            const sugestao = passos[passoIdx]!.sugestoes![sugestaoIdx]!;
            return {
              fonteDescricao: sugestao.fonteDescricao,
              fonteOrgaoOuId: sugestao.fonteOrgaoOuId,
              valorUnitario: sugestao.valorUnitario,
              dataReferencia: sugestao.dataReferencia,
            };
          }),
        )
      : [];

  const resolvidasPorId = await Promise.all(
    pendentesPorId.map((p) => resolverUrlPublicaPorIdCompra(p.idCompra)),
  );

  let mudou = false;
  const aplicar = (
    pendente: { id: string; passoIdx: number; sugestaoIdx: number },
    href: string | null | undefined,
  ) => {
    const sugestao = passos[pendente.passoIdx]!.sugestoes![pendente.sugestaoIdx]!;
    if (href) {
      urls[pendente.id] = href;
      if (sugestao.fonteUrl !== href) {
        sugestao.fonteUrl = href;
        if (sugestao.tipoCandidato === "contratacao_publica") {
          sugestao.tipoCandidato = "painel_precos";
        }
        mudou = true;
      }
      return;
    }
    // Compra não existe no acompanhamento nem no PNCP: tira o link morto.
    if (sugestao.fonteUrl) {
      sugestao.fonteUrl = null;
      mudou = true;
    }
  };

  pendentesPorCampos.forEach((pendente, i) => aplicar(pendente, resolvidasPorCampos[i]));
  pendentesPorId.forEach((pendente, i) => aplicar(pendente, resolvidasPorId[i]));

  if (mudou) {
    await db.mensagemAssistente.update({
      where: { id: carregada.mensagem.id },
      data: { ferramentasUsadas: passos as unknown as Prisma.InputJsonValue },
    });
  }

  return { ok: true, urls };
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

type ItemParaCandidato = Prisma.ItemGetPayload<{
  select: {
    id: true;
    processoId: true;
    descricao: true;
    unidade: true;
    quantidade: true;
    caracteristicasTecnicas: true;
    natureza: true;
  };
}>;

/** Item de destino + checagem de que ele pertence ao processo da conversa. */
async function carregarItemParaCandidato(
  itemId: string,
  processoIdEscopo: string | null,
): Promise<{ ok: true; item: ItemParaCandidato } | { ok: false; mensagem: string }> {
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
  if (processoIdEscopo && item.processoId !== processoIdEscopo) {
    return { ok: false, mensagem: "Este item pertence a outro processo." };
  }
  return { ok: true, item };
}

type MensagemComConversa = Prisma.MensagemAssistenteGetPayload<{
  select: {
    id: true;
    ferramentasUsadas: true;
    conversa: { select: { id: true; userId: true; processoId: true } };
  };
}>;

/**
 * Carrega a mensagem onde uma busca do assistente foi gravada, checando que
 * ela pertence ao usuário — sem isto, qualquer usuário autenticado agiria
 * sobre um candidato de conversa alheia só chutando o id da mensagem.
 */
async function carregarMensagemDoUsuario(
  mensagemId: string,
  userId: string,
): Promise<{ ok: true; mensagem: MensagemComConversa } | { ok: false; mensagem: string }> {
  const registro = await db.mensagemAssistente.findUnique({
    where: { id: mensagemId },
    select: {
      id: true,
      ferramentasUsadas: true,
      conversa: { select: { id: true, userId: true, processoId: true } },
    },
  });
  if (!registro || registro.conversa.userId !== userId) {
    return { ok: false, mensagem: "Sugestão não encontrada nesta conversa." };
  }
  return { ok: true, mensagem: registro };
}

/**
 * Grava um candidato (já com preço, órgão e data resolvidos pelo servidor —
 * nunca pelo navegador) como `ResultadoSimilaridade` de um item, com as
 * mesmas três garantias em qualquer caminho de entrada: janela de recência da
 * IN 65/2021 pela natureza do item, score recalculado pela IA e auditoria.
 *
 * Compartilhado por `adicionarCandidatoSugerido` (candidato já sugerido pela
 * busca) e `adicionarItemDaContratacao` (item irmão, buscado sob demanda) —
 * extraído para que as duas garantias de conformidade não corram o risco de
 * divergir por terem sido escritas duas vezes.
 */
async function registrarCandidatoNoItem(params: {
  candidato: CandidatoSimilaridade;
  item: ItemParaCandidato;
  userId: string;
  conversaId: string;
  mensagemId: string;
  candidatoId: string;
  termoBuscaUsado: string;
}): Promise<ResultadoAprovacao> {
  const { candidato, item, userId, conversaId, mensagemId, candidatoId, termoBuscaUsado } = params;

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
  if (candidato.fonteUrl) {
    const jaExiste = await db.resultadoSimilaridade.findFirst({
      where: { itemId: item.id, fonteUrl: candidato.fonteUrl },
      select: { id: true, descartado: true },
    });
    if (jaExiste && !jaExiste.descartado) {
      return { ok: false, mensagem: "Esta contratação já está na lista deste item." };
    }
    if (jaExiste) idParaReviver = jaExiste.id;
  }

  // ── 1. Validar recência com a janela da natureza cadastrada do item ───────
  const janelaDias = janelaContratacaoPublica(item.natureza);
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
    conversaId,
    termoBuscaUsado,
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
    userId,
    processoId: item.processoId,
    acao: "assistente_adicionar_candidato",
    detalhes: {
      itemId: item.id,
      conversaId,
      mensagemId,
      candidatoId,
      naturezaObjeto: item.natureza,
      janelaDias,
      termoBuscaUsado,
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

/**
 * Adiciona à lista do processo um candidato que o assistente encontrou.
 *
 * É o único caminho de escrita do assistente, e ele começa num clique humano —
 * o modelo propõe, o servidor decide. Três garantias que não dependem do
 * navegador (ver `registrarCandidatoNoItem`): o preço vem da mensagem
 * gravada, não do corpo da requisição; o score é recalculado pelo provedor de
 * IA; e a janela de recência respeita a natureza cadastrada do item.
 */
export async function adicionarCandidatoSugerido(
  entrada: z.input<typeof aprovarSchema>,
): Promise<ResultadoAprovacao> {
  // Mesma exigência de papel da promoção a fonte: adicionar candidato mexe na
  // instrução do processo.
  const user = await requireRole("pesquisa");
  const { mensagemId, candidatoId, itemId } = aprovarSchema.parse(entrada);

  const cargaMensagem = await carregarMensagemDoUsuario(mensagemId, user.id);
  if (!cargaMensagem.ok) return { ok: false, mensagem: cargaMensagem.mensagem };
  const { mensagem } = cargaMensagem;

  const sugestao = acharSugestao(mensagem.ferramentasUsadas, candidatoId);
  if (!sugestao) {
    return { ok: false, mensagem: "Este candidato não está mais disponível nesta busca." };
  }

  const cargaItem = await carregarItemParaCandidato(itemId, mensagem.conversa.processoId);
  if (!cargaItem.ok) return { ok: false, mensagem: cargaItem.mensagem };

  return registrarCandidatoNoItem({
    candidato: paraCandidato(sugestao),
    item: cargaItem.item,
    userId: user.id,
    conversaId: mensagem.conversa.id,
    mensagemId: mensagem.id,
    candidatoId,
    termoBuscaUsado: sugestao.termoBuscaUsado,
  });
}

// ---------------------------------------------------------------------------
// Outros itens da mesma contratação (picker de itens-irmãos no card)
// ---------------------------------------------------------------------------

const listarItensContratacaoSchema = z.object({
  mensagemId: z.string().min(1),
  candidatoId: z.string().min(1),
});

export interface ItemIrmaoDaContratacao {
  numeroItem: number;
  descricao: string;
  valorUnitario: number;
  /** ISO — `Json` não guarda `Date`. */
  dataReferencia: string;
  unidade: string;
  quantidade: number;
}

export interface ResultadoListagemContratacao {
  ok: boolean;
  mensagem?: string;
  itens: ItemIrmaoDaContratacao[];
  /** `true` quando a contratação tem mais itens do que os listados. */
  truncado: boolean;
}

/**
 * Lista os demais itens da mesma contratação (edital) de um candidato do
 * assistente — o ranqueamento por relevância em `buscarContratosPNCP`
 * descarta, em silêncio, os itens da compra que não ficaram entre os mais
 * aderentes ao termo buscado, mesmo quando um deles é o que o analista
 * precisa para outro item do TR.
 *
 * Só existe para candidatos com `identidadeContratacao` (hoje, só PNCP) — o
 * card não oferece o botão para os demais tipos.
 */
export async function listarOutrosItensDaContratacao(
  entrada: z.input<typeof listarItensContratacaoSchema>,
): Promise<ResultadoListagemContratacao> {
  const user = await requireRole("pesquisa");
  const { mensagemId, candidatoId } = listarItensContratacaoSchema.parse(entrada);

  const cargaMensagem = await carregarMensagemDoUsuario(mensagemId, user.id);
  if (!cargaMensagem.ok) return { ok: false, mensagem: cargaMensagem.mensagem, itens: [], truncado: false };
  const { mensagem } = cargaMensagem;

  const sugestao = acharSugestao(mensagem.ferramentasUsadas, candidatoId);
  if (!sugestao) {
    return {
      ok: false,
      mensagem: "Este candidato não está mais disponível nesta busca.",
      itens: [],
      truncado: false,
    };
  }
  const identidade = identidadeDaContratacao(sugestao);
  if (!identidade) {
    return {
      ok: false,
      mensagem: "Este candidato não tem identidade PNCP estruturada — não é possível listar outros itens dele.",
      itens: [],
      truncado: false,
    };
  }

  const { candidatos, completo } = await listarItensDaCompraPNCP(identidade, sugestao.fonteOrgaoOuId);

  // O item que já é o card não entra na lista de "outros" — só dá para saber
  // qual é quando a sugestão tem `identidadeContratacao` estruturada (busca
  // feita depois deste campo existir). Sem ela (candidato antigo, identidade
  // só derivada do fonteUrl), o próprio item pode aparecer duplicado na
  // lista — inofensivo, o pior caso é o analista ver a mesma opção duas vezes.
  const numeroItemOriginal = sugestao.identidadeContratacao?.numeroItem;
  const itens = candidatos
    .filter((c) => c.identidadeContratacao?.numeroItem !== numeroItemOriginal)
    .map((c) => ({
      numeroItem: c.identidadeContratacao!.numeroItem,
      descricao: c.fonteDescricao,
      valorUnitario: c.valorUnitario,
      dataReferencia: c.dataReferencia.toISOString(),
      unidade: c.unidade,
      quantidade: c.quantidade,
    }));

  return { ok: true, itens, truncado: !completo };
}

const adicionarItemContratacaoSchema = z.object({
  mensagemId: z.string().min(1),
  /** Candidato original do card — é dele que vem cnpj/ano/sequencial da contratação. */
  candidatoId: z.string().min(1),
  /** Número do item irmão escolhido no picker; só uma chave de busca, nunca o preço. */
  numeroItem: z.number().int().positive(),
  itemId: z.string().min(1),
});

/**
 * Adiciona à lista de um item do processo um item IRMÃO do candidato do card
 * — outro item da mesma contratação, que o analista escolheu no picker de
 * "outros itens desta licitação".
 *
 * `numeroItem` viaja do navegador só como chave de busca (qual item pedir ao
 * PNCP), nunca como preço: o valor, a data e a descrição são buscados de novo
 * no servidor a partir dele, igual a `adicionarCandidatoSugerido` — a
 * invariante do M13 ("nem o modelo, nem o cliente, digitam um preço") vale
 * também aqui.
 */
export async function adicionarItemDaContratacao(
  entrada: z.input<typeof adicionarItemContratacaoSchema>,
): Promise<ResultadoAprovacao> {
  const user = await requireRole("pesquisa");
  const { mensagemId, candidatoId, numeroItem, itemId } = adicionarItemContratacaoSchema.parse(entrada);

  const cargaMensagem = await carregarMensagemDoUsuario(mensagemId, user.id);
  if (!cargaMensagem.ok) return { ok: false, mensagem: cargaMensagem.mensagem };
  const { mensagem } = cargaMensagem;

  const sugestao = acharSugestao(mensagem.ferramentasUsadas, candidatoId);
  if (!sugestao) {
    return { ok: false, mensagem: "Este candidato não está mais disponível nesta busca." };
  }
  const identidade = identidadeDaContratacao(sugestao);
  if (!identidade) {
    return {
      ok: false,
      mensagem: "Este candidato não tem identidade PNCP estruturada — não é possível buscar outros itens dele.",
    };
  }

  const cargaItem = await carregarItemParaCandidato(itemId, mensagem.conversa.processoId);
  if (!cargaItem.ok) return { ok: false, mensagem: cargaItem.mensagem };

  const { candidatos } = await listarItensDaCompraPNCP(identidade, sugestao.fonteOrgaoOuId);
  const candidato = candidatos.find((c) => c.identidadeContratacao?.numeroItem === numeroItem);
  if (!candidato) {
    return {
      ok: false,
      mensagem:
        "Não foi possível obter o preço homologado deste item no PNCP agora (sem julgamento, cancelado ou data implausível). Tente novamente em instantes.",
    };
  }

  return registrarCandidatoNoItem({
    candidato,
    item: cargaItem.item,
    userId: user.id,
    conversaId: mensagem.conversa.id,
    mensagemId: mensagem.id,
    candidatoId: `${candidatoId}:${numeroItem}`,
    termoBuscaUsado: sugestao.termoBuscaUsado,
  });
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

  const cargaMensagem = await carregarMensagemDoUsuario(mensagemId, user.id);
  if (!cargaMensagem.ok) return { ok: false, mensagem: cargaMensagem.mensagem };
  const { mensagem } = cargaMensagem;

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
