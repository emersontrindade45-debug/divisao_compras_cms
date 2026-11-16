-- M30.0: dados de origem confiáveis para as métricas do dashboard.
--
-- Aditiva (expand): só colunas novas, nulas ou com default. O código antigo
-- continua funcionando com elas presentes, então a migration pode — e deve —
-- ser aplicada ANTES do deploy do código que as lê (CLAUDE.md §9.19, §9.46).

-- CreateEnum
CREATE TYPE "OrigemDataAbertura" AS ENUM ('informada', 'importacao');

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "dataAberturaOrigem" "OrigemDataAbertura" NOT NULL DEFAULT 'informada',
ADD COLUMN     "marcosIncertos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primeiraReferenciaEm" TIMESTAMP(3),
ADD COLUMN     "responsavelId" TEXT,
ADD COLUMN     "serieMinimaEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "cotacoes" ADD COLUMN     "dataResposta" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "processos_responsavelId_idx" ON "processos"("responsavelId");

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill 1 — todo processo existente nasceu pela sincronização da planilha
-- (não há outro caminho de criação), com `dataAbertura = now()` da importação
-- e sem marcos gravados. Nada disso é prova de quando a pesquisa aconteceu:
-- marcar como importação e marcos incertos, para ficar FORA das métricas de
-- tempo em vez de entrar com tempo inventado.
UPDATE "processos" SET "dataAberturaOrigem" = 'importacao', "marcosIncertos" = true;

-- Backfill 2 — responsável: só quando o texto casa EXATAMENTE (sem caixa e
-- espaço nas pontas) com o nome de um usuário. "Importado da planilha" e
-- grafias diferentes ficam nulos ("sem responsável" — atribuir na tela).
UPDATE "processos" p
SET "responsavelId" = u."id"
FROM "users" u
WHERE lower(btrim(p."responsavel")) = lower(btrim(u."name"))
  AND (SELECT count(*) FROM "users" u2 WHERE lower(btrim(u2."name")) = lower(btrim(u."name"))) = 1;

-- Backfill 3 — data de resposta: só o que a trilha de auditoria prova. A
-- primeira mudança de status para fora de `silenciosa`, ou o primeiro registro
-- de proposta (proposta implica resposta), o que vier antes.
UPDATE "cotacoes" c
SET "dataResposta" = sub.primeira
FROM (
  SELECT "cotacaoId", min("createdAt") AS primeira
  FROM "audit_logs"
  WHERE "cotacaoId" IS NOT NULL
    AND (
      ("acao" = 'atualizar_cotacao' AND "detalhes"->>'statusNovo' IN ('positiva', 'negativa', 'incompleta'))
      OR "acao" = 'registrar_proposta'
    )
  GROUP BY "cotacaoId"
) sub
WHERE c."id" = sub."cotacaoId"
  AND c."status" <> 'silenciosa';
