import { z } from "zod";

export const statusFornecedorSchema = z.enum(["ativo", "inativo"]);

export const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

/** 14 dígitos (com ou sem máscara) → `XX.XXX.XXX/XXXX-XX`. Qualquer outro comprimento → `null`. */
export function formatarCnpj(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

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
