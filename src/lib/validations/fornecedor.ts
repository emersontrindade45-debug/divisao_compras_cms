import { z } from "zod";

export const statusFornecedorSchema = z.enum(["ativo", "inativo"]);

const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

export const createFornecedorSchema = z.object({
  cnpj: z.string().regex(cnpjRegex, "CNPJ inválido (formato: XX.XXX.XXX/XXXX-XX)"),
  razaoSocial: z.string().min(3, "Razão social deve ter ao menos 3 caracteres"),
  nomeFantasia: z.string().optional(),
  categoria: z.array(z.string()).min(1, "Informe ao menos uma categoria"),
  cidade: z.string().min(1, "Cidade obrigatória"),
  estado: z.string().length(2, "Estado deve ter 2 letras (ex: SP)"),
  responsavelContato: z.string().min(2, "Responsável obrigatório"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().optional(),
});

export const updateFornecedorSchema = createFornecedorSchema.partial().extend({
  status: statusFornecedorSchema.optional(),
});

export type CreateFornecedorInput = z.infer<typeof createFornecedorSchema>;
export type UpdateFornecedorInput = z.infer<typeof updateFornecedorSchema>;
