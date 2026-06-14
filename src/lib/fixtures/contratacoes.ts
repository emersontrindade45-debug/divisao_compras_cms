import type { StatusDominio } from "@/lib/domain/status";

export interface ContratacaoFixture {
  id: string;
  numero: string;
  orgao: string;
  objeto: string;
  modalidade: string;
  valorUnitario: number;
  quantidade: number;
  unidade: string;
  dataContratacao: string;
  fonte: string;
  aderencia: StatusDominio;
  justificativaAderencia?: string;
  palavrasChave: string[];
}

export const CONTRATACOES: ContratacaoFixture[] = [
  {
    id: "cont-001",
    numero: "PE-2025/0142",
    orgao: "Câmara Municipal de Santos",
    objeto: "Aquisição de cadeiras ergonômicas com encosto regulável e apoio lombar",
    modalidade: "Pregão Eletrônico",
    valorUnitario: 1250.0,
    quantidade: 40,
    unidade: "unidade",
    dataContratacao: "2025-08-15",
    fonte: "Painel de Preços - paineldeprecos.gov.br",
    aderencia: "aderente",
    palavrasChave: ["cadeira", "ergonômica", "mobiliário"],
  },
  {
    id: "cont-002",
    numero: "PE-2025/0389",
    orgao: "Tribunal Regional Eleitoral de SP",
    objeto: "Fornecimento de cadeiras giratórias ergonômicas NR-17",
    modalidade: "Pregão Eletrônico",
    valorUnitario: 1180.0,
    quantidade: 60,
    unidade: "unidade",
    dataContratacao: "2025-06-20",
    fonte: "Comprasnet - comprasnet.gov.br",
    aderencia: "aderente",
    palavrasChave: ["cadeira", "ergonômica", "NR-17"],
  },
  {
    id: "cont-003",
    numero: "DL-2025/0071",
    orgao: "Ministério da Saúde",
    objeto: "Aquisição de kits de material de limpeza e higienização com registro ANVISA",
    modalidade: "Dispensa de Licitação",
    valorUnitario: 87.5,
    quantidade: 100,
    unidade: "kit",
    dataContratacao: "2025-09-03",
    fonte: "Painel de Preços - paineldeprecos.gov.br",
    aderencia: "aderente",
    palavrasChave: ["limpeza", "higiene", "ANVISA"],
  },
  {
    id: "cont-004",
    numero: "PE-2025/0501",
    orgao: "Prefeitura Municipal de Guarujá",
    objeto: "Fornecimento de material de limpeza biodegradável para uso institucional",
    modalidade: "Pregão Eletrônico",
    valorUnitario: 95.0,
    quantidade: 80,
    unidade: "kit",
    dataContratacao: "2025-10-11",
    fonte: "Comprasnet - comprasnet.gov.br",
    aderencia: "parcial",
    justificativaAderencia:
      "Especificação de biodegradabilidade atende, mas quantidade mínima por item diverge levemente.",
    palavrasChave: ["limpeza", "biodegradável"],
  },
  {
    id: "cont-005",
    numero: "CC-2025/0018",
    orgao: "Tribunal de Contas do Estado de SP",
    objeto: "Aquisição de notebooks corporativos com 16GB RAM e SSD 512GB",
    modalidade: "Concorrência",
    valorUnitario: 4850.0,
    quantidade: 25,
    unidade: "unidade",
    dataContratacao: "2025-05-28",
    fonte: "Painel de Preços - paineldeprecos.gov.br",
    aderencia: "aderente",
    palavrasChave: ["notebook", "informática", "equipamento"],
  },
  {
    id: "cont-006",
    numero: "PE-2024/0677",
    orgao: "Câmara dos Deputados",
    objeto: "Fornecimento de notebooks com processador Intel i5 e 8GB RAM",
    modalidade: "Pregão Eletrônico",
    valorUnitario: 3200.0,
    quantidade: 50,
    unidade: "unidade",
    dataContratacao: "2024-11-14",
    fonte: "Comprasnet - comprasnet.gov.br",
    aderencia: "parcial",
    justificativaAderencia:
      "Especificação de RAM (8GB) inferior à demanda (16GB); valor referencial pode estar desatualizado.",
    palavrasChave: ["notebook", "informática"],
  },
  {
    id: "cont-007",
    numero: "PE-2025/0233",
    orgao: "Universidade Federal de São Paulo",
    objeto: "Aquisição de papel A4 75g/m² com certificação FSC",
    modalidade: "Pregão Eletrônico",
    valorUnitario: 28.9,
    quantidade: 400,
    unidade: "resma",
    dataContratacao: "2025-07-19",
    fonte: "Painel de Preços - paineldeprecos.gov.br",
    aderencia: "aderente",
    palavrasChave: ["papel", "consumo", "FSC"],
  },
  {
    id: "cont-008",
    numero: "IN-2024/0009",
    orgao: "Senado Federal",
    objeto: "Outsourcing de impressão com locação de impressoras multifuncionais",
    modalidade: "Inexigibilidade",
    valorUnitario: 890.0,
    quantidade: 10,
    unidade: "serviço",
    dataContratacao: "2024-09-30",
    fonte: "Comprasnet - comprasnet.gov.br",
    aderencia: "nao-aderente",
    justificativaAderencia:
      "Modalidade inexigibilidade não aplicável ao objeto; valor por unidade diverge significativamente do mercado atual.",
    palavrasChave: ["impressora", "outsourcing", "locação"],
  },
];
