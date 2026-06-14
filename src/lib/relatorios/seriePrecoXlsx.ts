import * as XLSX from "xlsx";

export interface SeriePrecoXlsxData {
  processo: {
    numero: string;
    objeto: string;
    responsavel: string;
    quantidade: number;
    unidade: string;
  };
  serie: {
    metodo: string;
    valorEstimado: number;
    media: number;
    mediana: number;
    menorValor: number;
    coeficienteVariacao: number;
    totalPrecos: number;
    precosIncluidos: number;
    precos: Array<{
      fonte: string;
      descricaoFonte: string;
      fornecedorOuOrgao: string;
      dataReferencia: Date | string;
      valorUnitario: number;
      status: string;
      motivoExclusao?: string | null;
    }>;
  };
}

const METODO_LABEL: Record<string, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  menor_valor: "Menor valor",
};

const FONTE_LABEL: Record<string, string> = {
  contratacao_publica: "Contratação pública",
  site_eletronico: "Site eletrônico",
  fornecedor_direto: "Fornecedor direto",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

export function gerarSeriePrecoXlsx(data: SeriePrecoXlsxData): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Aba 1: Identificação ──────────────────────────────────────────────────
  const identificacaoRows = [
    ["Campo", "Valor"],
    ["Processo", data.processo.numero],
    ["Objeto", data.processo.objeto],
    ["Responsável", data.processo.responsavel],
    ["Quantidade estimada", `${data.processo.quantidade} ${data.processo.unidade}`],
    ["Método adotado", METODO_LABEL[data.serie.metodo] ?? data.serie.metodo],
    ["Fundamento legal", "IN SEGES/ME nº 65/2021"],
    ["Gerado em", new Date().toLocaleDateString("pt-BR")],
  ];

  const wsIdent = XLSX.utils.aoa_to_sheet(identificacaoRows);
  wsIdent["!cols"] = [{ wch: 25 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsIdent, "Identificação");

  // ── Aba 2: Série de preços ─────────────────────────────────────────────────
  const headerRow = [
    "Fonte / Referência",
    "Fornecedor / Órgão",
    "Tipo de fonte",
    "Data de referência",
    "Valor unitário (R$)",
    "Situação",
    "Motivo de exclusão",
  ];

  const dataRows = data.serie.precos.map((p) => [
    p.descricaoFonte,
    p.fornecedorOuOrgao,
    FONTE_LABEL[p.fonte] ?? p.fonte,
    formatDate(p.dataReferencia),
    Number(p.valorUnitario),
    p.status === "incluido" ? "Incluído" : "Excluído",
    p.motivoExclusao ?? "",
  ]);

  const wsPrecos = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  wsPrecos["!cols"] = [
    { wch: 35 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 30 },
  ];

  // Format monetary column (E) as currency
  const range = XLSX.utils.decode_range(wsPrecos["!ref"] ?? "A1");
  for (let row = 1; row <= range.e.r; row++) {
    const cellAddr = XLSX.utils.encode_cell({ r: row, c: 4 });
    if (wsPrecos[cellAddr]) {
      wsPrecos[cellAddr].z = '"R$"#,##0.00';
    }
  }

  XLSX.utils.book_append_sheet(wb, wsPrecos, "Série de Preços");

  // ── Aba 3: Estatísticas ───────────────────────────────────────────────────
  const estatRows = [
    ["Estatística", "Valor"],
    ["Total de preços coletados", data.serie.totalPrecos],
    ["Preços incluídos na série", data.serie.precosIncluidos],
    ["Média aritmética", Number(data.serie.media)],
    ["Mediana", Number(data.serie.mediana)],
    ["Menor valor", Number(data.serie.menorValor)],
    ["Coeficiente de variação (%)", Number(data.serie.coeficienteVariacao)],
    [],
    ["Método adotado", METODO_LABEL[data.serie.metodo] ?? data.serie.metodo],
    ["Valor unitário estimado (R$)", Number(data.serie.valorEstimado)],
    [
      "Valor total estimado (R$)",
      Number(data.serie.valorEstimado) * data.processo.quantidade,
    ],
  ];

  const wsEstat = XLSX.utils.aoa_to_sheet(estatRows);
  wsEstat["!cols"] = [{ wch: 35 }, { wch: 20 }];

  // Format monetary cells
  for (const row of [2, 3, 8, 9, 10]) {
    const cellAddr = XLSX.utils.encode_cell({ r: row, c: 1 });
    if (wsEstat[cellAddr] && typeof wsEstat[cellAddr].v === "number") {
      wsEstat[cellAddr].z = '"R$"#,##0.00';
    }
  }

  XLSX.utils.book_append_sheet(wb, wsEstat, "Estatísticas");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
