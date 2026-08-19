import { z } from "zod";

/**
 * Valida uma linha do CSV de candidatos a Fornecedor gerado pelo filtro DuckDB sobre o dump da
 * Receita Federal (M27) — SP + situação ativa, colunas já nomeadas conforme os campos abaixo. CNPJ
 * chega sem máscara (só dígitos, formato bruto da Receita); `situacaoCadastral === "02"` é validado
 * aqui como defesa em profundidade, mesmo o CSV já vindo filtrado a montante (fora deste repo) —
 * nenhuma situação além de "ativa" é importada nesta entrega. Linha que falha aqui incrementa
 * `linhasRejeitadas` no import (`importarCandidatosCnpj.ts`), nunca derruba o processo inteiro.
 * `situacaoCadastralData` e os campos de endereço ficam como texto bruto — parsing de data e
 * normalização de município acontecem depois, no import, não neste schema.
 */
export const linhaCandidatoCnpjSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos, sem máscara"),
  razaoSocial: z.string().min(1, "Razão social obrigatória"),
  nomeFantasia: z.string(),
  situacaoCadastral: z.literal("02", "Só situação ativa (02) é importada nesta entrega"),
  situacaoCadastralData: z.string(),
  municipio: z.string().min(1, "Município obrigatório"),
  estado: z.string().length(2, "Estado deve ter 2 letras (ex: SP)"),
  cnaePrincipalCodigo: z.string().min(1, "CNAE principal obrigatório"),
  cnaePrincipalDescricao: z.string().min(1, "Descrição do CNAE obrigatória"),
  email: z.string(),
  telefone: z.string(),
  logradouro: z.string(),
  numero: z.string(),
  bairro: z.string(),
  cep: z.string(),
});

export type LinhaCandidatoCnpj = z.infer<typeof linhaCandidatoCnpjSchema>;
