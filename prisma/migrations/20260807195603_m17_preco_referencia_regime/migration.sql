-- DropIndex
DROP INDEX "precos_referencia_fonteReferenciaId_codigo_competencia_uf_key";

-- AlterTable
ALTER TABLE "precos_referencia" ADD COLUMN     "regime" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "precos_referencia_fonteReferenciaId_codigo_competencia_uf_r_key" ON "precos_referencia"("fonteReferenciaId", "codigo", "competencia", "uf", "regime");

