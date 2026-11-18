-- Registro da aplicação da IA e do "Desfazer" (M30.d, Fase 3b). Aditiva (expand): colunas nulas ou
-- com padrão. O código atual não as conhece e continua funcionando; esta migration vai ANTES do
-- código que as grava (CLAUDE.md §9.19, §9.46). Sem a chave IA_APLICAR_AUTOMATICO ligada, nada é aplicado.
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "aplicadaEm" TIMESTAMP(3);
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "situacaoAnterior" TEXT;
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "dataRespostaDefinida" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "desfeitaEm" TIMESTAMP(3);
