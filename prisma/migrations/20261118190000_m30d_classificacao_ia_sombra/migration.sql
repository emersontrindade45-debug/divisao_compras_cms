-- Veredito da IA por resposta, em "modo sombra" (M30.d). Aditiva (expand): tabela nova, nada a
-- alterar nas existentes. O código atual não a conhece e continua funcionando; esta migration vai
-- ANTES do código que grava nela (CLAUDE.md §9.19). O texto lido pela IA nunca é gravado.
CREATE TABLE "classificacoes_ia_resposta" (
    "id" TEXT NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "consultaId" TEXT,
    "classeIa" TEXT NOT NULL,
    "confianca" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classificacoes_ia_resposta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classificacoes_ia_resposta_gmailMensagemId_key" ON "classificacoes_ia_resposta"("gmailMensagemId");
CREATE INDEX "classificacoes_ia_resposta_createdAt_idx" ON "classificacoes_ia_resposta"("createdAt");
