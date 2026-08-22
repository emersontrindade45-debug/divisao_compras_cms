// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): scripts/categorizar-candidatos-cnpj.ts
// precisa importar este módulo fora do bundler do Next, onde `server-only` sempre lança. Não é
// alcançável a partir de `components/` — só pelo script administrativo.
import { dbCandidatos as db } from "@/lib/dbCandidatos";
import { sugerirCategoriasParaObjeto } from "@/lib/ia/categorizarObjeto";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/**
 * Categorização de candidatos CNPJ/SP (M27, etapa 4) — decisão de escopo deliberada: o cache é por
 * CÓDIGO CNAE (subclasse, ~1.300 possíveis no Brasil), nunca por empresa. Chamar a IA uma vez por
 * uma das 8,66M linhas importadas é inviável em custo/tempo; o mesmo CNAE se repete em milhares de
 * empresas, então basta classificar o código uma vez e propagar.
 *
 * Parte A: para cada código CNAE presente em `EmpresaCandidataFornecedor` que ainda não tem entrada
 * em `CategoriaSugeridaPorCnae`, chama `sugerirCategoriasParaObjeto` (mesmo filtro anti-alucinação
 * do M25 — só escolhe entre categorias já cadastradas em `Fornecedor.categoria`) e grava o
 * resultado no cache via upsert (aceitável linha a linha aqui — no máximo ~1.300 linhas, muito
 * longe do volume de milhões que exigiria SQL em lote, CLAUDE.md §9.72).
 *
 * Parte B: aplica o cache em `EmpresaCandidataFornecedor.categoriaSugerida` com um ÚNICO
 * `UPDATE ... FROM` (não um update por CNAE) — a tabela de candidatos não tem índice em
 * `cnaePrincipalCodigo` (só `[estado, municipio]` e GIN em `categoriaSugerida`), então N updates
 * individuais seriam N seq-scans catastróficos contra 8,66M linhas; um único UPDATE...FROM faz UM
 * seq-scan + hash join com a tabela de cache (pequena). Só preenche quem ainda está com
 * `categoriaSugerida` vazio (`= '{}'`) — nunca sobrescreve uma categorização já aplicada, o que
 * torna a operação idempotente e barata em reruns (mesma regra de "nunca sobrescrever" de
 * `enriquecerFornecedoresPorCnpj.ts`, M26).
 */

export interface ResultadoCategorizacaoCnae {
  cnaesEncontrados: number;
  cnaesJaCacheados: number;
  cnaesProcessados: number;
  cnaesComCategoria: number;
  cnaesSemCategoria: number;
  linhasAtualizadas: number;
  erros: { cnaeCodigo: string; motivo: string }[];
}

interface CnaeParaCategorizar {
  cnaeCodigo: string;
  cnaeDescricao: string;
}

export async function categorizarCandidatosCnae(
  opcoes: {
    limite?: number;
    concorrencia?: number;
    dryRun?: boolean;
  } = {},
): Promise<ResultadoCategorizacaoCnae> {
  // Mesmo valor conservador de `enriquecerFornecedoresPorCnpj.ts` (M26) — evita estourar rate
  // limit da API de IA.
  const concorrencia = opcoes.concorrencia ?? 3;

  const [gruposBrutos, jaCacheados] = await Promise.all([
    db.empresaCandidataFornecedor.groupBy({
      by: ["cnaePrincipalCodigo", "cnaePrincipalDescricao"],
    }),
    db.categoriaSugeridaPorCnae.findMany({ select: { cnaeCodigo: true } }),
  ]);

  // O mesmo código pode aparecer com descrições ligeiramente diferentes na base importada
  // (variação de grafia entre competências da RFB) — o groupBy agrupa por (código, descrição), então
  // dedupamos por código aqui, mantendo a primeira descrição encontrada.
  const descricaoPorCodigo = new Map<string, string>();
  for (const grupo of gruposBrutos) {
    if (!descricaoPorCodigo.has(grupo.cnaePrincipalCodigo)) {
      descricaoPorCodigo.set(grupo.cnaePrincipalCodigo, grupo.cnaePrincipalDescricao);
    }
  }
  const distintos: CnaeParaCategorizar[] = [...descricaoPorCodigo.entries()].map(
    ([cnaeCodigo, cnaeDescricao]) => ({ cnaeCodigo, cnaeDescricao }),
  );

  const cacheadosSet = new Set(jaCacheados.map((c) => c.cnaeCodigo));
  const novos = distintos.filter((d) => !cacheadosSet.has(d.cnaeCodigo));
  const alvo = opcoes.limite !== undefined ? novos.slice(0, opcoes.limite) : novos;

  const fornecedoresAtivos = await db.fornecedor.findMany({
    where: { status: "ativo" },
    select: { categoria: true },
  });
  const categoriasDisponiveis = [...new Set(fornecedoresAtivos.flatMap((f) => f.categoria))];

  const resultado: ResultadoCategorizacaoCnae = {
    cnaesEncontrados: distintos.length,
    cnaesJaCacheados: distintos.length - novos.length,
    cnaesProcessados: 0,
    cnaesComCategoria: 0,
    cnaesSemCategoria: 0,
    linhasAtualizadas: 0,
    erros: [],
  };

  await processarComConcorrencia(
    alvo,
    concorrencia,
    async (cnae) => {
      resultado.cnaesProcessados++;

      const categorias = await sugerirCategoriasParaObjeto(cnae.cnaeDescricao, categoriasDisponiveis);
      if (categorias.length > 0) resultado.cnaesComCategoria++;
      else resultado.cnaesSemCategoria++;

      if (!opcoes.dryRun) {
        await db.categoriaSugeridaPorCnae.upsert({
          where: { cnaeCodigo: cnae.cnaeCodigo },
          create: { cnaeCodigo: cnae.cnaeCodigo, cnaeDescricao: cnae.cnaeDescricao, categorias },
          update: { cnaeDescricao: cnae.cnaeDescricao, categorias },
        });
      }
    },
    (cnae, erro) => {
      resultado.erros.push({
        cnaeCodigo: cnae.cnaeCodigo,
        motivo: erro instanceof Error ? erro.message : String(erro),
      });
    },
  );

  // Parte B roda sobre o cache inteiro (não só os CNAEs processados nesta chamada) — reruns
  // aplicam categorização calculada em execuções anteriores para candidatos que ainda não a
  // receberam (ex.: rodagem anterior interrompida, ou candidato importado depois). Em dry-run
  // nenhuma escrita acontece, nem esta.
  if (!opcoes.dryRun) {
    resultado.linhasAtualizadas = await db.$executeRaw`
      UPDATE "empresas_candidatas_fornecedor" AS e
      SET "categoriaSugerida" = c."categorias", "atualizadoEm" = now()
      FROM "categorias_sugeridas_por_cnae" AS c
      WHERE e."cnaePrincipalCodigo" = c."cnaeCodigo"
        AND c."categorias" <> '{}'
        AND e."categoriaSugerida" = '{}'
    `;
  }

  return resultado;
}
