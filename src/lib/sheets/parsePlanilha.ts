/**
 * Parsing puro (sem I/O) da planilha de pesquisa de preços (Google Sheets).
 *
 * A planilha é mantida pela Divisão de Compras: cada arquivo corresponde a um
 * processo, com uma aba de dados onde cada linha é um item ("MATERIAL"). As
 * colunas têm posições variáveis por causa de células mescladas, então o parsing
 * se ancora pelo cabeçalho "MATERIAL" e pelas três primeiras colunas de
 * estatística (LIMITE INFERIOR / MEDIANA / LIMITE SUPERIOR).
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

const LEGEND_PATTERNS =
  /(em conformidade|preços? válidos|preços? exorbit|preços? inexequ|legenda|célula|c[óo]digo das c|aba bloqueada|limite de utiliza)/i;

/** Converte número em formato pt-BR ("R$ 2.327,18", "4606,15", "1.000") em number. NaN se inválido. */
export function parseNumberBR(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // remove símbolo de moeda, espaços (incl. não-quebráveis) e quaisquer caracteres não numéricos de borda
  s = s.replace(/r\$/gi, "").replace(/\s|\u00a0/g, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "2.327,18" → ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "4606,15" → vírgula é decimal
    s = s.replace(",", ".");
  }
  // se só tem ponto, assume que já é decimal padrão (ex.: "997.36")
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

function findHeaderRow(rows: string[][]): { headerIndex: number; materialCol: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const col = row.findIndex((c) => (c ?? "").trim().toUpperCase() === "MATERIAL");
    if (col >= 0) return { headerIndex: i, materialCol: col };
  }
  return null;
}

/** Indica se as linhas contêm uma aba de dados (cabeçalho MATERIAL presente). */
export function isDataSheet(rows: string[][]): boolean {
  return findHeaderRow(rows) !== null;
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

/**
 * Parseia as linhas (matriz de células) da aba de dados em itens estruturados.
 */
export function parsePlanilha(rows: string[][]): PlanilhaParseResult {
  const header = findHeaderRow(rows);
  if (!header) return { itens: [] };

  const { headerIndex, materialCol } = header;
  const headerRow = rows[headerIndex] ?? [];
  const itens: ItemPlanilha[] = [];
  let grupoAtual: string | undefined;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const material = (row[materialCol] ?? "").trim();
    const linhaToda = row.map((c) => (c ?? "").trim()).join(" ");

    // ignora linhas de legenda/rodapé
    if (LEGEND_PATTERNS.test(linhaToda)) continue;

    const mediana = parseNumberBR(row[1]);
    const ehLinhaDeDados = material.length > 0 && Number.isFinite(mediana) && mediana > 0;

    if (!ehLinhaDeDados) {
      // possível linha de grupo (texto mesclado, sem mediana numérica)
      const textoGrupo = (material || row.find((c) => (c ?? "").trim().length > 0) || "").trim();
      if (textoGrupo && !Number.isFinite(parseNumberBR(textoGrupo))) {
        grupoAtual = textoGrupo;
      }
      continue;
    }

    const limiteInferior = parseNumberBR(row[0]);
    const limiteSuperior = parseNumberBR(row[2]);

    // ITEM e QTDE são as colunas inteiras entre LIMITE SUPERIOR (col 2) e MATERIAL
    const inteiros: number[] = [];
    for (let c = 3; c < materialCol; c++) {
      if (isSmallInteger(row[c])) inteiros.push(Number((row[c] ?? "").trim()));
    }
    const item = inteiros[0] ?? itens.length + 1;
    const quantidade = inteiros.length > 1 ? inteiros[inteiros.length - 1]! : 1;

    // preços: todas as colunas à direita de MATERIAL com valor numérico positivo
    const precos: PrecoPlanilha[] = [];
    let precoSeq = 0;
    for (let c = materialCol + 1; c < row.length; c++) {
      const valor = parseNumberBR(row[c]);
      if (!Number.isFinite(valor) || valor <= 0) continue;
      precoSeq++;
      const labelHeader = (headerRow[c] ?? "").trim();
      const label = labelHeader || `Preço ${precoSeq}`;
      const { incluido, motivoExclusao } = classificar(
        valor,
        Number.isFinite(limiteInferior) ? limiteInferior : 0,
        Number.isFinite(limiteSuperior) ? limiteSuperior : 0,
      );
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
      limiteInferior: Number.isFinite(limiteInferior) ? limiteInferior : 0,
      mediana,
      limiteSuperior: Number.isFinite(limiteSuperior) ? limiteSuperior : 0,
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
