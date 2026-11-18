-- Veredito da IA sobre a resposta do fornecedor (M30.d). Aditiva (expand): duas colunas nulas.
-- O código atual não as conhece e continua funcionando; esta migration vai ANTES do código que as
-- grava (CLAUDE.md §9.19, §9.46). O texto lido pela IA nunca é gravado — só o veredito e uma frase.
ALTER TABLE "respostas_email_pendentes" ADD COLUMN "sugestaoIa" TEXT;
ALTER TABLE "respostas_email_pendentes" ADD COLUMN "justificativaIa" TEXT;
