import { z } from "zod";

/** UFs importadas na base de candidatos (M27: SP; Sudeste: + MG, RJ, ES). */
export const ESTADOS_CANDIDATOS_CNPJ = ["SP", "MG", "RJ", "ES"] as const;

/**
 * Filtro de busca de `EmpresaCandidataFornecedor` (M27 etapa 6).
 *
 * `municipio` é OBRIGATÓRIO deliberadamente: a tabela tem potencialmente
 * milhões de linhas e só existe índice em `[estado, municipio]` — sem
 * município, a busca faria um seq scan da base inteira. `estado` também é
 * obrigatório desde a expansão para o Sudeste inteiro: nomes de município
 * colidem entre UFs vizinhas (medido: Rio Claro em SP e RJ, Cantagalo em
 * MG e RJ, entre outros) — filtrar só por nome misturaria candidatos de
 * cidades diferentes.
 */
export const buscarCandidatosCnpjSchema = z.object({
  estado: z.enum(ESTADOS_CANDIDATOS_CNPJ, { message: "UF inválida" }),
  municipio: z.string().trim().min(1, "Informe o município para buscar"),
  cnae: z.string().trim().min(1).optional(),
  categoria: z.string().trim().min(1).optional(),
  busca: z.string().trim().min(1).optional(),
  /** Cursor de paginação: `cnpj` (sem máscara) do último candidato da página anterior. */
  cursor: z.string().trim().min(1).optional(),
});

export type BuscarCandidatosCnpjInput = z.infer<typeof buscarCandidatosCnpjSchema>;
