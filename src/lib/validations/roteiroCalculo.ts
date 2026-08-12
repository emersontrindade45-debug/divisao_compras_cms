import { z } from "zod";
import {
  ORIGENS_COM_VALOR,
  ORIGENS_OPERANDO,
  OPERACOES_PASSO,
  type RoteiroCalculo,
} from "@/lib/domain/roteiroCalculo";

/**
 * Fronteira do roteiro de cálculo (CLAUDE.md §9.12): valida tanto o que entra
 * pela server action quanto o que SAI do banco. A coluna é `Json` — o Prisma
 * não tipa o conteúdo, então ler sem validar é confiar num shape que qualquer
 * gravação antiga ou migration mal convertida pode ter quebrado.
 */

const passoSchema = z
  .object({
    operacao: z.enum(OPERACOES_PASSO),
    origem: z.enum(ORIGENS_OPERANDO),
    valor: z.number().finite().nullable().optional(),
    rotulo: z.string().trim().max(80).nullable().optional(),
    unidade: z.string().trim().max(40).nullable().optional(),
  })
  .refine(
    (p) =>
      !ORIGENS_COM_VALOR.includes(p.origem) ||
      (p.valor !== null && p.valor !== undefined && Number.isFinite(p.valor)),
    { message: "Passo com operando digitado precisa de um número." },
  )
  // Percentual sem número não tem como ser aplicado, qualquer que seja a origem.
  .refine(
    (p) =>
      (p.operacao !== "acrescimo_percentual" && p.operacao !== "desconto_percentual") ||
      (p.valor !== null && p.valor !== undefined),
    { message: "Passo de percentual precisa do percentual." },
  );

export const roteiroCalculoSchema = z.object({
  valorInicial: z.number().finite().positive(),
  rotuloInicial: z.string().trim().max(120).nullable().optional(),
  unidadeInicial: z.string().trim().max(40).nullable().optional(),
  // Teto de passos: uma cadeia mais longa que isso é sinal de conta que
  // ninguém vai conseguir justificar numa cota, não de flexibilidade.
  passos: z.array(passoSchema).max(8),
  justificativaComplementar: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Lê o JSON do banco como roteiro. Devolve `null` — e não lança — quando o
 * conteúdo não bate: a tela precisa continuar renderizando o candidato, ainda
 * que sem o roteiro.
 */
export function lerRoteiro(bruto: unknown): RoteiroCalculo | null {
  if (bruto === null || bruto === undefined) return null;
  const parsed = roteiroCalculoSchema.safeParse(bruto);
  if (!parsed.success) return null;
  return {
    valorInicial: parsed.data.valorInicial,
    rotuloInicial: parsed.data.rotuloInicial ?? null,
    unidadeInicial: parsed.data.unidadeInicial ?? null,
    passos: parsed.data.passos.map((p) => ({
      operacao: p.operacao,
      origem: p.origem,
      valor: p.valor ?? null,
      rotulo: p.rotulo ?? null,
      unidade: p.unidade ?? null,
    })),
    justificativaComplementar: parsed.data.justificativaComplementar ?? null,
  };
}
