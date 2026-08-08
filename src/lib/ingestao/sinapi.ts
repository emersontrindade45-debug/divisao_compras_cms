import * as XLSX from "xlsx";
import { normalizar } from "@/lib/similaridade/texto";
import type { NormalizacaoLinha, PrecoReferenciaNormalizado } from "./runner";

/**
 * Parser do relatório de **Composições Sintético** do SINAPI (Caixa) —
 * `SINAPI_Custo_Ref_Composicoes_Sintetico_{UF}_{AAAAMM}_{Regime}.xlsx`.
 *
 * Composições, não insumos: o spike do M17 (`docs/ApiPlan-M17-spike.md` §1.3)
 * concluiu que composição é a referência certa para a maioria dos itens de
 * pesquisa de preço de obra/serviço de engenharia — insumo avulso raramente é
 * o que se cota. "Sintético" (não "Analítico"): traz custo total já calculado,
 * sem a receita de insumos que compõe cada composição — o Analítico serve
 * para decomposição/conferência, não para a série de preço principal.
 *
 * Estrutura confirmada por inspeção direta do arquivo real de dezembro/2024
 * (`docs/ApiPlan-M17-spike.md` §4, seção "Estrutura de colunas"):
 *   linha 1 — título + DATA DE EMISSÃO + DATA DE RT
 *   linha 2 — ENCARGOS SOCIAIS SOBRE PREÇOS DA MÃO-DE-OBRA
 *   linha 3 — ABRANGÊNCIA / LOCALIDADE / DATA DE PREÇO (competência) / REFERÊNCIA COLETA
 *   linha 4 — vazia
 *   linha 5 — cabeçalho de coluna
 *   linha 6 — vazia
 *   linha 7+ — dados
 *
 * Os percentuais de encargos sociais (linha 2) e o regime desonerado/não
 * aparecem no **arquivo de origem inteiro** (dois ZIPs separados, não colunas
 * — §4 do spike), não linha a linha: por isso `regime` é parâmetro externo de
 * `normalizarLinhaSinapi`, informado por quem chama o runner (que sabe qual
 * dos dois ZIPs baixou), não extraído do conteúdo da planilha.
 */

const COLUNAS_ESPERADAS = [
  "DESCRICAO DA CLASSE",
  "SIGLA DA CLASSE",
  "DESCRICAO DO TIPO 1",
  "SIGLA DO TIPO 1",
  "CODIGO DO AGRUPADOR",
  "DESCRICAO DO AGRUPADOR",
  "CODIGO  DA COMPOSICAO",
  "DESCRICAO DA COMPOSICAO",
  "UNIDADE",
  "ORIGEM DE PREÇO",
  "CUSTO TOTAL",
  "VINCULO",
] as const;

const LINHA_CABECALHO_COLUNA = 4; // índice 0-based — linha 5 da planilha
const PRIMEIRA_LINHA_DADOS = 6; // índice 0-based — linha 7 da planilha

function lerPlanilha(conteudo: Buffer): string[][] | null {
  try {
    const wb = XLSX.read(conteudo, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return null;
    return XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
  } catch {
    return null;
  }
}

/**
 * Confirma que a linha 5 tem exatamente as 12 colunas esperadas, na ordem
 * esperada. Cabeçalho diferente = layout mudou (CLAUDE.md §9.22/§9.10 —
 * runner rejeita o lote inteiro, nunca tenta adivinhar um formato novo). O
 * SINAPI já mudou de layout 4 vezes em 6 anos, documentado no spike (§1.7) —
 * este risco é medido, não teórico.
 */
export function validarCabecalhoSinapi(conteudo: Buffer): { valido: boolean; motivo?: string } {
  const linhas = lerPlanilha(conteudo);
  if (!linhas) {
    return { valido: false, motivo: "Arquivo não é um XLSX válido ou está corrompido." };
  }

  const linhaCabecalho = linhas[LINHA_CABECALHO_COLUNA];
  if (!linhaCabecalho) {
    return {
      valido: false,
      motivo: `Cabeçalho de coluna não encontrado na linha ${LINHA_CABECALHO_COLUNA + 1} esperada.`,
    };
  }

  const colunasNormalizadas = linhaCabecalho.map((c) => (c ?? "").trim().replace(/\s+/g, " "));
  const esperadasNormalizadas = COLUNAS_ESPERADAS.map((c) => c.replace(/\s+/g, " "));

  for (let i = 0; i < esperadasNormalizadas.length; i++) {
    if (colunasNormalizadas[i] !== esperadasNormalizadas[i]) {
      return {
        valido: false,
        motivo:
          `Layout inesperado: coluna ${i + 1} esperada "${esperadasNormalizadas[i]}", ` +
          `encontrada "${colunasNormalizadas[i] ?? "(vazia)"}".`,
      };
    }
  }

  return { valido: true };
}

/** Extrai `AAAA-MM` de "DATA DE PREÇO   : 12/2024" — formato mm/aaaa no arquivo real. */
function extrairCompetencia(linhaContexto: string): string | null {
  const m = linhaContexto.match(/DATA DE PRE[ÇC]O\s*:\s*(\d{2})\/(\d{4})/i);
  if (!m) return null;
  return `${m[2]}-${m[1]}`;
}

/** Extrai o nome da localidade de "LOCALIDADE  : SAO PAULO ... DATA DE PREÇO". */
function extrairLocalidade(linhaContexto: string): string | null {
  const m = linhaContexto.match(/LOCALIDADE\s*:\s*(.+?)\s{2,}/i);
  return m ? m[1].trim() : null;
}

export interface LinhaSinapiComposicaoSintetico {
  descricaoClasse: string;
  codigoComposicao: string;
  descricaoComposicao: string;
  unidade: string;
  custoTotal: string;
  vinculo: string;
  /** "AAAA-MM", extraída do cabeçalho de contexto (linha 3) do arquivo. */
  competencia: string;
  /** Nome da localidade de referência IBGE (ex.: "SAO PAULO" — a capital, não a sigla de UF). */
  localidade: string;
}

/**
 * Quebra o arquivo em linhas de dados (a partir da linha 7), já com a
 * competência e a localidade do cabeçalho de contexto anexadas a cada linha
 * — mantém `NormalizacaoLinha` independente de estado externo, mesmo padrão
 * de assinatura do runner genérico (`runner.ts`).
 */
export function parsearLinhasSinapi(conteudo: Buffer): LinhaSinapiComposicaoSintetico[] {
  const linhas = lerPlanilha(conteudo);
  if (!linhas) {
    throw new Error("Arquivo não é um XLSX válido ou está corrompido.");
  }

  const linhaContexto = linhas[2]?.[0] ?? "";
  const competencia = extrairCompetencia(linhaContexto);
  const localidade = extrairLocalidade(linhaContexto);
  if (!competencia) {
    throw new Error("Não foi possível extrair a competência (DATA DE PREÇO) do cabeçalho do arquivo.");
  }
  if (!localidade) {
    throw new Error("Não foi possível extrair a localidade do cabeçalho do arquivo.");
  }

  const linhasDados = linhas.slice(PRIMEIRA_LINHA_DADOS);
  const resultado: LinhaSinapiComposicaoSintetico[] = [];

  for (const linha of linhasDados) {
    // Linhas totalmente vazias (rodapé, ou lacunas do XLSX) não são dado.
    if (!linha || linha.every((c) => (c ?? "").trim() === "")) continue;

    resultado.push({
      descricaoClasse: (linha[0] ?? "").trim(),
      codigoComposicao: (linha[6] ?? "").trim(),
      descricaoComposicao: (linha[7] ?? "").trim(),
      unidade: (linha[8] ?? "").trim(),
      custoTotal: (linha[10] ?? "").trim(),
      vinculo: (linha[11] ?? "").trim(),
      competencia,
      localidade,
    });
  }

  return resultado;
}

/** "5.602,92" (separador de milhar BR + vírgula decimal) → 5602.92. Retorna `null` se inválido. */
function parsearValorBr(valor: string): number | null {
  const limpo = valor.trim();
  if (!limpo) return null;
  const semMilhar = limpo.replace(/\./g, "").replace(",", ".");
  const numero = Number(semMilhar);
  return Number.isFinite(numero) ? numero : null;
}

export type RegimeSinapi = "desonerado" | "nao_desonerado";

/**
 * Normaliza uma linha de composição SINAPI para o formato que o runner
 * genérico grava em `PrecoReferencia`. `regime` vem de quem chama (o ZIP de
 * origem determina o regime — não é uma coluna da planilha, ver nota acima).
 */
export function normalizarLinhaSinapi(
  linha: LinhaSinapiComposicaoSintetico,
  regime: RegimeSinapi,
): NormalizacaoLinha {
  if (!linha.codigoComposicao) {
    return { ok: false, motivo: "Código da composição vazio." };
  }
  if (!linha.descricaoComposicao) {
    return { ok: false, motivo: `Descrição vazia para o código ${linha.codigoComposicao}.` };
  }
  if (!linha.unidade) {
    return { ok: false, motivo: `Unidade vazia para o código ${linha.codigoComposicao}.` };
  }

  const valorUnitario = parsearValorBr(linha.custoTotal);
  if (valorUnitario === null) {
    return {
      ok: false,
      motivo: `Custo total inválido ("${linha.custoTotal}") para o código ${linha.codigoComposicao}.`,
    };
  }
  if (valorUnitario <= 0) {
    return {
      ok: false,
      motivo: `Custo total não positivo (${valorUnitario}) para o código ${linha.codigoComposicao}.`,
    };
  }

  const [ano, mes] = linha.competencia.split("-").map(Number);
  const preco: PrecoReferenciaNormalizado = {
    codigo: linha.codigoComposicao,
    descricao: linha.descricaoComposicao,
    descricaoNormalizada: normalizar(linha.descricaoComposicao),
    unidade: linha.unidade,
    valorUnitario,
    dataReferencia: new Date(Date.UTC(ano, mes - 1, 1)),
    uf: "SP",
    regime,
    // Não há URL por item/registro (spike §1.6 — "Sumário de Publicações" descontinuado, sem
    // link estável por competência confirmado por fonte primária além do padrão de nome de
    // arquivo). A evidência exigida pelo CLAUDE.md §9.8 aqui é o portal oficial de downloads —
    // mesma URL para toda a competência, não um link por registro; sem preenchê-la, o candidato
    // ficaria sem evidência acessível e não poderia alimentar a estimativa.
    urlEvidencia: "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
    metadados: {
      descricaoClasse: linha.descricaoClasse,
      vinculo: linha.vinculo,
      localidade: linha.localidade,
    },
  };

  return { ok: true, preco };
}

export interface ResultadoDeteccaoZeramentoEmMassa {
  suspeito: boolean;
  totalLinhas: number;
  linhasZeradas: number;
  proporcao: number;
}

/**
 * Detecta o precedente documentado no spike (§2): a Caixa publicou
 * out–dez/2025 com custos **zerados em massa** por falha de envio do IBGE,
 * mantendo o arquivo estruturalmente válido (cabeçalho ok, linhas presentes).
 * "Cabeçalho ok" não é garantia de "preço utilizável" — chamado pelo runner
 * ANTES da normalização, sobre as linhas brutas, porque `normalizarLinhaSinapi`
 * já rejeita custo <= 0 individualmente: sem esta checagem em separado, um
 * lote inteiro zerado apareceria como "100% das linhas rejeitadas" sem
 * nenhum sinal de que a causa é uma falha sistêmica da fonte, não um erro de
 * parsing linha a linha.
 */
export function detectarZeramentoEmMassa(
  linhas: LinhaSinapiComposicaoSintetico[],
  limiarProporcao = 0.5,
): ResultadoDeteccaoZeramentoEmMassa {
  const totalLinhas = linhas.length;
  if (totalLinhas === 0) {
    return { suspeito: false, totalLinhas: 0, linhasZeradas: 0, proporcao: 0 };
  }

  const linhasZeradas = linhas.filter((linha) => {
    const valor = parsearValorBr(linha.custoTotal);
    return valor === null || valor <= 0;
  }).length;

  const proporcao = linhasZeradas / totalLinhas;
  return { suspeito: proporcao >= limiarProporcao, totalLinhas, linhasZeradas, proporcao };
}
