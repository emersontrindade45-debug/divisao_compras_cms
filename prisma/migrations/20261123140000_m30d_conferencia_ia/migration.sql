-- Conferência humana das classificações da IA (M30.d). Tabela NOVA e aditiva (expand): nenhuma tabela
-- existente muda, então o código atual segue funcionando sem ela. Esta migration vai ANTES do código
-- que a grava (CLAUDE.md §9.19, §9.46); sem ela a aba "Conferir IA" mostra "indisponível".
CREATE TABLE "conferencias_ia_resposta" (
    "id" TEXT NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classeCorreta" TEXT NOT NULL,
    "classeIa" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conferencias_ia_resposta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conferencias_ia_resposta_gmailMensagemId_key" ON "conferencias_ia_resposta"("gmailMensagemId");
CREATE INDEX "conferencias_ia_resposta_createdAt_idx" ON "conferencias_ia_resposta"("createdAt");
