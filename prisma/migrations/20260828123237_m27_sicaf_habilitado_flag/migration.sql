-- AlterTable
ALTER TABLE "empresas_candidatas_fornecedor" ADD COLUMN     "sicafAtualizadoEm" TIMESTAMP(3),
ADD COLUMN     "sicafHabilitado" BOOLEAN NOT NULL DEFAULT false;
