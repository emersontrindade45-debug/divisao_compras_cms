import type { StatusDominio } from "@/lib/domain/status";

export type ClassificacaoItem = "comum" | "especifico";

export interface ProcessoFixture {
  id: string;
  numero: string;
  objeto: string;
  unidade: string;
  quantidade: number;
  caracteristicasTecnicas: string;
  palavrasChave: string[];
  classificacao: ClassificacaoItem;
  responsavel: string;
  status: StatusDominio;
  /** ISO 8601 — "YYYY-MM-DD" */
  dataAbertura: string;
}

export const PROCESSOS: ProcessoFixture[] = [
  {
    id: "proc-001",
    numero: "2026/001",
    objeto: "Aquisição de cadeiras ergonômicas",
    unidade: "unidade",
    quantidade: 40,
    caracteristicasTecnicas: "Encosto regulável, apoio lombar, certificação NR-17.",
    palavrasChave: ["cadeira", "ergonômica", "mobiliário"],
    classificacao: "comum",
    responsavel: "Ana Souza",
    status: "aderente",
    dataAbertura: "2026-02-10",
  },
  {
    id: "proc-002",
    numero: "2026/002",
    objeto: "Serviço de manutenção predial preventiva",
    unidade: "serviço",
    quantidade: 1,
    caracteristicasTecnicas: "Contrato anual, atendimento mensal, equipe especializada.",
    palavrasChave: ["manutenção", "predial", "serviço"],
    classificacao: "especifico",
    responsavel: "Bruno Lima",
    status: "pendente",
    dataAbertura: "2026-03-05",
  },
  {
    id: "proc-003",
    numero: "2026/003",
    objeto: "Material de limpeza e higienização",
    unidade: "kit",
    quantidade: 120,
    caracteristicasTecnicas: "Kits com produtos biodegradáveis, registro ANVISA.",
    palavrasChave: ["limpeza", "higiene", "consumo"],
    classificacao: "comum",
    responsavel: "Carla Dias",
    status: "parcial",
    dataAbertura: "2026-01-22",
  },
  {
    id: "proc-004",
    numero: "2026/004",
    objeto: "Licença de software de gestão documental",
    unidade: "licença",
    quantidade: 25,
    caracteristicasTecnicas: "Licença anual, suporte técnico, conformidade LGPD.",
    palavrasChave: ["software", "licença", "gestão"],
    classificacao: "especifico",
    responsavel: "Diego Alves",
    status: "nao-aderente",
    dataAbertura: "2025-11-30",
  },
  {
    id: "proc-005",
    numero: "2026/005",
    objeto: "Aquisição de notebooks corporativos",
    unidade: "unidade",
    quantidade: 30,
    caracteristicasTecnicas: "16GB RAM, SSD 512GB, garantia on-site 36 meses.",
    palavrasChave: ["notebook", "informática", "equipamento"],
    classificacao: "comum",
    responsavel: "Ana Souza",
    status: "pendente",
    dataAbertura: "2026-04-12",
  },
  {
    id: "proc-006",
    numero: "2026/006",
    objeto: "Serviço de consultoria em segurança da informação",
    unidade: "serviço",
    quantidade: 1,
    caracteristicasTecnicas: "Diagnóstico, plano de ação e relatório de conformidade.",
    palavrasChave: ["consultoria", "segurança", "TI"],
    classificacao: "especifico",
    responsavel: "Carla Dias",
    status: "aderente",
    dataAbertura: "2025-12-15",
  },
  {
    id: "proc-007",
    numero: "2026/007",
    objeto: "Aquisição de papel A4 sustentável",
    unidade: "resma",
    quantidade: 500,
    caracteristicasTecnicas: "Certificação FSC, gramatura 75g/m², alvura 90%.",
    palavrasChave: ["papel", "consumo", "sustentável"],
    classificacao: "comum",
    responsavel: "Bruno Lima",
    status: "parcial",
    dataAbertura: "2026-02-28",
  },
  {
    id: "proc-008",
    numero: "2026/008",
    objeto: "Locação de impressoras multifuncionais",
    unidade: "serviço",
    quantidade: 12,
    caracteristicasTecnicas: "Outsourcing de impressão, franquia mensal, manutenção inclusa.",
    palavrasChave: ["impressora", "locação", "outsourcing"],
    classificacao: "especifico",
    responsavel: "Diego Alves",
    status: "nao-aderente",
    dataAbertura: "2025-10-08",
  },
];

export function getProcessoById(id: string): ProcessoFixture | undefined {
  return PROCESSOS.find((p) => p.id === id);
}

export function getResponsaveis(): string[] {
  return Array.from(new Set(PROCESSOS.map((p) => p.responsavel))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
