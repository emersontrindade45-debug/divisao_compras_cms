-- CreateEnum
CREATE TYPE "BaseValorSerie" AS ENUM ('unitario', 'projetado_tr');

-- AlterTable
ALTER TABLE "resultados_similaridade" ADD COLUMN     "ajusteBaseSerie" "BaseValorSerie",
ADD COLUMN     "valorConsiderado" DECIMAL(12,2);

-- Backfill: os ajustes gravados antes desta coluna existir levavam sempre o
-- resultado do cálculo para a série — que é exatamente a base `unitario`.
-- Sem isto, `valorUnitarioEfetivo` passaria a ler `valorConsiderado` nulo e o
-- candidato voltaria silenciosamente a valer pelo valor cru da fonte.
UPDATE "resultados_similaridade"
SET "valorConsiderado" = "valorUnitarioAjustado",
    "ajusteBaseSerie" = 'unitario'
WHERE "valorUnitarioAjustado" IS NOT NULL;
