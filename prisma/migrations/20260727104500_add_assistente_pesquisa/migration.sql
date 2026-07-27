-- Assistente de pesquisa (M13).
--
-- Gerado por `prisma migrate diff` a partir do schema — não editar o SQL abaixo à mão.
--
-- ATENÇÃO ao `ALTER TYPE ... ADD VALUE` mais adiante: o runner deste projeto
-- (src/lib/migrations/aplicar.ts) executa cada migration dentro de UMA transação,
-- e o Postgres só permite `ADD VALUE` em bloco transacional a partir da versão 12.
-- O Supabase roda PG 15+, então é seguro — mas o novo valor NÃO pode ser *usado*
-- na mesma transação. Por isso esta migration não contém nenhum INSERT/UPDATE que
-- referencie 'site_eletronico'. Se um dia for preciso semear dados com esse valor,
-- fazê-lo em uma migration SEPARADA e posterior.

-- CreateEnum
CREATE TYPE "OrigemResultado" AS ENUM ('pipeline_automatico', 'assistente');

-- CreateEnum
CREATE TYPE "PapelMensagem" AS ENUM ('user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "EscopoInstrucaoPesquisa" AS ENUM ('global', 'categoria', 'processo');

-- AlterEnum
ALTER TYPE "TipoCandidatoSimilaridade" ADD VALUE 'site_eletronico';

-- AlterTable
ALTER TABLE "resultados_similaridade" ADD COLUMN     "conversaId" TEXT,
ADD COLUMN     "origem" "OrigemResultado" NOT NULL DEFAULT 'pipeline_automatico',
ADD COLUMN     "termoBuscaUsado" TEXT;

-- CreateTable
CREATE TABLE "conversas_assistente" (
    "id" TEXT NOT NULL,
    "processoId" TEXT,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversas_assistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_assistente" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "PapelMensagem" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "ferramentasUsadas" JSONB,
    "citacoes" JSONB,
    "modelo" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_assistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrucoes_pesquisa" (
    "id" TEXT NOT NULL,
    "escopo" "EscopoInstrucaoPesquisa" NOT NULL,
    "categoria" TEXT,
    "processoId" TEXT,
    "chave" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instrucoes_pesquisa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversas_assistente_processoId_idx" ON "conversas_assistente"("processoId");

-- CreateIndex
CREATE INDEX "conversas_assistente_userId_idx" ON "conversas_assistente"("userId");

-- CreateIndex
CREATE INDEX "mensagens_assistente_conversaId_idx" ON "mensagens_assistente"("conversaId");

-- CreateIndex
CREATE UNIQUE INDEX "instrucoes_pesquisa_chave_key" ON "instrucoes_pesquisa"("chave");

-- CreateIndex
CREATE INDEX "instrucoes_pesquisa_escopo_idx" ON "instrucoes_pesquisa"("escopo");

-- CreateIndex
CREATE INDEX "instrucoes_pesquisa_processoId_idx" ON "instrucoes_pesquisa"("processoId");

-- CreateIndex
CREATE INDEX "resultados_similaridade_conversaId_idx" ON "resultados_similaridade"("conversaId");

-- AddForeignKey
ALTER TABLE "resultados_similaridade" ADD CONSTRAINT "resultados_similaridade_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_assistente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_assistente" ADD CONSTRAINT "conversas_assistente_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_assistente" ADD CONSTRAINT "conversas_assistente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_assistente" ADD CONSTRAINT "mensagens_assistente_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas_assistente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrucoes_pesquisa" ADD CONSTRAINT "instrucoes_pesquisa_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrucoes_pesquisa" ADD CONSTRAINT "instrucoes_pesquisa_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
