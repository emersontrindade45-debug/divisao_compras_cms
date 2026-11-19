import "server-only";
import { db } from "@/lib/db";
import { MOTIVOS_SEM_FORNECEDOR } from "./encerrarNaoResposta";

/**
 * Classificação, pela IA, das respostas SEM fornecedor ligado (M30.d): cada uma entra na sua
 * categoria (recusa, orçamento ou dúvida) e conta no dashboard, mas nenhuma consulta muda — não se
 * sabe quem respondeu (medido: o texto traz o nome em 5 de 192; o domínio aponta um fornecedor em
 * 8 de 144). A classificação fica na própria linha da IA (`aplicadaEm` com `consultaId` nulo), então
 * o "Desfazer" da aba "Aplicadas pela IA" a reabre.
 *
 * Os ids saem SEMPRE do banco. Só confiança "alta".
 */
export const CLASSES_SEM_FORNECEDOR = ["orcamento", "recusa", "duvida"] as const;

export interface AlvoSemFornecedor {
  pendenteId: string;
  gmailMensagemId: string;
  classe: string;
}

export async function listarClassificaveisSemFornecedor(): Promise<AlvoSemFornecedor[]> {
  const abertas = await db.respostaEmailPendente.findMany({
    where: { resolvidaEm: null, sugestaoConsultaId: null, motivo: { in: [...MOTIVOS_SEM_FORNECEDOR] } },
    select: { id: true, gmailMensagemId: true },
  });
  if (abertas.length === 0) return [];
  const ias = await db.classificacaoIaResposta.findMany({
    where: {
      gmailMensagemId: { in: abertas.map((a) => a.gmailMensagemId) },
      classeIa: { in: [...CLASSES_SEM_FORNECEDOR] },
      confianca: "alta",
      aplicadaEm: null,
      desfeitaEm: null,
    },
    select: { gmailMensagemId: true, classeIa: true },
  });
  const classe = new Map(ias.map((i) => [i.gmailMensagemId, i.classeIa]));
  return abertas
    .filter((a) => classe.has(a.gmailMensagemId))
    .map((a) => ({ pendenteId: a.id, gmailMensagemId: a.gmailMensagemId, classe: classe.get(a.gmailMensagemId) as string }));
}

/**
 * Atômico por resposta (§9.14): primeiro a fila é fechada com `resolvidaEm: null` no WHERE; só se
 * ESTE clique a fechou a linha da IA é marcada. Resposta que o analista resolveu no meio-tempo
 * (por exemplo digitando o e-mail, que a liga a uma consulta) nunca é contada duas vezes.
 */
/**
 * Respostas por transação. O padrão do Prisma para transação interativa é 5 s, e cada resposta são
 * 2–3 consultas pelo pooler do Supabase (~100 ms cada): 25 por bloco estourava o prazo e a transação
 * inteira era desfeita — o botão dava erro e NADA era gravado (2026-11-19). 10 por bloco + prazo
 * explícito dá folga de ~10x.
 */
export const RESPOSTAS_POR_TRANSACAO = 10;
export const OPCOES_TRANSACAO = { timeout: 20_000, maxWait: 5_000 } as const;

export async function classificarSemFornecedorEmLote(): Promise<{
  alvos: AlvoSemFornecedor[];
  feitas: AlvoSemFornecedor[];
  /** Blocos que falharam: ficam na fila, para um novo clique, e não derrubam os demais. */
  blocosComFalha: number;
}> {
  const alvos = await listarClassificaveisSemFornecedor();
  const feitas: AlvoSemFornecedor[] = [];
  let blocosComFalha = 0;
  for (let i = 0; i < alvos.length; i += RESPOSTAS_POR_TRANSACAO) {
    const bloco = alvos.slice(i, i + RESPOSTAS_POR_TRANSACAO);
    try {
      const doBloco: AlvoSemFornecedor[] = [];
      await db.$transaction(async (tx) => {
        for (const a of bloco) {
          const fila = await tx.respostaEmailPendente.updateMany({
            where: { id: a.pendenteId, resolvidaEm: null },
            data: { resolvidaEm: new Date() },
          });
          if (fila.count === 0) continue;
          const ia = await tx.classificacaoIaResposta.updateMany({
            where: { gmailMensagemId: a.gmailMensagemId, aplicadaEm: null, desfeitaEm: null },
            data: { aplicadaEm: new Date() },
          });
          if (ia.count === 0) {
            // A linha da IA mudou: não deixa a fila fechada sem classificação.
            await tx.respostaEmailPendente.updateMany({ where: { id: a.pendenteId }, data: { resolvidaEm: null } });
            continue;
          }
          doBloco.push(a);
        }
      }, OPCOES_TRANSACAO);
      // Só conta o que a transação CONFIRMOU: se ela for desfeita, nada entra em `feitas`.
      feitas.push(...doBloco);
    } catch {
      blocosComFalha += 1;
    }
  }
  return { alvos, feitas, blocosComFalha };
}
