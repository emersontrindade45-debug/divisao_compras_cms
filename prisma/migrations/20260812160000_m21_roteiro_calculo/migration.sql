-- CreateEnum
CREATE TYPE "FrequenciaExecucao" AS ENUM ('unica', 'mensal', 'bimestral', 'trimestral', 'quadrimestral', 'semestral', 'anual');

-- AlterTable
ALTER TABLE "itens" ADD COLUMN     "trMedida" DECIMAL(14,4),
ADD COLUMN     "trMedidaUnidade" TEXT,
ADD COLUMN     "trFrequencia" "FrequenciaExecucao",
ADD COLUMN     "trVigenciaMeses" INTEGER;

-- AlterTable
ALTER TABLE "resultados_similaridade" ADD COLUMN     "roteiroCalculo" JSONB;

-- Converte os ajustes do M20 em roteiros de cálculo. Sem esta conversão os
-- ajustes já feitos continuariam valendo pelo `valorConsiderado` gravado, mas
-- abrir o painel mostraria um roteiro vazio — e o analista reeditaria do zero
-- sem saber por quê.
--
-- O ajuste antigo é uma cadeia de 1 ou 2 passos: a operação sobre a quantidade
-- do contrato e, quando a base era `projetado_tr`, a multiplicação pela
-- quantidade do TR. Esta segunda entra como passo `livre` com rótulo, e não
-- como `quantidade_tr`, porque o número gravado era digitado no candidato e
-- pode não coincidir com o parâmetro que o item vier a ter.
UPDATE "resultados_similaridade"
SET "roteiroCalculo" = jsonb_build_object(
  'valorInicial', "ajusteValorBase",
  'rotuloInicial', 'valor publicado na fonte',
  'unidadeInicial', "ajusteUnidadeMedida",
  'passos',
    CASE
      WHEN "ajusteBaseSerie" = 'projetado_tr' AND "ajusteQuantidadeTR" IS NOT NULL THEN
        jsonb_build_array(
          jsonb_build_object(
            'operacao', "ajusteOperacao"::text,
            'origem', 'quantidade_contrato',
            'valor', "ajusteQuantidade"
          ),
          jsonb_build_object(
            'operacao', 'multiplicacao',
            'origem', 'livre',
            'valor', "ajusteQuantidadeTR",
            'rotulo', 'quantidade do TR'
          )
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object(
            'operacao', "ajusteOperacao"::text,
            'origem', 'quantidade_contrato',
            'valor', "ajusteQuantidade"
          )
        )
    END
)
WHERE "ajusteValorBase" IS NOT NULL
  AND "ajusteOperacao" IS NOT NULL
  AND "ajusteQuantidade" IS NOT NULL;

-- Vigência de 30 meses faltava na lista do M20. PG 12+ aceita ADD VALUE dentro
-- de transação desde que o valor novo não seja usado na mesma transação — não é.
ALTER TYPE "PeriodicidadeContrato" ADD VALUE IF NOT EXISTS 'meses_30';
