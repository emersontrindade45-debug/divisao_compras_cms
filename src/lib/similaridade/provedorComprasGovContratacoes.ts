import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { excluirDiscrepantes } from "@/lib/domain/priceStats";
import { processarComConcorrencia } from "./processarComConcorrencia";
import { encontrarCodigosCatalogoLocal } from "./matchingCatalogoLocal";
import {
  buscarItensContratacoesCompraGov,
  type ItemContratacaoCompraGov,
  type PeriodoConsulta,
} from "@/lib/integracoes/comprasGovContratacoes";

/**
 * Provedor de busca pública sobre `modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133`
 * do Compras.gov.br (M16, docs/ApiPlan.md §4.1) — fecha a lacuna de material de
 * consumo e TI/equipamentos (cobertura zero antes deste provedor).
 *
 * `buscarItensContratacoesCompraGov` só filtra por `codItemCatalogo`/`codigoClasse`
 * — não existe busca por texto livre nessa API (spike §4.1e). Este módulo faz a
 * ponte: termo de busca livre → códigos CATMAT candidatos (via matching local
 * sobre `ItemCatalogoReferencia`, `matchingCatalogoLocal.ts`) → itens de
 * contratação por código.
 *
 * Todas as regras de conformidade (preço homologado, exclusão do próprio
 * órgão, descarte de item cancelado/sem resultado, evidência derivável) já
 * são aplicadas dentro de `buscarItensContratacoesCompraGov` — este módulo só
 * mapeia o resultado e trata dispersão (abaixo).
 */

// Mesma janela de recência que `comprasGov.ts` usa para serviços (IN 65/2021).
const JANELA_DIAS = 730;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Concorrência entre códigos CATMAT candidatos: cada chamada a
// `buscarItensContratacoesCompraGov` já pagina e divide a janela de 730 dias
// internamente (CLAUDE.md §9.11) — não sequencial, não paralelo sem limite.
const CONCORRENCIA_CODIGOS = 3;

function periodoRecencia(): PeriodoConsulta {
  const dataFinal = new Date();
  const dataInicial = new Date(dataFinal.getTime() - JANELA_DIAS * MS_POR_DIA);
  return { dataInicial, dataFinal };
}

/** Agrupa por `codItemCatalogo` — a mesma chave usada no filtro da chamada que produziu o item. */
function agruparPorCodigo(
  itens: ItemContratacaoCompraGov[],
): Map<number | null, ItemContratacaoCompraGov[]> {
  const grupos = new Map<number | null, ItemContratacaoCompraGov[]>();
  for (const item of itens) {
    const grupo = grupos.get(item.codItemCatalogo);
    if (grupo) grupo.push(item);
    else grupos.set(item.codItemCatalogo, [item]);
  }
  return grupos;
}

/**
 * Aplica `excluirDiscrepantes()` (`src/lib/domain/priceStats.ts` — reusado,
 * não reimplementado) por grupo de código CATMAT. O spike do M16 encontrou
 * R$ 0,26 e R$ 96,37 para o mesmo código (docs/ApiPlan.md §4.1, "dado
 * incômodo") — parte unidade de fornecimento divergente, parte erro de
 * digitação do órgão comprador; nenhum preço bruto demais entra na
 * estimativa sem esse filtro. CATMAT é material de consumo, não obra:
 * tolerância de `excluirDiscrepantes` é sempre `"aquisicao"`.
 */
function filtrarDispersao(itens: ItemContratacaoCompraGov[]): ItemContratacaoCompraGov[] {
  const resultado: ItemContratacaoCompraGov[] = [];

  for (const [codigo, grupoItens] of agruparPorCodigo(itens)) {
    const precos = grupoItens.map((item) => item.valorUnitarioResultado);
    const { incluidos, excluidos } = excluirDiscrepantes(precos, "aquisicao");

    if (excluidos.length > 0) {
      console.warn(
        `[ProvedorComprasGovContratacoes] Código CATMAT ${codigo ?? "desconhecido"}: ` +
          `${excluidos.length} de ${precos.length} preço(s) excluído(s) por dispersão ` +
          `(fora do intervalo aceitável em torno da mediana): [${excluidos.join(", ")}].`,
      );
    }

    // `incluidos` é uma lista de valores, não de índices — usa um "saque" de
    // multiset (splice ao casar) para lidar corretamente com preços
    // duplicados no grupo, em vez de `includes()` simples.
    const restante = [...incluidos];
    for (const item of grupoItens) {
      const indice = restante.indexOf(item.valorUnitarioResultado);
      if (indice === -1) continue;
      restante.splice(indice, 1);
      resultado.push(item);
    }
  }

  return resultado;
}

/**
 * Convenção de mapeamento igual à de `buscarContratosPNCP` (`pncp.ts`).
 * `identidadeContratacao` só é preenchida quando `numeroItemPncp` não é
 * `null` — a interface exige `number`, e sem esse campo o candidato ainda é
 * válido, só cai no fallback de deduplicação (`deduplicarCandidatos.ts`).
 */
function mapearParaCandidato(item: ItemContratacaoCompraGov): CandidatoSimilaridade {
  const candidato: CandidatoSimilaridade = {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: item.descricaoItem,
    fonteOrgaoOuId: item.orgaoEntidadeCnpj,
    fonteUrl: item.fonteUrl,
    valorUnitario: item.valorUnitarioResultado,
    dataReferencia: item.dataResultado,
    unidade: item.unidade,
    quantidade: item.quantidadeHomologada,
  };

  if (item.numeroItemPncp !== null) {
    candidato.identidadeContratacao = {
      cnpjOrgao: item.orgaoEntidadeCnpj,
      ano: item.ano,
      numeroSequencial: item.numeroSequencial,
      numeroItem: item.numeroItemPncp,
    };
  }

  return candidato;
}

/**
 * Busca candidatos de similaridade no `modulo-contratacoes` do Compras.gov,
 * a partir de um termo de busca livre.
 *
 * Devolve `[]` cedo — sem chamar `buscarItensContratacoesCompraGov` — quando
 * o matching local não encontra nenhum código CATMAT: tabela
 * `ItemCatalogoReferencia` ainda vazia (ingestão real do catálogo ainda não
 * rodou em produção) ou termo sem correspondência textual. Não é erro: o
 * provedor é um no-op seguro até a ingestão acontecer.
 */
export async function buscarCandidatosComprasGovContratacoes(
  termo: string,
): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  try {
    const codigos = await encontrarCodigosCatalogoLocal(termo);
    if (codigos.length === 0) return [];

    const periodo = periodoRecencia();
    const porCodigo = await processarComConcorrencia(
      codigos,
      CONCORRENCIA_CODIGOS,
      (codigo) => buscarItensContratacoesCompraGov({ codItemCatalogo: codigo }, periodo),
      (codigo, erro) =>
        console.warn(
          `[ProvedorComprasGovContratacoes] Erro ao buscar itens do código CATMAT ${codigo}:`,
          erro,
        ),
    );

    const itens = porCodigo.filter((r): r is ItemContratacaoCompraGov[] => Array.isArray(r)).flat();
    const semDispersao = filtrarDispersao(itens);

    return semDispersao.map(mapearParaCandidato);
  } catch (err) {
    console.error(
      `[ProvedorComprasGovContratacoes] Erro inesperado ao buscar candidatos para "${termo}":`,
      err,
    );
    return [];
  }
}
