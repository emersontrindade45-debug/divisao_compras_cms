import { z } from "zod";

export const tipoFonteSchema = z.enum([
  "contratacao_publica",
  "site_eletronico",
  "fornecedor_direto",
]);

export const metodoConsolidacaoSchema = z.enum([
  "media",
  "mediana",
  "menor_valor",
]);

export const statusPrecoSchema = z.enum(["incluido", "excluido"]);

export const createPrecoConsolidadoSchema = z
  .object({
    seriePrecoId: z.string().cuid(),
    fonte: tipoFonteSchema,
    descricaoFonte: z.string().min(1, "Descrição da fonte obrigatória"),
    fornecedorOuOrgao: z.string().min(1, "Fornecedor ou órgão obrigatório"),
    dataReferencia: z.coerce.date(),
    valorUnitario: z.number().positive("Valor unitário deve ser positivo"),
    status: statusPrecoSchema.default("incluido"),
    motivoExclusao: z.string().optional(),
  })
  .refine(
    (d) =>
      d.status !== "excluido" ||
      (d.motivoExclusao !== undefined && d.motivoExclusao.length > 0),
    {
      message: "Motivo de exclusão obrigatório ao excluir um preço",
      path: ["motivoExclusao"],
    },
  );

export const createSeriePrecoSchema = z.object({
  itemId: z.string().cuid(),
  metodo: metodoConsolidacaoSchema,
});

export type CreatePrecoConsolidadoInput = z.infer<typeof createPrecoConsolidadoSchema>;
export type CreateSeriePrecoInput = z.infer<typeof createSeriePrecoSchema>;
