import { dbCandidatos } from "@/lib/dbCandidatos";
import type { ClasseCnae } from "@/lib/ia/sugerirCnaesParaObjeto";

export const ESTADO_IMPORTADO = "SP";

// Cache em memória do processo para o catálogo de CNAEs — mesmo padrão de
// `listarMunicipiosComCandidatos` (candidatosCnpj.ts), e pelo mesmo motivo: o `groupBy` que o monta
// não tem índice que o cubra e varre a tabela inteira (medido: 1,9s de Execution Time e 400 mil
// páginas lidas, contra a base local). Da função em `iad1` até o VPS em Campinas esse custo é
// bem maior, e ele se pagava a CADA clique no botão.
//
// TTL de 1h é seguro aqui porque o catálogo só muda quando a base de candidatos é reimportada —
// evento raro e manual, ao contrário da lista de municípios (§9 do PLAN, TTL reduzido para 5min
// depois de uma carga nova demorar a aparecer).
interface CacheCatalogo {
  classes: ClasseCnae[];
  expiraEm: number;
}
let cacheCatalogo: CacheCatalogo | null = null;
const TTL_CACHE_CATALOGO_MS = 60 * 60 * 1000;

export async function obterCatalogoCnaes(): Promise<ClasseCnae[]> {
  if (cacheCatalogo && cacheCatalogo.expiraEm > Date.now()) return cacheCatalogo.classes;

  const grupos = await dbCandidatos.empresaCandidataFornecedor.groupBy({
    by: ["cnaePrincipalCodigo", "cnaePrincipalDescricao"],
  });
  const porClasse = new Map<string, ClasseCnae>();
  for (const g of grupos) {
    if (!porClasse.has(g.cnaePrincipalCodigo)) {
      porClasse.set(g.cnaePrincipalCodigo, {
        classe: g.cnaePrincipalCodigo,
        descricao: g.cnaePrincipalDescricao,
      });
    }
  }

  const classes = [...porClasse.values()];
  cacheCatalogo = { classes, expiraEm: Date.now() + TTL_CACHE_CATALOGO_MS };
  return classes;
}
