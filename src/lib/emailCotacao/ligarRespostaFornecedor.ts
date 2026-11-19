import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DOMINIOS_GENERICOS } from "@/lib/domain/cotacaoEmail/ligarResposta";
import { linkDoGmail } from "@/lib/domain/cotacaoEmail/gmail";
import { CLASSES_SEM_FORNECEDOR } from "./classificarSemFornecedor";
import { REGRA_IA } from "./aplicarIa";

/**
 * Ligação rápida (M30.d): o analista diz QUAL fornecedor de um envio escreveu uma resposta que a IA
 * já classificou, mas que o sistema não soube ligar (o remetente não era um dos destinatários e o
 * texto não traz o nome — medido em 2026-11-19: CNPJ no corpo em 1 de 146).
 *
 * A ligação faz o MESMO que `aplicarClassificacaoIa` e deixa a linha da IA no formato que o
 * "Desfazer" já entende (`situacaoAnterior`, `dataRespostaDefinida`, consulta com `regra = "ia"` e
 * `gmailRespostaId` desta mensagem). Por isso desfazer uma ligação errada não precisa de código novo.
 *
 * Regras de segurança:
 *  - O `envioId` NUNCA vem do cliente: sai da fila, pela mensagem. A consulta escolhida tem de ser
 *    DESSE envio — não dá para ligar uma resposta ao fornecedor de outro processo.
 *  - Atômica (§9.14): a linha da IA só é ligada se ainda estiver "aplicada, não desfeita e sem
 *    consulta" (`updateMany` com o estado esperado no `where`). Dois cliques não ligam duas vezes.
 *  - Consulta que já tem decisão (orçamento, recusa, e-mail inválido…) NUNCA é sobrescrita; a
 *    resposta fica ligada e o resultado diz que a situação foi mantida.
 *  - Nenhum texto de e-mail passa por aqui: só ids, classe, situação e o domínio já guardado.
 */

/** Situações em que uma resposta ainda pode definir a consulta (mesma lista de `aplicarIa`). */
const SITUACOES_ABERTAS = ["sem_resposta", "a_confirmar", "duvida"] as const;
export const OPCOES_TRANSACAO_LIGACAO = { timeout: 20_000, maxWait: 5_000 } as const;
export const MAX_CANDIDATOS = 12;
const MIN_TERMO = 3;

export interface RespostaLigavel {
  gmailMensagemId: string;
  classe: "orcamento" | "recusa" | "duvida";
  justificativa: string;
  /** Só o domínio do remetente (o endereço completo nunca é guardado — Q28). */
  dominio: string;
  dominioGenerico: boolean;
  processoNumero: string | null;
  dataResposta: Date;
  linkGmail: string;
}

export interface CandidatoConsulta {
  consultaId: string;
  email: string;
  razaoSocial: string | null;
  situacao: string;
}

/**
 * As respostas que a IA classificou e o sistema não ligou a fornecedor nenhum. `select` explícito
 * (§9.46): a tabela da IA ganha colunas com o tempo.
 */
export async function listarRespostasLigaveis(): Promise<RespostaLigavel[]> {
  const ias = await db.classificacaoIaResposta.findMany({
    where: {
      consultaId: null,
      aplicadaEm: { not: null },
      desfeitaEm: null,
      classeIa: { in: [...CLASSES_SEM_FORNECEDOR] },
    },
    orderBy: { createdAt: "asc" },
    select: { gmailMensagemId: true, classeIa: true, justificativa: true },
  });
  if (ias.length === 0) return [];
  const pendentes = await db.respostaEmailPendente.findMany({
    where: { gmailMensagemId: { in: ias.map((i) => i.gmailMensagemId) } },
    select: {
      gmailMensagemId: true,
      dataResposta: true,
      remetenteDominio: true,
      envio: { select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } } },
    },
  });
  const porMsg = new Map(pendentes.map((p) => [p.gmailMensagemId, p]));
  const itens: RespostaLigavel[] = [];
  for (const ia of ias) {
    const p = porMsg.get(ia.gmailMensagemId);
    if (!p) continue; // sem a fila não há envio a que ligar
    itens.push({
      gmailMensagemId: ia.gmailMensagemId,
      classe: ia.classeIa as RespostaLigavel["classe"],
      justificativa: ia.justificativa,
      dominio: p.remetenteDominio,
      dominioGenerico: DOMINIOS_GENERICOS.has(p.remetenteDominio.toLowerCase()),
      processoNumero: p.envio.processo?.numero ?? p.envio.numeroProcessoAssunto ?? null,
      dataResposta: p.dataResposta,
      linkGmail: linkDoGmail(ia.gmailMensagemId),
    });
  }
  return itens;
}

/**
 * Candidatos a "quem respondeu": as consultas do MESMO envio. Sem termo, usa o domínio do remetente
 * (quando não é genérico — gmail.com não identifica empresa). Com termo, procura no e-mail e na
 * razão social. Devolve no máximo `MAX_CANDIDATOS`; lista vazia quando não há critério.
 */
export async function buscarCandidatosDoEnvio(
  gmailMensagemId: string,
  termo: string,
): Promise<CandidatoConsulta[] | null> {
  const pendente = await db.respostaEmailPendente.findUnique({
    where: { gmailMensagemId },
    select: { envioId: true, remetenteDominio: true },
  });
  if (!pendente) return null;

  const t = termo.trim();
  const dominio = pendente.remetenteDominio.trim().toLowerCase();
  let filtro: Prisma.ConsultaCotacaoWhereInput | null = null;
  if (t.length >= MIN_TERMO) {
    filtro = {
      OR: [
        { email: { contains: t.toLowerCase() } },
        { razaoSocial: { contains: t, mode: "insensitive" } },
      ],
    };
  } else if (t.length === 0 && dominio && !DOMINIOS_GENERICOS.has(dominio)) {
    filtro = { email: { endsWith: `@${dominio}` } };
  }
  if (!filtro) return [];

  const consultas = await db.consultaCotacao.findMany({
    where: { envioId: pendente.envioId, ...filtro },
    orderBy: { email: "asc" },
    take: MAX_CANDIDATOS,
    select: { id: true, email: true, razaoSocial: true, situacao: true },
  });
  return consultas.map((c) => ({
    consultaId: c.id,
    email: c.email,
    razaoSocial: c.razaoSocial,
    situacao: c.situacao,
  }));
}

export type ResultadoLigacao =
  | { tipo: "ligada"; aplicada: boolean; situacao: string }
  | { tipo: "erro"; mensagem: string };

class Abortar extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
  }
}

export async function ligarRespostaAConsulta(
  gmailMensagemId: string,
  consultaId: string,
): Promise<ResultadoLigacao> {
  const pendente = await db.respostaEmailPendente.findUnique({
    where: { gmailMensagemId },
    select: { envioId: true, dataResposta: true },
  });
  if (!pendente) return { tipo: "erro", mensagem: "Resposta não encontrada." };

  try {
    return await db.$transaction(async (tx) => {
      const consulta = await tx.consultaCotacao.findUnique({
        where: { id: consultaId },
        select: { envioId: true, situacao: true },
      });
      if (!consulta || consulta.envioId !== pendente.envioId) {
        throw new Abortar("Este fornecedor não pertence ao envio desta resposta.");
      }

      // 1. Liga a linha da IA, só se ainda estiver aplicada, não desfeita e sem consulta.
      const ligada = await tx.classificacaoIaResposta.updateMany({
        where: {
          gmailMensagemId,
          aplicadaEm: { not: null },
          desfeitaEm: null,
          consultaId: null,
          classeIa: { in: [...CLASSES_SEM_FORNECEDOR] },
        },
        data: { consultaId },
      });
      if (ligada.count === 0) throw new Abortar("Esta resposta já foi ligada, desfeita ou não está mais disponível.");

      // 2. A classe da IA, lida do BANCO (o clique não escolhe o desfecho).
      const ia = await tx.classificacaoIaResposta.findUnique({
        where: { gmailMensagemId },
        select: { classeIa: true },
      });
      if (!ia) throw new Abortar("Classificação da IA não encontrada.");

      // 3. Consulta aberta recebe o desfecho; já decidida fica como está.
      const aplicada = await tx.consultaCotacao.updateMany({
        where: { id: consultaId, situacao: { in: [...SITUACOES_ABERTAS] } },
        data: { situacao: ia.classeIa as "orcamento" | "recusa" | "duvida", regra: REGRA_IA, gmailRespostaId: gmailMensagemId },
      });

      let situacao = consulta.situacao as string;
      if (aplicada.count > 0) {
        situacao = ia.classeIa;
        const data = await tx.consultaCotacao.updateMany({
          where: { id: consultaId, dataResposta: null },
          data: { dataResposta: pendente.dataResposta },
        });
        // Só o que a aplicação mudou entra no "Desfazer": consulta mantida não tem o que reverter.
        await tx.classificacaoIaResposta.updateMany({
          where: { gmailMensagemId },
          data: { situacaoAnterior: consulta.situacao, dataRespostaDefinida: data.count > 0 },
        });
      }
      return { tipo: "ligada" as const, aplicada: aplicada.count > 0, situacao };
    }, OPCOES_TRANSACAO_LIGACAO);
  } catch (e) {
    if (e instanceof Abortar) return { tipo: "erro", mensagem: e.mensagem };
    throw e;
  }
}
