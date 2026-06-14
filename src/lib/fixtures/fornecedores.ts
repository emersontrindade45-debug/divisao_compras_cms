export interface FornecedorFixture {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  categoria: string[];
  cidade: string;
  estado: string;
  responsavelContato: string;
  email: string;
  telefone?: string;
  score: number;
  totalCotacoes: number;
  totalRespostas: number;
  taxaResposta: number;
  ultimaResposta?: string;
  status: "ativo" | "inativo";
}

export interface HistoricoCotacaoFixture {
  id: string;
  fornecedorId: string;
  processoNumero: string;
  data: string;
  statusResposta: "respondido" | "nao-respondido" | "recusado";
  valorProposto?: number;
}

export const FORNECEDORES: FornecedorFixture[] = [
  {
    id: "forn-001",
    cnpj: "12.345.678/0001-90",
    razaoSocial: "Móveis Corporativos Santista Ltda.",
    nomeFantasia: "Santos Office",
    categoria: ["Mobiliário", "Equipamentos de escritório"],
    cidade: "Santos",
    estado: "SP",
    responsavelContato: "Roberto Ferreira",
    email: "roberto.ferreira@santosoffice.com.br",
    telefone: "(13) 3211-4500",
    score: 88,
    totalCotacoes: 12,
    totalRespostas: 11,
    taxaResposta: 91.7,
    ultimaResposta: "2026-05-20",
    status: "ativo",
  },
  {
    id: "forn-002",
    cnpj: "23.456.789/0001-01",
    razaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.",
    nomeFantasia: "HigiePro",
    categoria: ["Material de limpeza", "Higienização"],
    cidade: "São Paulo",
    estado: "SP",
    responsavelContato: "Marta Oliveira",
    email: "marta.oliveira@higiepro.com.br",
    telefone: "(11) 2233-8800",
    score: 79,
    totalCotacoes: 8,
    totalRespostas: 7,
    taxaResposta: 87.5,
    ultimaResposta: "2026-04-15",
    status: "ativo",
  },
  {
    id: "forn-003",
    cnpj: "34.567.890/0001-12",
    razaoSocial: "TechSupply Informática Eireli",
    nomeFantasia: "TechSupply",
    categoria: ["Informática", "Notebooks", "Periféricos"],
    cidade: "Campinas",
    estado: "SP",
    responsavelContato: "Felipe Andrade",
    email: "felipe.andrade@techsupply.com.br",
    telefone: "(19) 3344-9900",
    score: 92,
    totalCotacoes: 15,
    totalRespostas: 14,
    taxaResposta: 93.3,
    ultimaResposta: "2026-06-01",
    status: "ativo",
  },
  {
    id: "forn-004",
    cnpj: "45.678.901/0001-23",
    razaoSocial: "Papelaria e Consumíveis União Ltda.",
    nomeFantasia: "Papelaria União",
    categoria: ["Material de consumo", "Papel", "Papelaria"],
    cidade: "Santos",
    estado: "SP",
    responsavelContato: "Lucia Santos",
    email: "lucia.santos@papelariaUniao.com.br",
    score: 65,
    totalCotacoes: 6,
    totalRespostas: 4,
    taxaResposta: 66.7,
    ultimaResposta: "2026-03-10",
    status: "ativo",
  },
  {
    id: "forn-005",
    cnpj: "56.789.012/0001-34",
    razaoSocial: "Impressão Total Serviços Gráficos Ltda.",
    nomeFantasia: "Impressão Total",
    categoria: ["Impressoras", "Outsourcing de impressão"],
    cidade: "São Vicente",
    estado: "SP",
    responsavelContato: "Carlos Nascimento",
    email: "carlos.nascimento@impressaototal.com.br",
    telefone: "(13) 3555-2200",
    score: 58,
    totalCotacoes: 5,
    totalRespostas: 3,
    taxaResposta: 60.0,
    ultimaResposta: "2026-02-28",
    status: "ativo",
  },
  {
    id: "forn-006",
    cnpj: "67.890.123/0001-45",
    razaoSocial: "Construtora e Manutenção Predial Litoral S.A.",
    nomeFantasia: "LitoralMant",
    categoria: ["Manutenção predial", "Serviços gerais"],
    cidade: "Guarujá",
    estado: "SP",
    responsavelContato: "Sandra Moreira",
    email: "sandra.moreira@litoralmant.com.br",
    telefone: "(13) 3444-7700",
    score: 42,
    totalCotacoes: 4,
    totalRespostas: 2,
    taxaResposta: 50.0,
    ultimaResposta: "2025-12-05",
    status: "ativo",
  },
  {
    id: "forn-007",
    cnpj: "78.901.234/0001-56",
    razaoSocial: "Software Solutions Consultoria em TI Eireli",
    nomeFantasia: "SoftSol",
    categoria: ["Software", "Consultoria em TI", "Segurança da informação"],
    cidade: "São Paulo",
    estado: "SP",
    responsavelContato: "Thiago Ramos",
    email: "thiago.ramos@softsol.com.br",
    score: 35,
    totalCotacoes: 3,
    totalRespostas: 1,
    taxaResposta: 33.3,
    status: "inativo",
  },
  {
    id: "forn-008",
    cnpj: "89.012.345/0001-67",
    razaoSocial: "EcoSuprimentos Ltda.",
    nomeFantasia: "EcoSupri",
    categoria: ["Material de limpeza", "Produtos sustentáveis"],
    cidade: "Praia Grande",
    estado: "SP",
    responsavelContato: "Patrícia Costa",
    email: "patricia.costa@ecosupri.com.br",
    telefone: "(13) 3666-1100",
    score: 72,
    totalCotacoes: 7,
    totalRespostas: 6,
    taxaResposta: 85.7,
    ultimaResposta: "2026-05-12",
    status: "ativo",
  },
];

export const HISTORICO_COTACOES: HistoricoCotacaoFixture[] = [
  {
    id: "hc-001",
    fornecedorId: "forn-001",
    processoNumero: "2026/001",
    data: "2026-03-10",
    statusResposta: "respondido",
    valorProposto: 1250.0,
  },
  {
    id: "hc-002",
    fornecedorId: "forn-001",
    processoNumero: "2025/045",
    data: "2025-09-22",
    statusResposta: "respondido",
    valorProposto: 1180.0,
  },
  {
    id: "hc-003",
    fornecedorId: "forn-001",
    processoNumero: "2025/031",
    data: "2025-06-14",
    statusResposta: "nao-respondido",
  },
  {
    id: "hc-004",
    fornecedorId: "forn-002",
    processoNumero: "2026/003",
    data: "2026-02-18",
    statusResposta: "respondido",
    valorProposto: 87.5,
  },
  {
    id: "hc-005",
    fornecedorId: "forn-002",
    processoNumero: "2025/062",
    data: "2025-11-07",
    statusResposta: "respondido",
    valorProposto: 92.0,
  },
  {
    id: "hc-006",
    fornecedorId: "forn-003",
    processoNumero: "2026/005",
    data: "2026-05-02",
    statusResposta: "respondido",
    valorProposto: 4750.0,
  },
  {
    id: "hc-007",
    fornecedorId: "forn-003",
    processoNumero: "2025/089",
    data: "2025-12-10",
    statusResposta: "respondido",
    valorProposto: 4600.0,
  },
  {
    id: "hc-008",
    fornecedorId: "forn-004",
    processoNumero: "2026/007",
    data: "2026-03-25",
    statusResposta: "respondido",
    valorProposto: 29.5,
  },
  {
    id: "hc-009",
    fornecedorId: "forn-005",
    processoNumero: "2026/008",
    data: "2026-04-08",
    statusResposta: "recusado",
  },
  {
    id: "hc-010",
    fornecedorId: "forn-006",
    processoNumero: "2026/002",
    data: "2026-01-30",
    statusResposta: "nao-respondido",
  },
  {
    id: "hc-011",
    fornecedorId: "forn-007",
    processoNumero: "2026/006",
    data: "2026-02-05",
    statusResposta: "nao-respondido",
  },
  {
    id: "hc-012",
    fornecedorId: "forn-008",
    processoNumero: "2026/003",
    data: "2026-02-20",
    statusResposta: "respondido",
    valorProposto: 91.0,
  },
];
