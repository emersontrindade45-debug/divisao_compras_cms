export type StatusCotacao = "positiva" | "negativa" | "incompleta" | "silenciosa";

export interface CotacaoFixture {
  id: string;
  processoId: string;
  processoNumero: string;
  fornecedorId: string;
  fornecedorRazaoSocial: string;
  fornecedorEmail: string;
  dataEnvio: string;
  dataLimite: string;
  status: StatusCotacao;
  /** Dias restantes até a data-limite (negativo = vencido) */
  diasRestantes: number;
  lembreteEnviado: boolean;
  valorProposto?: number;
  observacao?: string;
}

export interface PropostaFixture {
  id: string;
  cotacaoId: string;
  fornecedorRazaoSocial: string;
  processoNumero: string;
  cnpjValido: "valido" | "ressalva" | "invalido";
  descricaoValida: "valido" | "ressalva" | "invalido";
  valorUnitarioValido: "valido" | "ressalva" | "invalido";
  valorTotalValido: "valido" | "ressalva" | "invalido";
  dataValida: "valido" | "ressalva" | "invalido";
  responsavelValido: "valido" | "ressalva" | "invalido";
  statusGeral: "valida" | "com-ressalva" | "invalida";
  valorUnitario?: number;
  valorTotal?: number;
  dataProposta?: string;
  responsavel?: string;
  observacoes?: string;
}

export const COTACOES: CotacaoFixture[] = [
  {
    id: "cot-001",
    processoId: "proc-001",
    processoNumero: "2026/001",
    fornecedorId: "forn-001",
    fornecedorRazaoSocial: "Móveis Corporativos Santista Ltda.",
    fornecedorEmail: "roberto.ferreira@santosoffice.com.br",
    dataEnvio: "2026-05-20",
    dataLimite: "2026-06-03",
    status: "positiva",
    diasRestantes: -11,
    lembreteEnviado: false,
    valorProposto: 1250.0,
    observacao: "Proposta recebida dentro do prazo.",
  },
  {
    id: "cot-002",
    processoId: "proc-001",
    processoNumero: "2026/001",
    fornecedorId: "forn-002",
    fornecedorRazaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.",
    fornecedorEmail: "marta.oliveira@higiepro.com.br",
    dataEnvio: "2026-05-20",
    dataLimite: "2026-06-03",
    status: "silenciosa",
    diasRestantes: -11,
    lembreteEnviado: true,
    observacao: "Lembrete enviado em 31/05. Sem resposta.",
  },
  {
    id: "cot-003",
    processoId: "proc-001",
    processoNumero: "2026/001",
    fornecedorId: "forn-004",
    fornecedorRazaoSocial: "Papelaria e Consumíveis União Ltda.",
    fornecedorEmail: "lucia.santos@papelariaUniao.com.br",
    dataEnvio: "2026-05-20",
    dataLimite: "2026-06-03",
    status: "incompleta",
    diasRestantes: -11,
    lembreteEnviado: true,
    valorProposto: 980.0,
    observacao: "Proposta sem CNPJ do responsável.",
  },
  {
    id: "cot-004",
    processoId: "proc-005",
    processoNumero: "2026/005",
    fornecedorId: "forn-003",
    fornecedorRazaoSocial: "TechSupply Informática Eireli",
    fornecedorEmail: "felipe.andrade@techsupply.com.br",
    dataEnvio: "2026-06-01",
    dataLimite: "2026-06-20",
    status: "positiva",
    diasRestantes: 6,
    lembreteEnviado: false,
    valorProposto: 4750.0,
  },
  {
    id: "cot-005",
    processoId: "proc-005",
    processoNumero: "2026/005",
    fornecedorId: "forn-007",
    fornecedorRazaoSocial: "Software Solutions Consultoria em TI Eireli",
    fornecedorEmail: "thiago.ramos@softsol.com.br",
    dataEnvio: "2026-06-01",
    dataLimite: "2026-06-20",
    status: "negativa",
    diasRestantes: 6,
    lembreteEnviado: false,
    observacao: "Fornecedor informou que não trabalha com esse segmento.",
  },
  {
    id: "cot-006",
    processoId: "proc-005",
    processoNumero: "2026/005",
    fornecedorId: "forn-008",
    fornecedorRazaoSocial: "EcoSuprimentos Ltda.",
    fornecedorEmail: "patricia.costa@ecosupri.com.br",
    dataEnvio: "2026-06-01",
    dataLimite: "2026-06-20",
    status: "silenciosa",
    diasRestantes: 6,
    lembreteEnviado: false,
  },
  {
    id: "cot-007",
    processoId: "proc-003",
    processoNumero: "2026/003",
    fornecedorId: "forn-002",
    fornecedorRazaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.",
    fornecedorEmail: "marta.oliveira@higiepro.com.br",
    dataEnvio: "2026-04-10",
    dataLimite: "2026-04-24",
    status: "positiva",
    diasRestantes: -51,
    lembreteEnviado: false,
    valorProposto: 87.5,
  },
  {
    id: "cot-008",
    processoId: "proc-003",
    processoNumero: "2026/003",
    fornecedorId: "forn-008",
    fornecedorRazaoSocial: "EcoSuprimentos Ltda.",
    fornecedorEmail: "patricia.costa@ecosupri.com.br",
    dataEnvio: "2026-04-10",
    dataLimite: "2026-04-24",
    status: "positiva",
    diasRestantes: -51,
    lembreteEnviado: false,
    valorProposto: 91.0,
  },
];

export const PROPOSTAS: PropostaFixture[] = [
  {
    id: "prop-001",
    cotacaoId: "cot-001",
    fornecedorRazaoSocial: "Móveis Corporativos Santista Ltda.",
    processoNumero: "2026/001",
    cnpjValido: "valido",
    descricaoValida: "valido",
    valorUnitarioValido: "valido",
    valorTotalValido: "valido",
    dataValida: "valido",
    responsavelValido: "valido",
    statusGeral: "valida",
    valorUnitario: 1250.0,
    valorTotal: 50000.0,
    dataProposta: "2026-05-28",
    responsavel: "Roberto Ferreira",
  },
  {
    id: "prop-002",
    cotacaoId: "cot-003",
    fornecedorRazaoSocial: "Papelaria e Consumíveis União Ltda.",
    processoNumero: "2026/001",
    cnpjValido: "invalido",
    descricaoValida: "valido",
    valorUnitarioValido: "valido",
    valorTotalValido: "valido",
    dataValida: "valido",
    responsavelValido: "ressalva",
    statusGeral: "invalida",
    valorUnitario: 980.0,
    valorTotal: 39200.0,
    dataProposta: "2026-05-30",
    responsavel: "Desconhecido",
    observacoes: "CNPJ do fornecedor não confere com a razão social apresentada na proposta.",
  },
  {
    id: "prop-003",
    cotacaoId: "cot-004",
    fornecedorRazaoSocial: "TechSupply Informática Eireli",
    processoNumero: "2026/005",
    cnpjValido: "valido",
    descricaoValida: "valido",
    valorUnitarioValido: "valido",
    valorTotalValido: "valido",
    dataValida: "valido",
    responsavelValido: "valido",
    statusGeral: "valida",
    valorUnitario: 4750.0,
    valorTotal: 142500.0,
    dataProposta: "2026-06-08",
    responsavel: "Felipe Andrade",
  },
  {
    id: "prop-004",
    cotacaoId: "cot-007",
    fornecedorRazaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.",
    processoNumero: "2026/003",
    cnpjValido: "valido",
    descricaoValida: "ressalva",
    valorUnitarioValido: "valido",
    valorTotalValido: "valido",
    dataValida: "valido",
    responsavelValido: "valido",
    statusGeral: "com-ressalva",
    valorUnitario: 87.5,
    valorTotal: 10500.0,
    dataProposta: "2026-04-18",
    responsavel: "Marta Oliveira",
    observacoes: "Descrição do produto ligeiramente diferente do especificado no edital.",
  },
];

export function getCotacoesByProcessoId(processoId: string): CotacaoFixture[] {
  return COTACOES.filter((c) => c.processoId === processoId);
}

export function getPropostaByCotacaoId(cotacaoId: string): PropostaFixture | undefined {
  return PROPOSTAS.find((p) => p.cotacaoId === cotacaoId);
}
