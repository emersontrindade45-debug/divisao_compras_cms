-- CreateEnum
CREATE TYPE "FaseAndamento" AS ENUM ('nao_iniciado', 'em_andamento', 'concluido', 'em_correcao');

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "faseAndamento" "FaseAndamento" NOT NULL DEFAULT 'nao_iniciado';
