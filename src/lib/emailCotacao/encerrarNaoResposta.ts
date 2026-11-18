import "server-only";
import { db } from "@/lib/db";

/**
 * Encerramento em lote das respostas SEM fornecedor ligado que a IA leu como "não é resposta"
 * (M30.d): nenhuma consulta é afetada — só a fila é limpa. Medido: o texto anonimizado quase nunca
 * traz o nome da empresa (5 de 192 ligáveis), então para estas o único destino possível é fechar.
 *
 * Os ids saem SEMPRE do banco, nunca do cliente: o clique não pode escolher o que será encerrado.
 */
export const MOTIVOS_SEM_FORNECEDOR = ["remetente_desconhecido", "dominio_ambiguo", "dominio_generico"] as const;

/** Só confiança "alta": uma resposta de fornecedor lida como lixo com dúvida fica na fila. */
export async function listarEncerraveisNaoResposta(): Promise<string[]> {
  const abertas = await db.respostaEmailPendente.findMany({
    where: { resolvidaEm: null, sugestaoConsultaId: null, motivo: { in: [...MOTIVOS_SEM_FORNECEDOR] } },
    select: { id: true, gmailMensagemId: true },
  });
  if (abertas.length === 0) return [];
  const ias = await db.classificacaoIaResposta.findMany({
    where: {
      gmailMensagemId: { in: abertas.map((a) => a.gmailMensagemId) },
      classeIa: "nao_e_resposta",
      confianca: "alta",
    },
    select: { gmailMensagemId: true },
  });
  const ok = new Set(ias.map((i) => i.gmailMensagemId));
  return abertas.filter((a) => ok.has(a.gmailMensagemId)).map((a) => a.id);
}

export interface ResultadoEncerramento {
  encerradas: number;
}

/** Atômico (§9.14): `resolvidaEm: null` no WHERE — o que o analista já resolveu não é tocado. */
export async function encerrarNaoRespostaEmLote(): Promise<{ ids: string[]; encerradas: number }> {
  const ids = await listarEncerraveisNaoResposta();
  if (ids.length === 0) return { ids: [], encerradas: 0 };
  const r = await db.respostaEmailPendente.updateMany({
    where: { id: { in: ids }, resolvidaEm: null },
    data: { resolvidaEm: new Date() },
  });
  return { ids, encerradas: r.count };
}
