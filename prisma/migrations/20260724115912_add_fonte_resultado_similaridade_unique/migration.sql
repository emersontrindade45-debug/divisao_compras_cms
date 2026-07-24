-- AlterTable
ALTER TABLE "fontes" ADD COLUMN     "resultadoSimilaridadeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "fontes_resultadoSimilaridadeId_key" ON "fontes"("resultadoSimilaridadeId");

-- AddForeignKey
ALTER TABLE "fontes" ADD CONSTRAINT "fontes_resultadoSimilaridadeId_fkey" FOREIGN KEY ("resultadoSimilaridadeId") REFERENCES "resultados_similaridade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

