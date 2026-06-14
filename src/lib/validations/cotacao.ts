import { z } from "zod";

export const statusCotacaoSchema = z.enum([
  "positiva",
  "negativa",
  "incompleta",
  "silenciosa",
]);

export const statusChecklistSchema = z.enum(["valido", "ressalva", "invalido"]);

export const statusGeralSchema = z.enum(["valida", "com_ressalva", "invalida"]);

export const createCotacaoSchema = z
  .object({
    processoId: z.string().cuid(),
    fornecedorId: z.string().cuid(),
    dataEnvio: z.coerce.date(),
    dataLimite: z.coerce.date(),
    observacao: z.string().optional(),
  })
  .refine((d) => d.dataLimite > d.dataEnvio, {
    message: "Data limite deve ser posterior à data de envio",
    path: ["dataLimite"],
  });

export const updateCotacaoSchema = z.object({
  status: statusCotacaoSchema.optional(),
  lembreteEnviado: z.boolean().optional(),
  valorProposto: z.number().positive().optional(),
  observacao: z.string().optional(),
});

export const createPropostaSchema = z.object({
  cotacaoId: z.string().cuid(),
  cnpjValido: statusChecklistSchema,
  descricaoValida: statusChecklistSchema,
  valorUnitarioValido: statusChecklistSchema,
  valorTotalValido: statusChecklistSchema,
  dataValida: statusChecklistSchema,
  responsavelValido: statusChecklistSchema,
  statusGeral: statusGeralSchema,
  valorUnitario: z.number().positive().optional(),
  valorTotal: z.number().positive().optional(),
  dataProposta: z.coerce.date().optional(),
  responsavel: z.string().optional(),
  observacoes: z.string().optional(),
});

export type CreateCotacaoInput = z.infer<typeof createCotacaoSchema>;
export type UpdateCotacaoInput = z.infer<typeof updateCotacaoSchema>;
export type CreatePropostaInput = z.infer<typeof createPropostaSchema>;
