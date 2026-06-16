-- CreateEnum
CREATE TYPE "TipoCandidatoSimilaridade" AS ENUM ('contratacao_publica', 'painel_precos');

-- CreateTable
CREATE TABLE "resultados_similaridade" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tipoCandidato" "TipoCandidatoSimilaridade" NOT NULL,
    "fonteDescricao" TEXT NOT NULL,
    "fonteOrgaoOuId" TEXT NOT NULL,
    "fonteUrl" TEXT,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "scoreFinal" DECIMAL(5,2) NOT NULL,
    "scoreDescricao" DECIMAL(5,2) NOT NULL,
    "scoreEspecificacao" DECIMAL(5,2) NOT NULL,
    "scoreUnidadeQuantidade" DECIMAL(5,2) NOT NULL,
    "adaptado" BOOLEAN NOT NULL DEFAULT false,
    "justificativa" TEXT NOT NULL,
    "promovidoParaFonte" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resultados_similaridade_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "resultados_similaridade" ADD CONSTRAINT "resultados_similaridade_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
