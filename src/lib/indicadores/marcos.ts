import "server-only";
import type { Prisma } from "@prisma/client";
import { marcosAtingidos } from "@/lib/domain/indicadores/marcos";

/**
 * Grava os marcos de tempo do processo (M30.0) que o estado atual já atinge e
 * que ainda não estavam gravados.
 *
 * Chamar DENTRO da transação que inclui o preço, depois da escrita: assim o
 * instante gravado é o da inclusão, e um rollback leva o marco junto. A guarda
 * "só se ainda nulo" é o `where` do `updateMany` (CLAUDE.md §9.14) — duas
 * transações concorrentes não sobrescrevem o primeiro instante.
 */
export async function registrarMarcosProcesso(
  tx: Prisma.TransactionClient,
  processoId: string,
  agora: Date = new Date(),
): Promise<void> {
  const porSerie = await tx.precoConsolidado.groupBy({
    by: ["seriePrecoId"],
    where: { status: "incluido", seriePreco: { item: { processoId } } },
    _count: { _all: true },
  });

  const contagens = porSerie.map((g) => g._count._all);
  const marcos = marcosAtingidos({
    totalIncluidos: contagens.reduce((a, b) => a + b, 0),
    maiorSerieIncluidos: contagens.length > 0 ? Math.max(...contagens) : 0,
  });

  if (marcos.primeiraReferencia) {
    await tx.processo.updateMany({
      where: { id: processoId, primeiraReferenciaEm: null },
      data: { primeiraReferenciaEm: agora },
    });
  }
  if (marcos.serieMinima) {
    await tx.processo.updateMany({
      where: { id: processoId, serieMinimaEm: null },
      data: { serieMinimaEm: agora },
    });
  }
}

/**
 * Grava a data de resposta da cotação na primeira vez que ela sai de
 * `silenciosa`. Mesma guarda atômica dos marcos do processo.
 */
export async function registrarRespostaCotacao(
  tx: Prisma.TransactionClient,
  cotacaoId: string,
  agora: Date = new Date(),
): Promise<void> {
  await tx.cotacao.updateMany({
    where: { id: cotacaoId, dataResposta: null },
    data: { dataResposta: agora },
  });
}
