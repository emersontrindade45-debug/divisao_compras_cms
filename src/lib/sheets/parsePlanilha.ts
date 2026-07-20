/**
 * Parsing puro (sem I/O) da planilha de pesquisa de preços (Google Sheets).
 *
 * A planilha é mantida pela Divisão de Compras: cada arquivo corresponde a um
 * processo, com uma aba de dados onde cada linha é um item. As colunas são
 * detectadas pelo nome do cabeçalho, aceitando variações comuns em pt-BR.
 *
 * Regra de conformidade (Art. 57, III, Ato 17/2023 da CMS / IN 65): preços
 * abaixo de 30% da mediana são inexequíveis e acima de 30% são exorbitantes.
 */

export type TipoFontePlanilha = "contratacao_publica" | "site_eletronico";

export interface PrecoPlanilha {
  label: string;
  valor: number;
  tipoFonte: TipoFontePlanilha;
  incluido: boolean;
  motivoExclusao?: string;
}

export interface ItemPlanilha {
  item: number;
  material: string;
  grupo?: string;
  quantidade: number;
  limiteInferior: number;
  mediana: number;
  limiteSuperior: number;
  precos: PrecoPlanilha[];
}

export interface PlanilhaParseResult {
  itens: ItemPlanilha[];
}

// ─── Normalização ────────────────────────────────────────────────────────────

/** Remove acentos, caixa e espaços extras para comparação tolerante. */
function norm(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s\n\r]+/g, " ")
    .trim();
}

// ─── Padrões de colunas conhecidas ───────────────────────────────────────────

/**
 * Retorna true se o cabeçalho normalizado começa com algum dos prefixos.
 * Prefixos mais longos têm prioridade implícita por ordem na lista.
 */
function matches(header: string, prefixes: string[]): boolean {
  const n = norm(header);
  return prefixes.some((p) => n === p || n.startsWith(p));
}

// Nomes explícitos para a coluna de descrição do item
const MATERIAL_EXPLICIT = [
  "MATERIAL",
  "DESCRICAO DO MATERIAL",
  "DESCRICAO DO OBJETO",
  "DESCRICAO DO ITEM",
  "DESCRICAO",
  "DENOMINACAO",
  "ESPECIFICACAO",
  "ESPECIFIC",
  "OBJETO",
  "PRODUTO",
  "SERVICO",
];
// "ITEM" é ambíguo: pode ser número do item OU descrição.
// Só é tratado como coluna de descrição se nenhum nome explícito for encontrado.
const MATERIAL_FALLBACK_NORM = "ITEM";

const MEDIANA_PREFIXES = [
  "MEDIANA ESTIMADA",
  "MEDIANA DOS PRECO",
  "MEDIANA DOS PRECO",
  "VALOR MEDIANO",
  "VALOR DA MEDIANA",
  "PRECO MEDIANO",
  "MEDIANA",
];

const LIM_INF_PREFIXES = [
  "LIMITE INFERIOR",
  "LIM. INF",
  "LIM INF",
  "INEXEQUIVEL",
  "VALOR INEXEQUIVEL",
];

const LIM_SUP_PREFIXES = [
  "LIMITE SUPERIOR",
  "LIM. SUP",
  "LIM SUP",
  "EXORBITANTE",
  "VALOR EXORBITANTE",
];

const ITEM_NUM_PREFIXES = ["N. ITEM", "N ITEM", "NO ITEM", "NUM ITEM", "NUMERO DO ITEM"];

const QTDE_PREFIXES = [
  "QUANTIDADE MAXIMA",
  "QTDE MAX",
  "QTD MAX",
  "QUANTIDADE MINIMA",
  "QTDE MIN",
  "QTD MIN",
  "QUANTIDADE",
  "QTDE",
  "QTD",
  "QUANT",
  "QNT",
  "QTE",
];

// ─── Detecção de colunas ─────────────────────────────────────────────────────

interface DetectedColumns {
  headerIndex: number;
  materialCol: number;
  medianaCol: number;   // -1 se não encontrado
  limInfCol: number;    // -1 se não encontrado
  limSupCol: number;    // -1 se não encontrado
  itemNumCol: number;   // -1 se não encontrado
  qtdeCol: number;      // -1 se não encontrado
  priceStartCols: number[]; // colunas já conhecidas como não-preço (excluídas)
}

function detectColumns(rows: string[][]): DetectedColumns | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];

    // 1. Tenta nomes explícitos para a coluna de material/descrição
    let materialCol = row.findIndex((c) => matches(c ?? "", MATERIAL_EXPLICIT));

    // 2. Fallback: aceita "ITEM" como coluna de descrição se não achou nada melhor
    if (materialCol < 0) {
      materialCol = row.findIndex((c) => norm(c ?? "") === MATERIAL_FALLBACK_NORM);
    }

    if (materialCol < 0) continue;

    let medianaCol = -1;
    let limInfCol = -1;
    let limSupCol = -1;
    let itemNumCol = -1;
    let qtdeCol = -1;

    for (let c = 0; c < row.length; c++) {
      if (c === materialCol) continue; // já usado como material
      const h = row[c] ?? "";
      const n = norm(h);
      if (medianaCol < 0 && matches(h, MEDIANA_PREFIXES)) medianaCol = c;
      else if (limInfCol < 0 && matches(h, LIM_INF_PREFIXES)) limInfCol = c;
      else if (limSupCol < 0 && matches(h, LIM_SUP_PREFIXES)) limSupCol = c;
      // "ITEM" como coluna de número só é detectado se materialCol já foi resolvido por nome explícito
      else if (itemNumCol < 0 && (matches(h, ITEM_NUM_PREFIXES) || n === "ITEM")) itemNumCol = c;
      else if (qtdeCol < 0 && matches(h, QTDE_PREFIXES)) qtdeCol = c;
    }

    // Fallback posicional: se "LIMITE INFERIOR" achado mas MEDIANA/LS sem cabeçalho
    if (limInfCol >= 0) {
      if (medianaCol < 0) medianaCol = limInfCol + 1;
      if (limSupCol < 0) limSupCol = limInfCol + 2;
    }

    // Fallback final por posição absoluta (planilhas sem nenhum cabeçalho de estatística)
    if (medianaCol < 0 && materialCol >= 3) {
      limInfCol = 0;
      medianaCol = 1;
      limSupCol = 2;
    }

    const priceStartCols = [medianaCol, limInfCol, limSupCol, materialCol].filter(
      (c): c is number => c >= 0,
    );

    return {
      headerIndex: i,
      materialCol,
      medianaCol,
      limInfCol,
      limSupCol,
      itemNumCol,
      qtdeCol,
      priceStartCols,
    };
  }
  return null;
}

// ─── Utilitários existentes ───────────────────────────────────────────────────

const LEGEND_PATTERNS =
  /(em conformidade|preços? válidos|preços? exorbit|preços? inexequ|legenda|célula|c[óo]digo das c|aba bloqueada|limite de utiliza)/i;

/** Converte número em formato pt-BR ("R$ 2.327,18", "4606,15", "1.000") em number. NaN se inválido. */
export function parseNumberBR(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/r\$/gi, "").replace(/\s|\u00a0/g, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Verifica se a célula representa um inteiro pequeno (ITEM/QTDE), sem separador decimal. */
function isSmallInteger(raw: string | undefined): boolean {
  if (!raw) return false;
  const s = String(raw).trim();
  if (!s || s.includes(",") || s.includes(".")) return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n < 1_000_000;
}

function inferTipoFonte(label: string): TipoFontePlanilha {
  return /dom[íi]nio/i.test(label) ? "site_eletronico" : "contratacao_publica";
}

function classificar(
  valor: number,
  limiteInferior: number,
  limiteSuperior: number,
): { incluido: boolean; motivoExclusao?: string } {
  if (limiteInferior > 0 && valor < limiteInferior) {
    return { incluido: false, motivoExclusao: "Inexequível (< 30% da mediana)" };
  }
  if (limiteSuperior > 0 && valor > limiteSuperior) {
    return { incluido: false, motivoExclusao: "Exorbitante (> 30% da mediana)" };
  }
  return { incluido: true };
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Indica se as linhas contêm uma aba de dados (cabeçalho de material presente). */
export function isDataSheet(rows: string[][]): boolean {
  return detectColumns(rows) !== null;
}

/**
 * Parseia as linhas (matriz de células) da aba de dados em itens estruturados.
 * As colunas são detectadas pelo nome do cabeçalho, com fallback posicional
 * para planilhas que omitem alguns cabeçalhos.
 */
export function parsePlanilha(rows: string[][]): PlanilhaParseResult {
  const cols = detectColumns(rows);
  if (!cols) return { itens: [] };

  const { headerIndex, materialCol, medianaCol, limInfCol, limSupCol, priceStartCols } = cols;
  const headerRow = rows[headerIndex] ?? [];
  const itens: ItemPlanilha[] = [];
  let grupoAtual: string | undefined;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const material = (row[materialCol] ?? "").trim();
    const linhaToda = row.map((c) => (c ?? "").trim()).join(" ");

    if (LEGEND_PATTERNS.test(linhaToda)) continue;

    const mediana = medianaCol >= 0 ? parseNumberBR(row[medianaCol]) : NaN;
    const temMediana = Number.isFinite(mediana) && mediana > 0;

    // Fallback: considera linha de dados se há inteiros positivos nas colunas
    // de ITEM/LOTE/QTDE antes da coluna de material (ex.: planilha sem preços ainda)
    const temInteiroAntesDoMaterial = !temMediana &&
      Array.from({ length: materialCol }, (_, c) => c)
        .filter((c) => !priceStartCols.includes(c))
        .some((c) => isSmallInteger(row[c]));

    // Linha de dados: material não vazio + (mediana positiva | inteiros de item/qtde | sem coluna de mediana)
    const ehLinhaDeDados =
      material.length > 0 && (temMediana || temInteiroAntesDoMaterial || medianaCol < 0);

    if (!ehLinhaDeDados) {
      const textoGrupo = (
        material || row.find((c) => (c ?? "").trim().length > 0) || ""
      ).trim();
      if (textoGrupo && !Number.isFinite(parseNumberBR(textoGrupo))) {
        grupoAtual = textoGrupo;
      }
      continue;
    }

    const limiteInferior = limInfCol >= 0 ? (parseNumberBR(row[limInfCol]) || 0) : 0;
    const limiteSuperior = limSupCol >= 0 ? (parseNumberBR(row[limSupCol]) || 0) : 0;

    // ITEM e QTDE: inteiros entre as colunas de estatísticas e a coluna MATERIAL
    const inteiros: number[] = [];
    for (let c = 0; c < materialCol; c++) {
      if (priceStartCols.includes(c)) continue;
      if (isSmallInteger(row[c])) inteiros.push(Number((row[c] ?? "").trim()));
    }
    const item = inteiros[0] ?? itens.length + 1;
    const quantidade = inteiros.length > 1 ? inteiros[inteiros.length - 1]! : 1;

    // Preços: colunas à direita de MATERIAL com valor numérico positivo
    const precos: PrecoPlanilha[] = [];
    let precoSeq = 0;
    for (let c = materialCol + 1; c < row.length; c++) {
      const valor = parseNumberBR(row[c]);
      if (!Number.isFinite(valor) || valor <= 0) continue;
      precoSeq++;
      const labelHeader = (headerRow[c] ?? "").trim();
      const label = labelHeader || `Preço ${precoSeq}`;
      const { incluido, motivoExclusao } = classificar(valor, limiteInferior, limiteSuperior);
      precos.push({
        label,
        valor: Math.round(valor * 100) / 100,
        tipoFonte: inferTipoFonte(label),
        incluido,
        ...(motivoExclusao ? { motivoExclusao } : {}),
      });
    }

    itens.push({
      item,
      material,
      ...(grupoAtual ? { grupo: grupoAtual } : {}),
      quantidade,
      limiteInferior,
      mediana: temMediana ? mediana : 0,
      limiteSuperior,
      precos,
    });
  }

  return { itens };
}

/** Estatística simples calculada a partir dos preços incluídos (para a série de preços). */
export interface EstatisticaItem {
  media: number;
  mediana: number;
  menorValor: number;
  coeficienteVariacao: number;
  totalPrecos: number;
  precosIncluidos: number;
  valorEstimado: number;
}

export function estatisticaDoItem(item: ItemPlanilha): EstatisticaItem | null {
  const incluidos = item.precos.filter((p) => p.incluido).map((p) => p.valor);
  if (incluidos.length === 0) return null;
  const media = incluidos.reduce((a, b) => a + b, 0) / incluidos.length;
  const sorted = [...incluidos].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianaCalc =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  const mediana = item.mediana > 0 ? item.mediana : medianaCalc;
  const menorValor = Math.min(...incluidos);
  const variance =
    incluidos.reduce((acc, v) => acc + (v - media) ** 2, 0) / incluidos.length;
  const cv = media > 0 ? (Math.sqrt(variance) / media) * 100 : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    media: round(media),
    mediana: round(mediana),
    menorValor: round(menorValor),
    coeficienteVariacao: round(cv),
    totalPrecos: item.precos.length,
    precosIncluidos: incluidos.length,
    valorEstimado: round(mediana),
  };
}
