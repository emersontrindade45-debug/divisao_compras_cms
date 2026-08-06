-- CreateEnum
CREATE TYPE "NaturezaObjeto" AS ENUM ('bem_consumo', 'servico_continuo');

-- AlterTable
ALTER TABLE "itens" ADD COLUMN     "natureza" "NaturezaObjeto";
