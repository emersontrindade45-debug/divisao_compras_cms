import { z } from "zod";
import { cnpjRegex } from "@/lib/validations/fornecedor";

/**
 * Rede de segurança pós-parsing para `FornecedorPlanilhaRow`
 * (`src/lib/sheets/fornecedoresPlanilha.ts`). Tolerante por natureza — a
 * planilha tem 56% das linhas sem CNPJ e 13% sem e-mail (medido) — então os
 * campos aqui não usam `.min(1)`/`.email()` como `createFornecedorSchema`
 * (esse é para o formulário manual, estrito). O parser já normaliza; este
 * schema só garante o formato do que o parser promete produzir.
 */
export const fornecedorPlanilhaRowSchema = z.object({
  linhaId: z.string().min(1),
  cnpj: z.string().regex(cnpjRegex).nullable(),
  razaoSocial: z.string().min(1),
  categoria: z.array(z.string()),
  cidade: z.string(),
  estado: z.string(),
  responsavelContato: z.string(),
  email: z.string(), // pode ser "" — validação de formato já ocorreu no parser
  emailsAdicionais: z.array(z.string()),
  telefone: z.string().optional(),
  fonte: z.string().optional(),
});

export type FornecedorPlanilhaRowValidado = z.infer<typeof fornecedorPlanilhaRowSchema>;
