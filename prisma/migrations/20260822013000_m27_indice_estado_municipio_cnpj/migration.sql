-- M27: índice composto que cobre filtro + ordenação da busca de candidatos.
--
-- `buscarCandidatosCnpj` filtra por `(estado, municipio)` e ordena/pagina por
-- `cnpj`. Com índice apenas em `(estado, municipio)`, o planner do Postgres
-- preferia percorrer o índice unique de `cnpj` (que já entrega as linhas na
-- ordem pedida, evitando o sort) e filtrar município linha a linha. Em 8,66M
-- linhas isso significava varrer milhões de tuplas para juntar 51 resultados,
-- e a query era cancelada por `statement_timeout` (SQLSTATE 57014) — a tela
-- `/fornecedores/descobrir` ficava presa no skeleton em produção.
--
-- Com `cnpj` no fim do índice, o mesmo SELECT resolve por Index Scan em ~1ms.
--
-- O índice `(estado, municipio)` vira redundante: o prefixo do índice composto
-- atende as mesmas buscas, então mantê-lo só custaria disco e escrita.
--
-- NOTA OPERACIONAL: em produção este índice já foi criado manualmente com
-- CREATE INDEX CONCURRENTLY (2026-08-22), para não bloquear a tabela durante a
-- construção. O `IF NOT EXISTS` abaixo torna esta migration idempotente nesse
-- ambiente; em bancos novos ela cria o índice normalmente.
CREATE INDEX IF NOT EXISTS "empresas_candidatas_fornecedor_estado_municipio_cnpj_idx"
  ON "empresas_candidatas_fornecedor" ("estado", "municipio", "cnpj");

DROP INDEX IF EXISTS "empresas_candidatas_fornecedor_estado_municipio_idx";
