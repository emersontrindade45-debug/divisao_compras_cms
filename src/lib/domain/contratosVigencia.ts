import { z } from "zod";

/**
 * Vigência de um contrato gerado por uma contratação pública, como fica gravada
 * em `ResultadoSimilaridade.contratosVigencia`.
 *
 * É registro documental para o auditor — não converte nem normaliza preço
 * nenhum, pela mesma decisão que vale para `ajustePeriodicidade`.
 */
export const contratoVigenciaSchema = z.object({
  sequencial: z.number().int().positive(),
  ano: z.string(),
  dataAssinatura: z.string().nullable(),
  dataVigenciaInicio: z.string().nullable(),
  dataVigenciaFim: z.string().nullable(),
  objeto: z.string().nullable(),
  url: z.string(),
});

export type ContratoVigencia = z.infer<typeof contratoVigenciaSchema>;

/**
 * Lê a coluna `Json` de forma defensiva: o que está gravado veio de uma versão
 * anterior do código, e uma linha malformada não pode derrubar a tabela inteira
 * de candidatos. Mesma postura do `lerPassos` do assistente.
 */
export function lerContratosVigencia(bruto: unknown): ContratoVigencia[] {
  const resultado = z.array(contratoVigenciaSchema).safeParse(bruto);
  return resultado.success ? resultado.data : [];
}
