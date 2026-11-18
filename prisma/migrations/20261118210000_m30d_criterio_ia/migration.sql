-- Critério de aplicação sozinha da IA, em modo sombra (M30.d). Aditiva (expand): colunas novas,
-- com padrão, em tabela que o código atual já usa só para inserir. O código atual não as conhece e
-- continua funcionando; esta migration vai ANTES do código que as grava (CLAUDE.md §9.19, §9.46).
-- Nenhum texto de e-mail é gravado: só a classe da segunda leitura, dois booleanos e um código.
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "segundaClasse" TEXT;
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "evidenciaOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "criterioOk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "classificacoes_ia_resposta" ADD COLUMN "criterioRazao" TEXT;
