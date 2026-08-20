import { z } from "zod";

/**
 * Filtro de busca de `EmpresaCandidataFornecedor` (M27 etapa 6).
 *
 * `municipio` é OBRIGATÓRIO deliberadamente: a tabela tem potencialmente
 * milhões de linhas e só existe índice em `[estado, municipio]` — sem
 * município, a busca faria um seq scan da base inteira. `estado` não entra
 * aqui porque é fixo em "SP" (única UF importada nesta entrega, ver
 * `docs/PLAN.md` M27) — não há seletor de UF na UI.
 */
export const buscarCandidatosCnpjSchema = z.object({
  municipio: z.string().trim().min(1, "Informe o município para buscar"),
  cnae: z.string().trim().min(1).optional(),
  categoria: z.string().trim().min(1).optional(),
  busca: z.string().trim().min(1).optional(),
  /** Cursor de paginação: `cnpj` (sem máscara) do último candidato da página anterior. */
  cursor: z.string().trim().min(1).optional(),
});

export type BuscarCandidatosCnpjInput = z.infer<typeof buscarCandidatosCnpjSchema>;
