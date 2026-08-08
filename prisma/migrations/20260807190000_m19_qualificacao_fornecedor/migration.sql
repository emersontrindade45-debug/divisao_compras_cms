-- CreateEnum
CREATE TYPE "StatusQualificacao" AS ENUM ('regular', 'sancionado', 'cadastro_irregular', 'nao_verificado');

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN "statusQualificacao" "StatusQualificacao" NOT NULL DEFAULT 'nao_verificado';

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN "statusQualificacaoFornecedor" "StatusQualificacao";

-- CreateTable
CREATE TABLE "qualificacoes_fornecedores" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "dataConsulta" TIMESTAMP(3) NOT NULL,
    "statusQualificacao" "StatusQualificacao" NOT NULL,
    "consultaNegada" BOOLEAN NOT NULL DEFAULT false,
    "sancoesEncontradas" JSONB,
    "situacaoCadastral" TEXT,
    "motivoNegacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualificacoes_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qualificacoes_fornecedores_fornecedorId_dataConsulta_idx" ON "qualificacoes_fornecedores"("fornecedorId", "dataConsulta");

-- AddForeignKey
ALTER TABLE "qualificacoes_fornecedores" ADD CONSTRAINT "qualificacoes_fornecedores_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
