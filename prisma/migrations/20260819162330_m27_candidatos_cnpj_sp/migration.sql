-- CreateTable
CREATE TABLE "empresas_candidatas_fornecedor" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "situacaoCadastral" TEXT NOT NULL,
    "situacaoCadastralData" TIMESTAMP(3),
    "municipio" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "cnaePrincipalCodigo" TEXT NOT NULL,
    "cnaePrincipalDescricao" TEXT NOT NULL,
    "categoriaSugerida" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "telefone" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cep" TEXT,
    "competenciaRfb" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_candidatas_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes_candidatos_cnpj" (
    "id" TEXT NOT NULL,
    "competenciaRfb" TEXT NOT NULL,
    "arquivoOrigem" TEXT NOT NULL,
    "linhasLidas" INTEGER NOT NULL DEFAULT 0,
    "linhasImportadas" INTEGER NOT NULL DEFAULT 0,
    "linhasRejeitadas" INTEGER NOT NULL DEFAULT 0,
    "detalhes" JSONB,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "erro" TEXT,

    CONSTRAINT "importacoes_candidatos_cnpj_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_sugeridas_por_cnae" (
    "cnaeCodigo" TEXT NOT NULL,
    "cnaeDescricao" TEXT NOT NULL,
    "categorias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_sugeridas_por_cnae_pkey" PRIMARY KEY ("cnaeCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_candidatas_fornecedor_cnpj_key" ON "empresas_candidatas_fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_candidatas_fornecedor_estado_municipio_idx" ON "empresas_candidatas_fornecedor"("estado", "municipio");

-- CreateIndex
CREATE INDEX "empresas_candidatas_fornecedor_categoriaSugerida_idx" ON "empresas_candidatas_fornecedor" USING GIN ("categoriaSugerida");

-- CreateIndex
CREATE INDEX "importacoes_candidatos_cnpj_competenciaRfb_iniciadoEm_idx" ON "importacoes_candidatos_cnpj"("competenciaRfb", "iniciadoEm");
