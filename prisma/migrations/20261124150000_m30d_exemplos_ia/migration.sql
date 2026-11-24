-- M30.d: exemplos anonimizados para a 1ª leitura da IA (casos decididos pela Divisão).
-- Aditiva: tabela nova, nenhuma coluna existente muda. Sem a migration aplicada, a flag IA_EXEMPLOS
-- desligada não toca na tabela, então código e migration podem subir em tempos diferentes.
CREATE TABLE "exemplos_classificacao_ia" (
    "id" TEXT NOT NULL,
    "gmailMensagemId" TEXT NOT NULL,
    "classeCorreta" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "trecho" TEXT NOT NULL,
    "anexosPdf" INTEGER NOT NULL DEFAULT 0,
    "anexosOutros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exemplos_classificacao_ia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exemplos_classificacao_ia_gmailMensagemId_key" ON "exemplos_classificacao_ia"("gmailMensagemId");
