// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): scripts/enriquecer-fornecedores-cnpj.ts
// precisa importar este módulo fora do bundler do Next, onde `server-only` sempre lança. Não é
// alcançável a partir de `components/` — só pelo script administrativo.
import { db } from "@/lib/db";
import { consultarDadosCadastraisCnpj } from "@/lib/integracoes/situacaoCadastralCnpj";
import { sugerirCategoriasParaObjeto } from "@/lib/ia/categorizarObjeto";
import { CAMADAS_GEOGRAFICAS } from "@/lib/domain/camadaGeografica";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/**
 * Enriquecimento em lote (M26) de `Fornecedor` a partir do CNPJ já cadastrado — nunca busca por
 * nome. A chave é exata (CNPJ → dados da Receita via BrasilAPI), então não há o risco de
 * correspondência ambígua que existiria tentando achar CNPJ a partir só da razão social (por isso
 * fornecedor sem CNPJ nenhum fica de fora desta rotina, por decisão consciente — ver docs/PLAN.md M26).
 *
 * Só preenche campo VAZIO — nunca sobrescreve Cidade/Estado/Tag já cadastrados manualmente.
 * - Cidade/Estado: vêm do `municipio`/`uf` da BrasilAPI. Cidade é normalizada contra a grafia
 *   canônica de `CAMADAS_GEOGRAFICAS` (a BrasilAPI devolve município sem acento e em maiúsculas,
 *   ex. "SAO VICENTE" — sem normalizar, "São Vicente" nunca bateria na camada Baixada Santista).
 * - Tag: só quando o fornecedor não tem NENHUMA categoria ainda. Usa a mesma IA de
 *   `sugerirCategoriasParaObjeto` (M25) sobre a descrição do CNAE (principal + secundários) — escolhe
 *   só entre as Tags que já existem no cadastro real, nunca inventa uma nova (mesmo filtro
 *   defensivo do M25, CLAUDE.md §9.12).
 */

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

const CIDADES_CANONICAS = new Map(
  CAMADAS_GEOGRAFICAS.flatMap((c) => c.cidades ?? []).map((cidade) => [normalizarTexto(cidade), cidade]),
);

function tituloCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length > 2 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/** Prefere a grafia canônica de `CAMADAS_GEOGRAFICAS` quando o município é uma das cidades da Baixada Santista. */
function normalizarMunicipio(municipioBruto: string): string {
  const canonica = CIDADES_CANONICAS.get(normalizarTexto(municipioBruto));
  return canonica ?? tituloCase(municipioBruto);
}

interface FornecedorParaEnriquecer {
  id: string;
  cnpj: string;
  cidade: string;
  estado: string;
  categoria: string[];
}

export interface ResultadoEnriquecimentoCnpj {
  processados: number;
  cidadeEstadoPreenchidos: number;
  categoriaSugerida: number;
  naoEncontradosNaApi: number;
  semNadaParaFazer: number;
  erros: { fornecedorId: string; cnpj: string; motivo: string }[];
}

export async function enriquecerFornecedoresPorCnpj(opcoes: {
  limite?: number;
  concorrencia?: number;
  dryRun?: boolean;
} = {}): Promise<ResultadoEnriquecimentoCnpj> {
  const concorrencia = opcoes.concorrencia ?? 5;

  const candidatos = (await db.fornecedor.findMany({
    where: {
      status: "ativo",
      cnpj: { not: null },
      OR: [{ AND: [{ cidade: "" }, { estado: "" }] }, { categoria: { isEmpty: true } }],
    },
    select: { id: true, cnpj: true, cidade: true, estado: true, categoria: true },
    take: opcoes.limite,
  })) as FornecedorParaEnriquecer[];

  const fornecedoresAtivos = await db.fornecedor.findMany({
    where: { status: "ativo" },
    select: { categoria: true },
  });
  const categoriasDisponiveis = [...new Set(fornecedoresAtivos.flatMap((f) => f.categoria))];

  const resultado: ResultadoEnriquecimentoCnpj = {
    processados: 0,
    cidadeEstadoPreenchidos: 0,
    categoriaSugerida: 0,
    naoEncontradosNaApi: 0,
    semNadaParaFazer: 0,
    erros: [],
  };

  await processarComConcorrencia(
    candidatos,
    concorrencia,
    async (fornecedor) => {
      resultado.processados++;

      const consulta = await consultarDadosCadastraisCnpj(fornecedor.cnpj);
      if (!consulta.encontrado) {
        resultado.naoEncontradosNaApi++;
        return;
      }

      const dadosUpdate: { cidade?: string; estado?: string; categoria?: string[] } = {};

      const precisaCidadeEstado = fornecedor.cidade === "" && fornecedor.estado === "";
      if (precisaCidadeEstado && consulta.dados.municipio && consulta.dados.uf) {
        dadosUpdate.cidade = normalizarMunicipio(consulta.dados.municipio);
        dadosUpdate.estado = consulta.dados.uf;
      }

      if (fornecedor.categoria.length === 0 && consulta.dados.atividadesEconomicas.length > 0) {
        const sugeridas = await sugerirCategoriasParaObjeto(
          consulta.dados.atividadesEconomicas.join("; "),
          categoriasDisponiveis,
        );
        if (sugeridas.length > 0) dadosUpdate.categoria = sugeridas;
      }

      if (Object.keys(dadosUpdate).length === 0) {
        resultado.semNadaParaFazer++;
        return;
      }

      if (dadosUpdate.cidade) resultado.cidadeEstadoPreenchidos++;
      if (dadosUpdate.categoria) resultado.categoriaSugerida++;

      if (!opcoes.dryRun) {
        await db.fornecedor.update({ where: { id: fornecedor.id }, data: dadosUpdate });
      }
    },
    (fornecedor, erro) => {
      resultado.erros.push({
        fornecedorId: fornecedor.id,
        cnpj: fornecedor.cnpj,
        motivo: erro instanceof Error ? erro.message : String(erro),
      });
    },
  );

  return resultado;
}
