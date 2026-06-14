import { z } from "zod";

export const classificacaoItemSchema = z.enum(["comum", "especifico"]);

export const statusProcessoSchema = z.enum([
  "aderente",
  "parcial",
  "nao_aderente",
  "pendente",
]);

export const createProcessoSchema = z.object({
  numero: z.string().min(1, "Número do processo obrigatório"),
  objeto: z.string().min(3, "Objeto deve ter ao menos 3 caracteres"),
  unidade: z.string().min(1, "Unidade obrigatória"),
  quantidade: z.number().int().positive("Quantidade deve ser positiva"),
  caracteristicasTecnicas: z.string().min(1, "Características técnicas obrigatórias"),
  palavrasChave: z.array(z.string()).min(1, "Informe ao menos uma palavra-chave"),
  classificacao: classificacaoItemSchema,
  responsavel: z.string().min(1, "Responsável obrigatório"),
  dataAbertura: z.coerce.date(),
});

export const updateProcessoSchema = createProcessoSchema.partial().extend({
  status: statusProcessoSchema.optional(),
});

export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;
export type UpdateProcessoInput = z.infer<typeof updateProcessoSchema>;

export const createItemSchema = z.object({
  processoId: z.string().cuid(),
  descricao: z.string().min(3),
  unidade: z.string().min(1),
  quantidade: z.number().int().positive(),
  classificacao: classificacaoItemSchema,
  caracteristicasTecnicas: z.string().optional(),
  palavrasChave: z.array(z.string()),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
