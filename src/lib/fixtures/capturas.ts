export interface CapturaFixture {
  id: string;
  siteId: string;
  processoId: string;
  url: string;
  produto: string;
  valorUnitario: number;
  dataHoraAcesso: string;
  evidencia: string;
}

export const CAPTURAS: CapturaFixture[] = [
  {
    id: "cap-001",
    siteId: "site-001",
    processoId: "proc-001",
    url: "https://www.paineldeprecos.gov.br/analise-departamento?item=cadeira-ergonomica",
    produto: "Cadeira ergonômica com encosto regulável NR-17",
    valorUnitario: 1250.0,
    dataHoraAcesso: "2026-06-10T09:15:00-03:00",
    evidencia: "captura-painel-cadeira-20260610.png",
  },
  {
    id: "cap-002",
    siteId: "site-002",
    processoId: "proc-001",
    url: "https://www.comprasnet.gov.br/sicaf/public/pregoEletronico/cadeira-ergonomica",
    produto: "Cadeira giratória ergonômica com apoio lombar",
    valorUnitario: 1180.0,
    dataHoraAcesso: "2026-06-10T10:42:00-03:00",
    evidencia: "captura-comprasnet-cadeira-20260610.png",
  },
  {
    id: "cap-003",
    siteId: "site-001",
    processoId: "proc-003",
    url: "https://www.paineldeprecos.gov.br/analise-departamento?item=kit-limpeza",
    produto: "Kit material de limpeza biodegradável 10 itens",
    valorUnitario: 87.5,
    dataHoraAcesso: "2026-06-11T14:32:00-03:00",
    evidencia: "captura-painel-limpeza-20260611.png",
  },
  {
    id: "cap-004",
    siteId: "site-004",
    processoId: "proc-005",
    url: "https://www.compras.gov.br/notaFiscalEletronica/notebook-corporativo",
    produto: "Notebook corporativo 16GB RAM SSD 512GB",
    valorUnitario: 4850.0,
    dataHoraAcesso: "2026-06-12T08:05:00-03:00",
    evidencia: "captura-compras-notebook-20260612.png",
  },
  {
    id: "cap-005",
    siteId: "site-005",
    processoId: "proc-007",
    url: "https://www.bec.sp.gov.br/item/papel-a4-fsc",
    produto: "Papel A4 75g/m² certificação FSC - resma 500 folhas",
    valorUnitario: 28.9,
    dataHoraAcesso: "2026-06-13T11:20:00-03:00",
    evidencia: "captura-bec-papel-20260613.png",
  },
  {
    id: "cap-006",
    siteId: "site-002",
    processoId: "proc-008",
    url: "https://www.comprasnet.gov.br/sicaf/public/pregao/impressora-multifuncional",
    produto: "Locação de impressora multifuncional A4/A3 com franquia mensal",
    valorUnitario: 890.0,
    dataHoraAcesso: "2026-06-13T15:47:00-03:00",
    evidencia: "captura-comprasnet-impressora-20260613.png",
  },
];
