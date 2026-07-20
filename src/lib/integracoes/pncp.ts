import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const PNCP_SEARCH_BASE_URL = "https://pncp.gov.br/api/search";
const PNCP_ITENS_BASE_URL = "https://pncp.gov.br/pncp-api/v1";

const TAMANHO_PAGINA = 20;

// CNPJ do próprio órgão — contratos da Câmara Municipal de Santos são excluídos
// da pesquisa de similaridade para evitar que o próprio contrato sendo renovado
// apareça como referência de preço. Configurável via variável de ambiente.
const CNPJ_ORGAO_PROPRIO = process.env.ORGAO_CNPJ ?? "49203409000102";

// O PNCP derruba conexões (ECONNRESET) ou responde 429 sob rajadas de requisições —
// comum ao processar cotações com muitos itens, cada um exigindo ≥3 preços. Retry com
// backoff absorve o throttling transitório; o lote limita a rajada de buscas de itens.
const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 1000;
const LOTE_BUSCA_ITENS = 5;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchComRetry(url: string): Promise<Response> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const retryavel = res.status === 429 || res.status >= 500;
      if (res.ok || !retryavel || tentativa === MAX_TENTATIVAS) return res;
      console.warn(`[PNCP] HTTP ${res.status} (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`);
    } catch (err) {
      ultimoErro = err;
      if (tentativa === MAX_TENTATIVAS) throw err;
      console.warn(`[PNCP] Falha de rede (tentativa ${tentativa}/${MAX_TENTATIVAS}): ${url}`, err);
    }
    await esperar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
  }
  throw ultimoErro ?? new Error("[PNCP] Tentativas esgotadas.");
}

interface PNCPSearchItem {
  numero_controle_pncp: string;
  orgao_nome: string;
  orgao_cnpj: string;
  ano: string;
  numero_sequencial: string;
}

interface PNCPItemResponse {
  descricao: string;
  valorUnitarioEstimado: number;
  quantidade: number;
  unidadeMedida: string;
  dataAtualizacao: string;
}

/**
 * Busca textual real do PNCP (mesmo endpoint usado pelo site oficial em
 * pncp.gov.br/busca). A API de Consulta (/api/consulta) não suporta texto
 * livre — esse endpoint é o que permite encontrar processos relevantes ao
 * termo do item, em vez de uma amostra aleatória de publicações recentes.
 */
async function buscarPorTexto(termo: string): Promise<PNCPSearchItem[]> {
  const params = new URLSearchParams({
    q: termo,
    tipos_documento: "edital",
    // Relevância, não data: a recência já é garantida depois pelo filtroRecencia
    // (corte de 365 dias); ordenar por data aqui só traz os editais mais recentes
    // que casam vagamente com o termo, sacrificando os realmente relevantes.
    ordenacao: "relevancia",
    pagina: "1",
    tam_pagina: String(TAMANHO_PAGINA),
  });

  const url = `${PNCP_SEARCH_BASE_URL}/?${params.toString()}`;
  const res = await fetchComRetry(url);
  if (!res.ok) {
    console.error(`[PNCP] Falha na busca textual ("${termo}"): HTTP ${res.status}`);
    return [];
  }

  const body = (await res.json()) as { items?: PNCPSearchItem[] };
  return body.items ?? [];
}

async function buscarItensDaCompra(processo: PNCPSearchItem): Promise<CandidatoSimilaridade[]> {
  const url = `${PNCP_ITENS_BASE_URL}/orgaos/${processo.orgao_cnpj}/compras/${processo.ano}/${processo.numero_sequencial}/itens`;

  try {
    const res = await fetchComRetry(url);
    if (!res.ok) {
      console.error(`[PNCP] Falha ao buscar itens de ${processo.numero_controle_pncp}: HTTP ${res.status}`);
      return [];
    }

    const itens = (await res.json()) as PNCPItemResponse[];
    return itens
      .filter((item) => item.valorUnitarioEstimado > 0)
      .map((item) => ({
        tipoCandidato: "contratacao_publica" as const,
        fonteDescricao: item.descricao,
        fonteOrgaoOuId: processo.orgao_nome,
        fonteUrl: `https://pncp.gov.br/app/editais/${processo.orgao_cnpj}/${processo.ano}/${processo.numero_sequencial}`,
        valorUnitario: item.valorUnitarioEstimado,
        dataReferencia: new Date(item.dataAtualizacao),
        unidade: item.unidadeMedida,
        quantidade: item.quantidade,
      }));
  } catch (err) {
    console.error(`[PNCP] Erro ao buscar itens de ${processo.numero_controle_pncp}:`, err);
    return [];
  }
}

/**
 * Busca contratações públicas relevantes ao termo informado, usando a busca
 * textual do PNCP para encontrar processos prováveis e depois lendo os itens
 * de cada um. Deve ser chamada por item (descrição/palavras-chave), não uma
 * única vez por processo — o termo é o que torna os candidatos relevantes.
 */
export async function buscarContratosPNCP(termo: string): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];

  try {
    const todos = await buscarPorTexto(termo);

    // Exclui contratos do próprio órgão para evitar que o contrato sendo
    // renovado apareça como referência de preço na pesquisa de similaridade.
    const processos = CNPJ_ORGAO_PROPRIO
      ? todos.filter((p) => p.orgao_cnpj !== CNPJ_ORGAO_PROPRIO)
      : todos;

    if (processos.length === 0) return [];
    const itensPorProcesso: CandidatoSimilaridade[][] = [];
    for (let i = 0; i < processos.length; i += LOTE_BUSCA_ITENS) {
      const lote = processos.slice(i, i + LOTE_BUSCA_ITENS);
      itensPorProcesso.push(...(await Promise.all(lote.map(buscarItensDaCompra))));
    }
    return itensPorProcesso.flat();
  } catch (err) {
    console.error(`[PNCP] Erro inesperado ao buscar contratações para "${termo}":`, err);
    return [];
  }
}
