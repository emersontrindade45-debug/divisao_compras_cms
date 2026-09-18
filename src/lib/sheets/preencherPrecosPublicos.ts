import "server-only";
import { getSheetsClient } from "./googleAuth";
import { MAX_PRECOS_POR_ITEM } from "./limitesPrecosPublicos";

// Tamanho de fonte padrão do Sheets quando a célula não tem formatação
// explícita — usado só se a leitura do cabeçalho não devolver um valor.
const TAMANHO_FONTE_PADRAO = 10;
// Fixo por pedido do usuário (não mais 50% da fonte do rótulo "Preço
// Público" — a metade ficava pequena demais para ler o nome do órgão).
const TAMANHO_FONTE_ORGAO = 8;
const LIMITE_NOME_ORGAO = 45;

export interface PrecoParaPreencher {
  valor: number;
  /** Órgão/fornecedor da fonte — vai para o rótulo da coluna, não para a célula de valor. */
  orgao: string;
}

export interface ItemParaPreencher {
  descricao: string;
  precos: PrecoParaPreencher[];
}

export interface LinhaNaoEncontrada {
  descricao: string;
}

export interface PreenchimentoResultado {
  abaUtilizada: string;
  linhasPreenchidas: number;
  linhasNaoEncontradas: LinhaNaoEncontrada[];
  /**
   * Item cuja linha foi encontrada mas não tinha nenhuma coluna "Preço
   * Público" vazia para receber preço novo — nem sem coluna do tipo na
   * planilha, nem com todas já ocupadas. Ver `localizarColunasPrecoPublico`.
   */
  itensSemColunaDisponivel: LinhaNaoEncontrada[];
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const ALGARISMOS_ROMANOS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function paraRomano(numero: number): string {
  let resto = numero;
  let saida = "";
  for (const [valor, simbolo] of ALGARISMOS_ROMANOS) {
    while (resto >= valor) {
      saida += simbolo;
      resto -= valor;
    }
  }
  return saida;
}

/** 0-based → letra de coluna A1 (0 → A, 25 → Z, 26 → AA...). */
function letraColuna(indice: number): string {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// O PNCP devolve razão social em CAIXA ALTA ("CAMARA MUNICIPAL DE AMERICO
// BRASILIENSE"), ilegível espremido num cabeçalho de coluna. Não tenta
// replicar abreviação editorial (o usuário, à mão, chegou a "Câmara Américo
// Brasiliense" — cortando "MUNICIPAL DE"); aqui só normaliza capitalização e
// corta pelo tamanho, sem juízo sobre quais palavras descartar.
function abreviarOrgao(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ");
  const titulo = limpo
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
  return titulo.length > LIMITE_NOME_ORGAO
    ? `${titulo.slice(0, LIMITE_NOME_ORGAO - 1).trimEnd()}…`
    : titulo;
}

// Casa "Preço Público", "PREÇO PÚBLICO I", "preco publico ii - fulano" etc.
// — texto normalizado (sem acento/caixa) para a detecção da coluna.
const PREFIXO_PRECO_PUBLICO = "preco publico";
// Extrai o numeral já presente no texto ORIGINAL (não normalizado), se houver,
// para reaproveitar a numeração que já está na planilha em vez de recalcular.
const REGEX_NUMERAL = /pre[çc]o\s+p[úu]blico\s*([ivxlcdm]+|\d+)?/i;

/** Sufixo "- Órgão" já escrito no cabeçalho, se houver ("Preço Público I - Fulano" → "Fulano"). */
function extrairSufixoOrgao(header: string): string | null {
  const idx = header.indexOf(" - ");
  return idx === -1 ? null : header.slice(idx + 3).trim();
}

/** Colunas cujo cabeçalho começa com "Preço Público", na ordem em que aparecem. */
function localizarColunasPrecoPublico(headerRow: string[]): number[] {
  const indices: number[] = [];
  headerRow.forEach((cel, idx) => {
    if (normalizar(cel ?? "").startsWith(PREFIXO_PRECO_PUBLICO)) indices.push(idx);
  });
  return indices;
}

/**
 * Numeral de CADA coluna da faixa "Preço Público", resolvido de uma vez.
 *
 * O numeral vira a referência do preço na memória de cálculo, então duas
 * colunas não podem terminar com o mesmo. Duas armadilhas, ambas vindas de
 * planilha montada à mão:
 *
 * 1. Coluna SEM numeral ("Preço Público" seco) não pode receber
 *    `paraRomano(posição)` cegamente — na planilha do processo 1829/2024 a
 *    coluna vaga é a 6ª da faixa, mas "Preço Público VI" já pertence à
 *    seguinte.
 * 2. Numeral REPETIDO não identifica coluna nenhuma, e reaproveitá-lo propaga a
 *    ambiguidade em vez de resolvê-la. Medido na planilha do processo 0736/2025
 *    em 2026-09-18, depois que o usuário acrescentou colunas copiando a
 *    primeira: as **33** colunas tinham o rótulo "Preço Público I ", e a regra
 *    antiga ("reusa o que está escrito") renomearia as 33 para
 *    "Preço Público I - <Órgão>". Trinta e três preços indistinguíveis na
 *    memória de cálculo.
 *
 * Daí a regra: o numeral escrito só vale quando é ÚNICO na faixa; caso
 * contrário a coluna é renumerada pela posição, pulando os numerais que
 * pertencem a colunas unicamente identificadas.
 *
 * Resolver tudo de uma vez também tira uma dependência de ordem que existia
 * antes: a versão anterior atribuía numeral sob demanda, enquanto escrevia,
 * então o numeral de uma coluna dependia de qual item fosse preenchido primeiro.
 */
function resolverNumerais(headerRow: string[], colunas: number[]): Map<number, string> {
  const escrito = new Map<number, string>();
  const ocorrencias = new Map<string, number>();
  colunas.forEach((idx) => {
    const numeral = REGEX_NUMERAL.exec(headerRow[idx] ?? "")?.[1]?.toUpperCase();
    if (!numeral) return;
    escrito.set(idx, numeral);
    ocorrencias.set(numeral, (ocorrencias.get(numeral) ?? 0) + 1);
  });

  /** Confiável = escrito e pertencente a uma única coluna. */
  const confiavel = (idx: number) => {
    const numeral = escrito.get(idx);
    return numeral && ocorrencias.get(numeral) === 1 ? numeral : null;
  };

  // Reservar ANTES de distribuir: quem for renumerado precisa desviar de todos
  // os numerais confiáveis, inclusive os de colunas à direita.
  const reservados = new Set<string>();
  colunas.forEach((idx) => {
    const numeral = confiavel(idx);
    if (numeral) reservados.add(numeral);
  });

  const numerais = new Map<number, string>();
  let proximo = 1;
  colunas.forEach((idx) => {
    const numeral = confiavel(idx);
    if (numeral) {
      numerais.set(idx, numeral);
      return;
    }
    while (reservados.has(paraRomano(proximo))) proximo += 1;
    const novo = paraRomano(proximo);
    reservados.add(novo);
    numerais.set(idx, novo);
    proximo += 1;
  });

  return numerais;
}

/** Encontra a linha (1-based) de cada item na aba, casando pelo texto da coluna MATERIAL. */
function localizarLinhas(valoresAba: string[][], colunaMaterial: number): Map<string, number> {
  const linhaPorMaterial = new Map<string, number>();
  valoresAba.forEach((row, idx) => {
    const material = (row[colunaMaterial] ?? "").trim();
    if (!material) return;
    linhaPorMaterial.set(normalizar(material), idx + 1);
  });
  return linhaPorMaterial;
}

interface AbaDeDados {
  aba: string;
  sheetId: number;
  valores: string[][];
  colunaMaterial: number;
  /** Índice 0-based da linha onde "MATERIAL" foi encontrado (normalmente a linha 1). */
  linhaCabecalho: number;
  headerRow: string[];
  /**
   * Mesmas células de `valores`, porém com as FÓRMULAS em vez do resultado
   * delas. Serve para distinguir "esta coluna tem preço" de "esta coluna tem o
   * total calculado da coluna" — ver `colunaTemValor`.
   */
  valoresFormula: string[][];
}

/** Procura, em todas as abas da planilha, a primeira com cabeçalho "MATERIAL". */
async function localizarAbaDeDados(spreadsheetId: string): Promise<AbaDeDados> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const abas = (meta.data.sheets ?? [])
    .map((s) => ({ title: s.properties?.title, sheetId: s.properties?.sheetId }))
    .filter((s): s is { title: string; sheetId: number } => !!s.title && s.sheetId != null);

  for (const { title: aba, sheetId } of abas) {
    // A aba inteira, sem recorte de colunas. Era `A1:Z500`, que parava na
    // coluna Z (índice 25): a planilha do processo 0736/2025 tem 33 colunas
    // "Preço Público" indo até AV (índice 47), e as 22 além de Z eram
    // invisíveis para o código — o analista via a faixa que criou ser ignorada,
    // sem nenhum aviso. Um teto de colunas escrito à mão erra sempre que
    // alguém acrescenta coluna, que é o uso normal desta planilha.
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${aba}'`,
    });
    const valores = leitura.data.values ?? [];
    const linhaCabecalho = valores.findIndex((row) =>
      row.some((cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL"),
    );
    if (linhaCabecalho >= 0) {
      const headerRow = valores[linhaCabecalho]!;
      const colunaMaterial = headerRow.findIndex(
        (cell) => (cell ?? "").trim().toUpperCase() === "MATERIAL",
      );
      // Segunda leitura da MESMA faixa, com as fórmulas à mostra. Uma chamada
      // a mais, paga uma vez, para não confundir célula de total com preço.
      const comFormulas = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${aba}'`,
        valueRenderOption: "FORMULA",
      });
      return {
        aba,
        sheetId,
        valores,
        colunaMaterial,
        linhaCabecalho,
        headerRow,
        valoresFormula: (comFormulas.data.values ?? []) as string[][],
      };
    }
  }

  throw new Error(
    `Nenhuma aba com cabeçalho "MATERIAL" encontrada na planilha. Abas disponíveis: ${abas.map((a) => a.title).join(", ")}.`,
  );
}

/**
 * Lê o tamanho de fonte já aplicado à primeira coluna "Preço Público" do
 * cabeçalho, para usar como base do rótulo novo (a IN 65 não dita fonte —
 * isso é só para o rótulo escrito por código não destoar visualmente do
 * que já está na planilha). Sem formatação explícita, cai no padrão do
 * Sheets (10pt).
 */
async function descobrirTamanhoFonteBase(
  spreadsheetId: string,
  aba: string,
  linhaCabecalho: number,
  colunaReferencia: number,
): Promise<number> {
  const sheets = getSheetsClient();
  const range = `'${aba}'!${letraColuna(colunaReferencia)}${linhaCabecalho + 1}`;
  const resposta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    fields: "sheets.data.rowData.values.userEnteredFormat.textFormat.fontSize",
  });
  const fontSize =
    resposta.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredFormat?.textFormat
      ?.fontSize;
  return fontSize ?? TAMANHO_FONTE_PADRAO;
}

/**
 * Preenche as colunas "Preço Público" na planilha real do processo
 * (sincronizada previamente): detecta a aba de dados pelo cabeçalho
 * MATERIAL, casa cada item por esse texto, e localiza as colunas de preço
 * pelo PRÓPRIO RÓTULO ("Preço Público I", "II"...) em vez de uma posição
 * fixa — planilhas diferentes têm números diferentes de colunas de
 * fornecedor direto antes das colunas públicas, então M:Q fixo em uma
 * planilha cai em cima de cotação de fornecedor em outra.
 *
 * Só escreve em cédulas de valor VAZIAS (nunca sobrescreve preço já
 * lançado ali, manual ou de sincronização anterior) e, ao escrever, também
 * atualiza o cabeçalho daquela coluna para "Preço Público N - Órgão", com
 * o nome do órgão em fonte fixa (`TAMANHO_FONTE_ORGAO`), menor que o rótulo
 * — feito via `textFormatRuns`, que o `values.batchUpdate` (usado para os
 * valores) não suporta.
 *
 * O cabeçalho é por COLUNA, compartilhado por todas as linhas — então a
 * escolha de coluna por item não pode ser "a primeira vazia": duas linhas
 * com órgãos diferentes caindo na mesma coluna faria o rótulo (escrito por
 * último) mentir sobre o valor de uma das duas. A escolha respeita a
 * identidade já gravada no cabeçalho (`escolherColuna`): reaproveita coluna
 * já rotulada com o MESMO órgão, senão usa uma ainda sem órgão, e só cai
 * numa coluna de outro órgão como último recurso — quando o processo tem
 * mais órgãos distintos do que colunas "Preço Público" disponíveis, que é
 * um limite de capacidade da planilha, não um bug de rotulagem.
 */
export async function preencherPrecosPublicos(
  spreadsheetId: string,
  itens: ItemParaPreencher[],
): Promise<PreenchimentoResultado> {
  const sheets = getSheetsClient();
  const { aba, sheetId, valores, colunaMaterial, linhaCabecalho, headerRow, valoresFormula } =
    await localizarAbaDeDados(spreadsheetId);
  const linhaPorMaterial = localizarLinhas(valores, colunaMaterial);
  const colunasPrecoPublico = localizarColunasPrecoPublico(headerRow);

  const linhasNaoEncontradas: LinhaNaoEncontrada[] = [];
  const itensSemColunaDisponivel: LinhaNaoEncontrada[] = [];

  if (colunasPrecoPublico.length === 0) {
    return {
      abaUtilizada: aba,
      linhasPreenchidas: 0,
      linhasNaoEncontradas: [],
      itensSemColunaDisponivel: itens.map((i) => ({ descricao: i.descricao })),
    };
  }

  const fonteBase = await descobrirTamanhoFonteBase(
    spreadsheetId,
    aba,
    linhaCabecalho,
    colunasPrecoPublico[0]!,
  );

  const dataValores: { range: string; values: number[][] }[] = [];
  const cabecalhosParaAtualizar = new Map<number, string>(); // colIdx -> texto completo

  // Órgão (normalizado) já reservado para cada coluna nesta execução. `null`
  // = coluna livre para qualquer órgão. Uma coluna só entra "reservada" se
  // já tiver algum VALOR escrito em alguma linha — o texto do cabeçalho
  // sozinho não basta: planilha antiga pode ter rótulo "Preço Público II -
  // Fulano" sem nenhuma célula preenchida (rótulo morto de uma limpeza
  // manual), e tratar isso como reservado bloquearia a coluna para sempre
  // sem nenhum dado real por trás do nome.
  //
  // **Célula de FÓRMULA não conta como preço.** A planilha tem uma linha TOTAL
  // com `=SUM(P3:P7)` em todas as 33 colunas da faixa; lendo só o resultado,
  // toda coluna parecia "ter valor", e com isso toda coluna sem órgão no
  // cabeçalho era classificada como ocupada-por-desconhecido. O efeito seria
  // não sobrar coluna livre nenhuma e o preenchimento não escrever NADA,
  // reportando todos os itens como sem coluna disponível.
  const colunaTemValor = new Map<number, boolean>();
  colunasPrecoPublico.forEach((idx) => {
    const temValor = valores.some((row, i) => {
      if (i === linhaCabecalho) return false;
      if ((row[idx] ?? "").trim() === "") return false;
      const formula = String(valoresFormula[i]?.[idx] ?? "").trim();
      return !formula.startsWith("=");
    });
    colunaTemValor.set(idx, temValor);
  });
  const numerais = resolverNumerais(headerRow, colunasPrecoPublico);

  // ------------------------------------------------------------------
  // Atribuição de coluna por ÓRGÃO, decidida antes de qualquer escrita.
  //
  // O cabeçalho é por COLUNA e vale para TODAS as linhas, então a coluna não
  // pode ser escolhida linha a linha: era isso que fazia o rótulo mentir.
  // Medido na planilha do processo 0736/2025 em 2026-09-18, depois de um
  // preenchimento real — a coluna rotulada "Preço Público III - Inst De Prev …
  // Petropolis" tinha R$ 874,00 (Ferraz de Vasconcelos) na linha da MFP
  // colorida, R$ 570,00 (Ferraz) na linha da MFP PB e R$ 10.500,00
  // (Petrópolis) na do Impressora de Cartão. Três órgãos numa coluna só, e o
  // rótulo era o do ÚLTIMO item preenchido.
  //
  // A regra antiga tentava reaproveitar coluna do mesmo órgão, mas só entre as
  // colunas vazias DAQUELA linha e só depois que algum valor já existisse na
  // coluna. Com a faixa recém-ampliada, nenhuma coluna tinha órgão no começo
  // da execução: todo item pegava a primeira livre, e cada um sobrescrevia o
  // cabeçalho do anterior.
  //
  // O par (órgão, ocorrência) é a chave — e não o órgão sozinho — porque o
  // mesmo órgão pode ter dois preços para o MESMO item (Brusque tem dois em
  // "Impressora de Cartão"), e uma coluna guarda um valor por linha. A 2ª
  // ocorrência ganha coluna própria, também rotulada com aquele órgão.
  // ------------------------------------------------------------------

  /** Quantas colunas cada órgão precisa: o máximo de preços dele num mesmo item. */
  const chavesNecessarias: string[] = [];
  const ocorrenciasVistas = new Map<string, number>();
  for (const item of itens) {
    const porOrgaoNesteItem = new Map<string, number>();
    for (const preco of item.precos.slice(0, MAX_PRECOS_POR_ITEM)) {
      const orgKey = normalizar(abreviarOrgao(preco.orgao));
      const n = (porOrgaoNesteItem.get(orgKey) ?? 0) + 1;
      porOrgaoNesteItem.set(orgKey, n);
      if ((ocorrenciasVistas.get(orgKey) ?? 0) < n) {
        ocorrenciasVistas.set(orgKey, n);
        chavesNecessarias.push(`${orgKey}#${n}`);
      }
    }
  }

  // Colunas que já pertencem a um órgão pelo cabeçalho: reusadas para ele, que
  // é o "mesmo órgão, mesma coluna" entre execuções. Só conta quando a coluna
  // tem VALOR em alguma linha — rótulo sem nenhum dado por trás é sobra de
  // limpeza manual e não pode bloquear a coluna para sempre.
  const colunaDaChave = new Map<string, number>();
  const colunaOcupadaPor = new Map<number, string>();
  const vistasNoCabecalho = new Map<string, number>();
  colunasPrecoPublico.forEach((idx) => {
    if (!colunaTemValor.get(idx)) return;
    const sufixo = extrairSufixoOrgao(headerRow[idx] ?? "");
    if (!sufixo) {
      // Valor sem órgão identificável: a coluna está ocupada por alguém que
      // não sabemos nomear, e nunca pode ser dada a um órgão real.
      colunaOcupadaPor.set(idx, "\0ocupada-sem-orgao");
      return;
    }
    const orgKey = normalizar(sufixo);
    const n = (vistasNoCabecalho.get(orgKey) ?? 0) + 1;
    vistasNoCabecalho.set(orgKey, n);
    const chave = `${orgKey}#${n}`;
    colunaDaChave.set(chave, idx);
    colunaOcupadaPor.set(idx, chave);
  });

  // As demais chaves recebem, em ordem, as colunas ainda de ninguém.
  const livres = colunasPrecoPublico.filter((idx) => !colunaOcupadaPor.has(idx));
  const orgaosSemColuna: string[] = [];
  for (const chave of chavesNecessarias) {
    if (colunaDaChave.has(chave)) continue;
    const idx = livres.shift();
    if (idx === undefined) {
      orgaosSemColuna.push(chave);
      continue;
    }
    colunaDaChave.set(chave, idx);
    colunaOcupadaPor.set(idx, chave);
  }

  let linhasPreenchidas = 0;

  for (const item of itens) {
    if (item.precos.length === 0) continue;
    const linha = linhaPorMaterial.get(normalizar(item.descricao));
    if (!linha) {
      linhasNaoEncontradas.push({ descricao: item.descricao });
      continue;
    }

    const linhaAtual = valores[linha - 1] ?? [];
    const porOrgaoNesteItem = new Map<string, number>();
    let algumaEscrita = false;
    let algumPrecoSemVaga = false;

    for (const preco of item.precos.slice(0, MAX_PRECOS_POR_ITEM)) {
      const orgKey = normalizar(abreviarOrgao(preco.orgao));
      const n = (porOrgaoNesteItem.get(orgKey) ?? 0) + 1;
      porOrgaoNesteItem.set(orgKey, n);

      const colIdx = colunaDaChave.get(`${orgKey}#${n}`);
      if (colIdx === undefined) {
        // Mais órgãos distintos do que colunas na planilha: limite de
        // capacidade, não erro de rotulagem. Preço nenhum vai para a coluna de
        // outro órgão — antes deixar de escrever do que escrever no lugar
        // errado, que é o defeito que esta função acabou de corrigir.
        algumPrecoSemVaga = true;
        continue;
      }

      // Nunca sobrescreve valor já lançado (manual ou de execução anterior).
      if ((linhaAtual[colIdx] ?? "").trim()) continue;

      dataValores.push({
        range: `'${aba}'!${letraColuna(colIdx)}${linha}`,
        values: [[preco.valor]],
      });

      const numeral = numerais.get(colIdx)!;
      cabecalhosParaAtualizar.set(colIdx, `Preço Público ${numeral} - ${abreviarOrgao(preco.orgao)}`);
      algumaEscrita = true;
    }

    if (algumaEscrita) linhasPreenchidas += 1;
    if (algumPrecoSemVaga) itensSemColunaDisponivel.push({ descricao: item.descricao });
  }

  if (dataValores.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: dataValores },
    });
  }

  if (cabecalhosParaAtualizar.size > 0) {
    const requests = [...cabecalhosParaAtualizar.entries()].map(([colIdx, texto]) => {
      const prefixoLen = texto.indexOf(" - ") + 3; // inclui " - " no trecho em tamanho normal
      return {
        updateCells: {
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: texto },
                  textFormatRuns: [
                    { startIndex: 0, format: { fontSize: fonteBase } },
                    { startIndex: prefixoLen, format: { fontSize: TAMANHO_FONTE_ORGAO } },
                  ],
                },
              ],
            },
          ],
          fields: "userEnteredValue,textFormatRuns",
          range: {
            sheetId,
            startRowIndex: linhaCabecalho,
            endRowIndex: linhaCabecalho + 1,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
        },
      };
    });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  return { abaUtilizada: aba, linhasPreenchidas, linhasNaoEncontradas, itensSemColunaDisponivel };
}
