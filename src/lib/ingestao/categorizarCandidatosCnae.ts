// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): scripts/categorizar-candidatos-cnae.ts
// precisa importar este módulo fora do bundler do Next, onde `server-only` sempre lança. Não é
// alcançável a partir de `components/` — só pelo script administrativo.
import { db } from "@/lib/db";
import { sugerirCategoriasParaObjeto } from "@/lib/ia/categorizarObjeto";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/**
 * Categorização em lote (M27 etapa 4) de `EmpresaCandidataFornecedor.categoriaSugerida` a partir
 * do CNAE principal. A IA roda **uma vez por código CNAE distinto** (~1.300 subclasses no Brasil,
 * na prática bem menos no recorte SP+ativa), nunca por empresa: uma chamada por uma das milhões de
 * linhas importadas seria inviável em custo e tempo.
 *
 * Reusa `sugerirCategoriasParaObjeto` (M25) sobre a descrição do CNAE, escolhendo só entre as Tags
 * já cadastradas em `Fornecedor.categoria` — o mesmo filtro anti-alucinação do M25 (CLAUDE.md
 * §9.12). O resultado fica em `CategoriaSugeridaPorCnae` (cache write-once: um CNAE já gravado
 * não é recalculado) e depois é copiado em massa para as empresas com `categoriaSugerida` vazio.
 *
 * A aplicação do cache é um único `UPDATE ... FROM` (não um `update` por linha): 8+ milhões de
 * round-trips estourariam qualquer teto. A cláusula `cardinality(e."categoriaSugerida") = 0` é a
 * garantia de **nunca sobrescrever** o que já foi classificado — inclusive o que uma rodagem
 * anterior ou um ajuste manual tenha preenchido. `array_length(..., 1)` NÃO serve: para array
 * vazio o Postgres devolve NULL, e `NULL = 0` não atualizaria ninguém.
 */

const CONCORRENCIA_PADRAO = 3;

export interface ResultadoCategorizacaoCnae {
  cnaesJaEmCache: number;
  cnaesEnviadosParaIa: number;
  cnaesGravados: number;
  cnaesSemCategoriaPertinente: number;
  candidatosAtualizados: number;
  erros: { cnaeCodigo: string; motivo: string }[];
}

export interface OpcoesCategorizacaoCnae {
  /** Máximo de CNAEs ainda sem cache enviados à IA nesta rodagem. */
  limite?: number;
  concorrencia?: number;
  dryRun?: boolean;
  /** Só aplica o cache já gravado; não chama a IA. */
  apenasAplicar?: boolean;
}

interface CnaePendente {
  cnaeCodigo: string;
  cnaeDescricao: string;
}

function motivoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function isViolacaoUnica(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

async function listarCnaesSemCache(limite?: number): Promise<CnaePendente[]> {
  if (limite !== undefined) {
    return db.$queryRaw<CnaePendente[]>`
      SELECT e."cnaePrincipalCodigo" AS "cnaeCodigo",
             MIN(e."cnaePrincipalDescricao") AS "cnaeDescricao"
      FROM "empresas_candidatas_fornecedor" e
      WHERE NOT EXISTS (
        SELECT 1 FROM "categorias_sugeridas_por_cnae" c
        WHERE c."cnaeCodigo" = e."cnaePrincipalCodigo"
      )
      GROUP BY e."cnaePrincipalCodigo"
      LIMIT ${limite}
    `;
  }
  return db.$queryRaw<CnaePendente[]>`
    SELECT e."cnaePrincipalCodigo" AS "cnaeCodigo",
           MIN(e."cnaePrincipalDescricao") AS "cnaeDescricao"
    FROM "empresas_candidatas_fornecedor" e
    WHERE NOT EXISTS (
      SELECT 1 FROM "categorias_sugeridas_por_cnae" c
      WHERE c."cnaeCodigo" = e."cnaePrincipalCodigo"
    )
    GROUP BY e."cnaePrincipalCodigo"
  `;
}

/**
 * Copia o cache CNAE → categorias para toda empresa ainda sem `categoriaSugerida`.
 * Um round-trip; a guarda `cardinality = 0` é o que o teste de "nunca sobrescreve" inspeciona.
 */
async function aplicarCacheNasEmpresas(): Promise<number> {
  return db.$executeRaw`
    UPDATE "empresas_candidatas_fornecedor" AS e
    SET "categoriaSugerida" = c."categorias",
        "atualizadoEm" = now()
    FROM "categorias_sugeridas_por_cnae" AS c
    WHERE e."cnaePrincipalCodigo" = c."cnaeCodigo"
      AND cardinality(e."categoriaSugerida") = 0
      AND cardinality(c."categorias") > 0
  `;
}

export async function categorizarCandidatosCnae(
  opcoes: OpcoesCategorizacaoCnae = {},
): Promise<ResultadoCategorizacaoCnae> {
  const concorrencia = opcoes.concorrencia ?? CONCORRENCIA_PADRAO;
  const dryRun = opcoes.dryRun ?? false;
  const apenasAplicar = opcoes.apenasAplicar ?? false;

  const resultado: ResultadoCategorizacaoCnae = {
    cnaesJaEmCache: await db.categoriaSugeridaPorCnae.count(),
    cnaesEnviadosParaIa: 0,
    cnaesGravados: 0,
    cnaesSemCategoriaPertinente: 0,
    candidatosAtualizados: 0,
    erros: [],
  };

  if (!apenasAplicar) {
    const fornecedoresAtivos = await db.fornecedor.findMany({
      where: { status: "ativo" },
      select: { categoria: true },
    });
    const categoriasDisponiveis = [...new Set(fornecedoresAtivos.flatMap((f) => f.categoria))];

    const pendentes =
      categoriasDisponiveis.length === 0 ? [] : await listarCnaesSemCache(opcoes.limite);
    resultado.cnaesEnviadosParaIa = pendentes.length;

    await processarComConcorrencia(
      pendentes,
      concorrencia,
      async (cnae) => {
        const categorias = await sugerirCategoriasParaObjeto(
          cnae.cnaeDescricao,
          categoriasDisponiveis,
        );
        if (categorias.length === 0) resultado.cnaesSemCategoriaPertinente++;

        if (dryRun) {
          resultado.cnaesGravados++;
          return;
        }

        try {
          await db.categoriaSugeridaPorCnae.create({
            data: {
              cnaeCodigo: cnae.cnaeCodigo,
              cnaeDescricao: cnae.cnaeDescricao,
              categorias,
            },
          });
          resultado.cnaesGravados++;
        } catch (erro) {
          if (isViolacaoUnica(erro)) {
            resultado.cnaesGravados++;
            return;
          }
          throw erro;
        }
      },
      (cnae, erro) => {
        resultado.erros.push({ cnaeCodigo: cnae.cnaeCodigo, motivo: motivoErro(erro) });
      },
    );
  }

  if (!dryRun) {
    resultado.candidatosAtualizados = await aplicarCacheNasEmpresas();
  }

  return resultado;
}
