import { CAMADAS_GEOGRAFICAS } from "./camadaGeografica";

/**
 * NFD + remove diacríticos + maiúsculas — normalização de texto para comparação tolerante a
 * acento/caixa (nome de cidade, razão social). Extraído do M26 (`enriquecerFornecedoresPorCnpj`)
 * para módulo compartilhado no M27, que precisa da mesma normalização de município ao importar
 * candidatos a Fornecedor da base CNPJ da Receita Federal.
 */
export function normalizarTexto(s: string): string {
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

/**
 * Prefere a grafia canônica de `CAMADAS_GEOGRAFICAS` quando o município é uma das cidades da
 * Baixada Santista. Fontes externas (BrasilAPI, dump CNPJ da Receita) devolvem município sem
 * acento e em maiúsculas (ex. "SAO VICENTE") — sem normalizar, "São Vicente" nunca bateria na
 * camada Baixada Santista.
 */
export function normalizarMunicipio(municipioBruto: string): string {
  const semAcento = normalizarTexto(municipioBruto);
  const canonica = CIDADES_CANONICAS.get(semAcento);
  // O fallback opera sobre o texto JÁ sem acento (semAcento), não sobre municipioBruto — senão
  // duas entradas que representam a mesma cidade ("São Paulo" vindo de um formulário de busca
  // digitado à mão vs. "SAO PAULO" vindo do CSV da Receita) normalizariam para strings
  // diferentes ("São Paulo" vs. "Sao Paulo"), e uma busca por município nunca bateria com o
  // dado gravado. Regressão real: /fornecedores/descobrir devolvia 0 resultados buscando
  // "São Paulo" contra candidatos gravados como "Sao Paulo".
  return canonica ?? tituloCase(semAcento);
}
