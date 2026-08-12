-- CreateEnum
CREATE TYPE "OperacaoAjusteValor" AS ENUM ('divisao', 'multiplicacao', 'soma');

-- CreateEnum
CREATE TYPE "PeriodicidadeContrato" AS ENUM ('mensal', 'anual', 'meses_12', 'meses_18', 'meses_24', 'meses_36', 'meses_48', 'meses_60');

-- AlterTable
ALTER TABLE "resultados_similaridade" ADD COLUMN     "ajusteOperacao" "OperacaoAjusteValor",
ADD COLUMN     "ajustePeriodicidade" "PeriodicidadeContrato",
ADD COLUMN     "ajusteQuantidade" DECIMAL(14,4),
ADD COLUMN     "ajusteQuantidadeTR" DECIMAL(14,4),
ADD COLUMN     "ajusteUnidadeMedida" TEXT,
ADD COLUMN     "ajusteValorBase" DECIMAL(14,2),
ADD COLUMN     "valorUnitarioAjustado" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "precos_consolidados" ADD COLUMN     "resultadoSimilaridadeId" TEXT;

-- CreateIndex
CREATE INDEX "precos_consolidados_resultadoSimilaridadeId_idx" ON "precos_consolidados"("resultadoSimilaridadeId");

-- AddForeignKey
ALTER TABLE "precos_consolidados" ADD CONSTRAINT "precos_consolidados_resultadoSimilaridadeId_fkey" FOREIGN KEY ("resultadoSimilaridadeId") REFERENCES "resultados_similaridade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: liga os preços já consolidados ao candidato de similaridade que os
-- originou. Sem isto, corrigir o valor de um candidato promovido ANTES desta
-- migration não alcançaria a linha correspondente da série de preços — a tela
-- ofereceria um ajuste que só metade do sistema enxergaria.
-- O casamento usa os campos que `promoverResultadoSimilaridade` copiou da Fonte
-- para o PrecoConsolidado; `DISTINCT ON` garante uma origem por linha mesmo se
-- dois candidatos coincidirem em órgão, descrição, data e valor.
UPDATE "precos_consolidados" pc
SET "resultadoSimilaridadeId" = origem."resultadoSimilaridadeId"
FROM (
  SELECT DISTINCT ON (pc2.id)
    pc2.id AS preco_id,
    f."resultadoSimilaridadeId"
  FROM "precos_consolidados" pc2
  JOIN "series_precos" sp ON sp.id = pc2."seriePrecoId"
  JOIN "fontes" f
    ON f."itemId" = sp."itemId"
   AND f."resultadoSimilaridadeId" IS NOT NULL
   AND f.descricao = pc2."descricaoFonte"
   AND f."orgaoOuFornecedor" = pc2."fornecedorOuOrgao"
   AND f."dataReferencia" = pc2."dataReferencia"
   AND f."valorUnitario" = pc2."valorUnitario"
  ORDER BY pc2.id, f."createdAt" ASC
) AS origem
WHERE pc.id = origem.preco_id;
