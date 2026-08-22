-- Índice para a contagem de empresas por CNAE (painel de aprovação de CNAEs).
--
-- Sem ele a contagem é seq scan: medido em 2,72s contra a base do VPS, lendo 400 mil páginas e
-- descartando 2,8M linhas por worker. Com o índice, 0,10s. O painel mostra a contagem ao lado de
-- cada CNAE sugerido, então esse custo apareceria a cada abertura da tela.
--
-- Parcial (`WHERE email IS NOT NULL AND email <> ''`) porque toda consulta do fluxo de cotação
-- exige e-mail — empresa sem contato não serve para consultar. Isso mantém o índice em 62 MB em
-- vez de indexar as 8,66M linhas inteiras.
--
-- Já aplicado no VPS com CREATE INDEX CONCURRENTLY (não trava a tabela, e /fornecedores/descobrir
-- seguiu funcionando durante a criação — 12,8s). O IF NOT EXISTS torna esta migration idempotente
-- nesse ambiente. Sem CONCURRENTLY aqui: migration roda em transação, que não o permite.
CREATE INDEX IF NOT EXISTS "empresas_candidatas_fornecedor_cnae_municipio_idx"
  ON "empresas_candidatas_fornecedor" ("cnaePrincipalCodigo", "municipio")
  WHERE "email" IS NOT NULL AND "email" <> '';
