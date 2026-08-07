-- CreateEnum
CREATE TYPE "EsferaGoverno" AS ENUM ('federal', 'estadual', 'municipal');

-- AlterEnum
ALTER TYPE "TipoCandidatoSimilaridade" ADD VALUE 'preco_referencia';

-- CreateTable
CREATE TABLE "fontes_referencia" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "esfera" "EsferaGoverno" NOT NULL,
    "baseLegal" TEXT,
    "urlOficial" TEXT NOT NULL,
    "periodicidade" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fontes_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_ingestao" (
    "id" TEXT NOT NULL,
    "fonteReferenciaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "urlArquivo" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "linhasLidas" INTEGER NOT NULL DEFAULT 0,
    "linhasImportadas" INTEGER NOT NULL DEFAULT 0,
    "linhasRejeitadas" INTEGER NOT NULL DEFAULT 0,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "erro" TEXT,

    CONSTRAINT "lotes_ingestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precos_referencia" (
    "id" TEXT NOT NULL,
    "fonteReferenciaId" TEXT NOT NULL,
    "loteIngestaoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "descricaoNormalizada" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "competencia" TEXT NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "uf" TEXT NOT NULL DEFAULT '',
    "urlEvidencia" TEXT,
    "metadados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precos_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fontes_referencia_chave_key" ON "fontes_referencia"("chave");

-- CreateIndex
CREATE INDEX "lotes_ingestao_fonteReferenciaId_idx" ON "lotes_ingestao"("fonteReferenciaId");

-- CreateIndex
CREATE INDEX "precos_referencia_fonteReferenciaId_competencia_idx" ON "precos_referencia"("fonteReferenciaId", "competencia");

-- CreateIndex
CREATE INDEX "precos_referencia_descricaoNormalizada_idx" ON "precos_referencia"("descricaoNormalizada");

-- CreateIndex
CREATE UNIQUE INDEX "precos_referencia_fonteReferenciaId_codigo_competencia_uf_key" ON "precos_referencia"("fonteReferenciaId", "codigo", "competencia", "uf");

-- AddForeignKey
ALTER TABLE "lotes_ingestao" ADD CONSTRAINT "lotes_ingestao_fonteReferenciaId_fkey" FOREIGN KEY ("fonteReferenciaId") REFERENCES "fontes_referencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_referencia" ADD CONSTRAINT "precos_referencia_fonteReferenciaId_fkey" FOREIGN KEY ("fonteReferenciaId") REFERENCES "fontes_referencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_referencia" ADD CONSTRAINT "precos_referencia_loteIngestaoId_fkey" FOREIGN KEY ("loteIngestaoId") REFERENCES "lotes_ingestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
