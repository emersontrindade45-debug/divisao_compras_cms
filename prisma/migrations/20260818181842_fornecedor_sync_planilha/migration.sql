-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "emailsAdicionais" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "origemPlanilhaAtualizadoEm" TIMESTAMP(3),
ADD COLUMN     "origemPlanilhaFonte" TEXT,
ADD COLUMN     "origemPlanilhaLinhaId" TEXT,
ALTER COLUMN "cnpj" DROP NOT NULL,
ALTER COLUMN "cidade" SET DEFAULT '',
ALTER COLUMN "estado" SET DEFAULT '',
ALTER COLUMN "responsavelContato" SET DEFAULT '',
ALTER COLUMN "email" SET DEFAULT '';

-- CreateTable
CREATE TABLE "sincronizacoes_fornecedores" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "linhasLidas" INTEGER NOT NULL DEFAULT 0,
    "linhasCriadas" INTEGER NOT NULL DEFAULT 0,
    "linhasAtualizadas" INTEGER NOT NULL DEFAULT 0,
    "linhasDesativadas" INTEGER NOT NULL DEFAULT 0,
    "linhasRejeitadas" INTEGER NOT NULL DEFAULT 0,
    "detalhes" JSONB,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "erro" TEXT,

    CONSTRAINT "sincronizacoes_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sincronizacoes_fornecedores_origem_iniciadoEm_idx" ON "sincronizacoes_fornecedores"("origem", "iniciadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_origemPlanilhaLinhaId_key" ON "fornecedores"("origemPlanilhaLinhaId");

