-- CreateTable
CREATE TABLE "itens_catalogo_referencia" (
    "id" TEXT NOT NULL,
    "fonteChave" TEXT NOT NULL,
    "codigo" INTEGER NOT NULL,
    "codigoClasse" INTEGER,
    "descricao" TEXT NOT NULL,
    "descricaoNormalizada" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_catalogo_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itens_catalogo_referencia_descricaoNormalizada_idx" ON "itens_catalogo_referencia"("descricaoNormalizada");

-- CreateIndex
CREATE UNIQUE INDEX "itens_catalogo_referencia_fonteChave_codigo_key" ON "itens_catalogo_referencia"("fonteChave", "codigo");

-- AddForeignKey
ALTER TABLE "itens_catalogo_referencia" ADD CONSTRAINT "itens_catalogo_referencia_fonteChave_fkey" FOREIGN KEY ("fonteChave") REFERENCES "fontes_referencia"("chave") ON DELETE CASCADE ON UPDATE CASCADE;
