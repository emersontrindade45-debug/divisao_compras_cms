export type TipoFonte = "contratacao-publica" | "site-eletronico" | "fornecedor-direto";
export type MetodoConsolidacao = "media" | "mediana" | "menor-valor";
export type StatusPreco = "incluido" | "excluido";

export interface PrecoFixture {
  id: string;
  processoId: string;
  fonte: TipoFonte;
  descricaoFonte: string;
  fornecedorOuOrgao: string;
  dataReferencia: string;
  valorUnitario: number;
  status: StatusPreco;
  motivoExclusao?: string;
}

export interface SeriePrecoFixture {
  processoId: string;
  metodo: MetodoConsolidacao;
  valorEstimado: number;
  media: number;
  mediana: number;
  menorValor: number;
  coeficienteVariacao: number;
  totalPrecos: number;
  precosIncluidos: number;
  precos: PrecoFixture[];
}

export const PRECOS: PrecoFixture[] = [
  // proc-001 — Cadeiras ergonômicas
  {
    id: "preco-001",
    processoId: "proc-001",
    fonte: "contratacao-publica",
    descricaoFonte: "Pregão 045/2025 — TRE-SP",
    fornecedorOuOrgao: "TRE-SP",
    dataReferencia: "2025-11-10",
    valorUnitario: 1180.0,
    status: "incluido",
  },
  {
    id: "preco-002",
    processoId: "proc-001",
    fonte: "contratacao-publica",
    descricaoFonte: "Pregão 012/2025 — ALESP",
    fornecedorOuOrgao: "ALESP",
    dataReferencia: "2025-08-22",
    valorUnitario: 1320.0,
    status: "incluido",
  },
  {
    id: "preco-003",
    processoId: "proc-001",
    fonte: "site-eletronico",
    descricaoFonte: "Consulta site da fabricante — Marelli",
    fornecedorOuOrgao: "Marelli S.A.",
    dataReferencia: "2026-05-15",
    valorUnitario: 1450.0,
    status: "excluido",
    motivoExclusao: "Valor discrepante (>20% acima da média): possível precificação desatualizada.",
  },
  {
    id: "preco-004",
    processoId: "proc-001",
    fonte: "fornecedor-direto",
    descricaoFonte: "Proposta Móveis Corporativos Santista",
    fornecedorOuOrgao: "Santos Office",
    dataReferencia: "2026-05-28",
    valorUnitario: 1250.0,
    status: "incluido",
  },
  {
    id: "preco-005",
    processoId: "proc-001",
    fonte: "fornecedor-direto",
    descricaoFonte: "Proposta Papelaria União (inválida)",
    fornecedorOuOrgao: "Papelaria União",
    dataReferencia: "2026-05-30",
    valorUnitario: 980.0,
    status: "excluido",
    motivoExclusao: "Proposta inválida: CNPJ não confere.",
  },
  // proc-005 — Notebooks corporativos
  {
    id: "preco-006",
    processoId: "proc-005",
    fonte: "contratacao-publica",
    descricaoFonte: "Pregão 089/2025 — TCE-SP",
    fornecedorOuOrgao: "TCE-SP",
    dataReferencia: "2025-12-10",
    valorUnitario: 4600.0,
    status: "incluido",
  },
  {
    id: "preco-007",
    processoId: "proc-005",
    fonte: "contratacao-publica",
    descricaoFonte: "Pregão 033/2026 — Prefeitura de Guarulhos",
    fornecedorOuOrgao: "Prefeitura de Guarulhos",
    dataReferencia: "2026-03-18",
    valorUnitario: 4820.0,
    status: "incluido",
  },
  {
    id: "preco-008",
    processoId: "proc-005",
    fonte: "fornecedor-direto",
    descricaoFonte: "Proposta TechSupply Informática",
    fornecedorOuOrgao: "TechSupply",
    dataReferencia: "2026-06-08",
    valorUnitario: 4750.0,
    status: "incluido",
  },
  // proc-003 — Material de limpeza
  {
    id: "preco-009",
    processoId: "proc-003",
    fonte: "contratacao-publica",
    descricaoFonte: "Pregão 062/2025 — SABESP",
    fornecedorOuOrgao: "SABESP",
    dataReferencia: "2025-11-07",
    valorUnitario: 92.0,
    status: "incluido",
  },
  {
    id: "preco-010",
    processoId: "proc-003",
    fonte: "fornecedor-direto",
    descricaoFonte: "Proposta HigiePro",
    fornecedorOuOrgao: "HigiePro",
    dataReferencia: "2026-04-18",
    valorUnitario: 87.5,
    status: "incluido",
  },
  {
    id: "preco-011",
    processoId: "proc-003",
    fonte: "fornecedor-direto",
    descricaoFonte: "Proposta EcoSupri",
    fornecedorOuOrgao: "EcoSupri",
    dataReferencia: "2026-04-20",
    valorUnitario: 91.0,
    status: "incluido",
  },
];

export const SERIES_PRECOS: SeriePrecoFixture[] = [
  {
    processoId: "proc-001",
    metodo: "media",
    valorEstimado: 1250.0,
    media: 1250.0,
    mediana: 1250.0,
    menorValor: 1180.0,
    coeficienteVariacao: 5.6,
    totalPrecos: 5,
    precosIncluidos: 3,
    precos: PRECOS.filter((p) => p.processoId === "proc-001"),
  },
  {
    processoId: "proc-005",
    metodo: "mediana",
    valorEstimado: 4750.0,
    media: 4723.33,
    mediana: 4750.0,
    menorValor: 4600.0,
    coeficienteVariacao: 2.4,
    totalPrecos: 3,
    precosIncluidos: 3,
    precos: PRECOS.filter((p) => p.processoId === "proc-005"),
  },
  {
    processoId: "proc-003",
    metodo: "media",
    valorEstimado: 90.17,
    media: 90.17,
    mediana: 91.0,
    menorValor: 87.5,
    coeficienteVariacao: 2.6,
    totalPrecos: 3,
    precosIncluidos: 3,
    precos: PRECOS.filter((p) => p.processoId === "proc-003"),
  },
];

export function getSerieByProcessoId(processoId: string): SeriePrecoFixture | undefined {
  return SERIES_PRECOS.find((s) => s.processoId === processoId);
}
