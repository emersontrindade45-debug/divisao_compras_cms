-- M30.d: cotação por e-mail (caixa divisaocompras@).
--
-- Aditiva (expand): só tabelas e tipos novos, nenhuma coluna alterada em tabela existente.
-- Pode ser aplicada antes do deploy do código que as usa (CLAUDE.md §9.19, §9.46).
--
-- SIGILO: nenhuma coluna guarda conteúdo de e-mail (assunto, corpo, anexo, remetente
-- completo). Só ids opacos do Gmail, datas, o número do processo extraído do assunto e a
-- situação da consulta. `respostas_email_pendentes` guarda apenas o DOMÍNIO do remetente.


-- CreateEnum
CREATE TYPE "PrazoOrigem" AS ENUM ('assunto', 'corpo', 'padrao');

-- CreateEnum
CREATE TYPE "SituacaoConsulta" AS ENUM ('sem_resposta', 'a_confirmar', 'orcamento', 'recusa', 'email_invalido');

-- CreateTable
CREATE TABLE "envios_cotacao" (
    "id" TEXT NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "gmailFio" TEXT NOT NULL,
    "dataEnvio" TIMESTAMP(3) NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "prazoOrigem" "PrazoOrigem" NOT NULL,
    "numeroProcessoAssunto" TEXT,
    "processoId" TEXT,
    "totalDestinatarios" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas_cotacao" (
    "id" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "cnaeDescricao" TEXT,
    "fornecedorId" TEXT,
    "situacao" "SituacaoConsulta" NOT NULL DEFAULT 'sem_resposta',
    "dataResposta" TIMESTAMP(3),
    "gmailRespostaId" TEXT,
    "regra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultas_cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas_email_pendentes" (
    "id" TEXT NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "dataResposta" TIMESTAMP(3) NOT NULL,
    "remetenteDominio" TEXT NOT NULL,
    "sugestaoConsultaId" TEXT,
    "motivo" TEXT NOT NULL,
    "temAnexoOrcamento" BOOLEAN NOT NULL,
    "contemRecusa" BOOLEAN NOT NULL,
    "contemValor" BOOLEAN NOT NULL,
    "resolvidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respostas_email_pendentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails_invalidos" (
    "email" TEXT NOT NULL,
    "primeiraDevolucao" TIMESTAMP(3) NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_invalidos_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "envios_cotacao_gmailMensagemId_key" ON "envios_cotacao"("gmailMensagemId");

-- CreateIndex
CREATE INDEX "envios_cotacao_processoId_idx" ON "envios_cotacao"("processoId");

-- CreateIndex
CREATE INDEX "envios_cotacao_numeroProcessoAssunto_idx" ON "envios_cotacao"("numeroProcessoAssunto");

-- CreateIndex
CREATE INDEX "consultas_cotacao_email_idx" ON "consultas_cotacao"("email");

-- CreateIndex
CREATE UNIQUE INDEX "consultas_cotacao_envioId_email_key" ON "consultas_cotacao"("envioId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "respostas_email_pendentes_gmailMensagemId_key" ON "respostas_email_pendentes"("gmailMensagemId");

-- CreateIndex
CREATE INDEX "respostas_email_pendentes_resolvidaEm_idx" ON "respostas_email_pendentes"("resolvidaEm");

-- AddForeignKey
ALTER TABLE "envios_cotacao" ADD CONSTRAINT "envios_cotacao_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas_cotacao" ADD CONSTRAINT "consultas_cotacao_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas_cotacao" ADD CONSTRAINT "consultas_cotacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_email_pendentes" ADD CONSTRAINT "respostas_email_pendentes_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

