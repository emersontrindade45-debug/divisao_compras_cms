-- CreateEnum
CREATE TYPE "Role" AS ENUM ('pesquisa', 'revisao', 'aprovacao');

-- CreateEnum
CREATE TYPE "StatusProcesso" AS ENUM ('aderente', 'parcial', 'nao_aderente', 'pendente');

-- CreateEnum
CREATE TYPE "ClassificacaoItem" AS ENUM ('comum', 'especifico');

-- CreateEnum
CREATE TYPE "TipoFonte" AS ENUM ('contratacao_publica', 'site_eletronico', 'fornecedor_direto');

-- CreateEnum
CREATE TYPE "AderenciaFonte" AS ENUM ('aderente', 'parcial', 'nao_aderente');

-- CreateEnum
CREATE TYPE "ListaSite" AS ENUM ('branca', 'cinza', 'vermelha');

-- CreateEnum
CREATE TYPE "StatusCotacao" AS ENUM ('positiva', 'negativa', 'incompleta', 'silenciosa');

-- CreateEnum
CREATE TYPE "StatusChecklist" AS ENUM ('valido', 'ressalva', 'invalido');

-- CreateEnum
CREATE TYPE "StatusGeral" AS ENUM ('valida', 'com_ressalva', 'invalida');

-- CreateEnum
CREATE TYPE "MetodoConsolidacao" AS ENUM ('media', 'mediana', 'menor_valor');

-- CreateEnum
CREATE TYPE "StatusPreco" AS ENUM ('incluido', 'excluido');

-- CreateEnum
CREATE TYPE "StatusFornecedor" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "StatusResposta" AS ENUM ('respondido', 'nao_respondido', 'recusado');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'pesquisa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processos" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "caracteristicasTecnicas" TEXT NOT NULL,
    "palavrasChave" TEXT[],
    "classificacao" "ClassificacaoItem" NOT NULL,
    "responsavel" TEXT NOT NULL,
    "status" "StatusProcesso" NOT NULL DEFAULT 'pendente',
    "dataAbertura" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "classificacao" "ClassificacaoItem" NOT NULL,
    "caracteristicasTecnicas" TEXT,
    "palavrasChave" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fontes" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tipo" "TipoFonte" NOT NULL,
    "descricao" TEXT NOT NULL,
    "orgaoOuFornecedor" TEXT NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "status" "StatusPreco" NOT NULL DEFAULT 'incluido',
    "motivoExclusao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fontes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "arquivo" TEXT,
    "url" TEXT,
    "dataHoraAcesso" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratacoes_publicas" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "orgao" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "unidade" TEXT NOT NULL,
    "dataContratacao" TIMESTAMP(3) NOT NULL,
    "fonteUrl" TEXT,
    "aderencia" "AderenciaFonte" NOT NULL,
    "justificativaAderencia" TEXT,
    "palavrasChave" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratacoes_publicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "lista" "ListaSite" NOT NULL,
    "motivo" TEXT,
    "categoria" TEXT NOT NULL,
    "isMarketplace" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capturas_evidencias" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "dataHoraAcesso" TIMESTAMP(3) NOT NULL,
    "evidencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capturas_evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "categoria" TEXT[],
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "responsavelContato" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "totalCotacoes" INTEGER NOT NULL DEFAULT 0,
    "totalRespostas" INTEGER NOT NULL DEFAULT 0,
    "taxaResposta" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ultimaResposta" TIMESTAMP(3),
    "status" "StatusFornecedor" NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_cotacoes" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "processoNumero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "statusResposta" "StatusResposta" NOT NULL,
    "valorProposto" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_cotacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotacoes" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "dataEnvio" TIMESTAMP(3) NOT NULL,
    "dataLimite" TIMESTAMP(3) NOT NULL,
    "status" "StatusCotacao" NOT NULL DEFAULT 'silenciosa',
    "lembreteEnviado" BOOLEAN NOT NULL DEFAULT false,
    "valorProposto" DECIMAL(12,2),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "cnpjValido" "StatusChecklist" NOT NULL,
    "descricaoValida" "StatusChecklist" NOT NULL,
    "valorUnitarioValido" "StatusChecklist" NOT NULL,
    "valorTotalValido" "StatusChecklist" NOT NULL,
    "dataValida" "StatusChecklist" NOT NULL,
    "responsavelValido" "StatusChecklist" NOT NULL,
    "statusGeral" "StatusGeral" NOT NULL,
    "valorUnitario" DECIMAL(12,2),
    "valorTotal" DECIMAL(12,2),
    "dataProposta" TIMESTAMP(3),
    "responsavel" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_precos" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "metodo" "MetodoConsolidacao" NOT NULL,
    "valorEstimado" DECIMAL(12,2) NOT NULL,
    "media" DECIMAL(12,2) NOT NULL,
    "mediana" DECIMAL(12,2) NOT NULL,
    "menorValor" DECIMAL(12,2) NOT NULL,
    "coeficienteVariacao" DECIMAL(6,2) NOT NULL,
    "totalPrecos" INTEGER NOT NULL,
    "precosIncluidos" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precos_consolidados" (
    "id" TEXT NOT NULL,
    "seriePrecoId" TEXT NOT NULL,
    "fonte" "TipoFonte" NOT NULL,
    "descricaoFonte" TEXT NOT NULL,
    "fornecedorOuOrgao" TEXT NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "valorUnitario" DECIMAL(12,2) NOT NULL,
    "status" "StatusPreco" NOT NULL DEFAULT 'incluido',
    "motivoExclusao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precos_consolidados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processoId" TEXT,
    "cotacaoId" TEXT,
    "acao" TEXT NOT NULL,
    "detalhes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "processos_numero_key" ON "processos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "sites_url_key" ON "sites"("url");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_cnpj_key" ON "fornecedores"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_cotacaoId_key" ON "propostas"("cotacaoId");

-- AddForeignKey
ALTER TABLE "itens" ADD CONSTRAINT "itens_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fontes" ADD CONSTRAINT "fontes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "fontes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratacoes_publicas" ADD CONSTRAINT "contratacoes_publicas_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capturas_evidencias" ADD CONSTRAINT "capturas_evidencias_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capturas_evidencias" ADD CONSTRAINT "capturas_evidencias_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_cotacoes" ADD CONSTRAINT "historico_cotacoes_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacoes" ADD CONSTRAINT "cotacoes_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacoes" ADD CONSTRAINT "cotacoes_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_precos" ADD CONSTRAINT "series_precos_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_consolidados" ADD CONSTRAINT "precos_consolidados_seriePrecoId_fkey" FOREIGN KEY ("seriePrecoId") REFERENCES "series_precos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
