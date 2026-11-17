-- Ordem do item no Termo de Referência (a mesma das linhas da planilha do processo).
--
-- Aditiva (expand): coluna nula. O código antigo continua funcionando com ela presente, então a
-- migration deve ser aplicada ANTES do deploy do código que a lê (CLAUDE.md §9.19, §9.46).
--
-- Sem a coluna, a ordem dos cards dependia de `createdAt`: um item recriado pela sincronização
-- (descrição editada na planilha) ia parar no FIM da lista, fora do lugar que tem no TR.

-- AlterTable
ALTER TABLE "itens" ADD COLUMN "ordem" INTEGER;

-- Preenche os itens que já existem pela ordem de criação (a ordem em que a planilha foi lida),
-- por processo. A próxima sincronização de cada planilha regrava a ordem pela planilha.
UPDATE "itens" AS i
SET "ordem" = t.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "processoId" ORDER BY "createdAt", "id") AS rn
  FROM "itens"
) AS t
WHERE t."id" = i."id";
