-- DropIndex
DROP INDEX "empresas_candidatas_fornecedor_estado_municipio_cnpj_idx";

-- CreateIndex
CREATE INDEX "empresas_candidatas_fornecedor_busca_priorizada_idx" ON "empresas_candidatas_fornecedor"("estado", "municipio", "sicafHabilitado" DESC, "cnpj");
