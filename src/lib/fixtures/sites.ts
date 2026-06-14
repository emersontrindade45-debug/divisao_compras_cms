export interface SiteFixture {
  id: string;
  url: string;
  nome: string;
  lista: "branca" | "cinza" | "vermelha";
  motivo?: string;
  categoria: string;
  isMarketplace: boolean;
}

export const SITES: SiteFixture[] = [
  {
    id: "site-001",
    url: "https://www.paineldeprecos.gov.br",
    nome: "Painel de Preços",
    lista: "branca",
    categoria: "Portal governamental",
    isMarketplace: false,
  },
  {
    id: "site-002",
    url: "https://www.comprasnet.gov.br",
    nome: "Comprasnet",
    lista: "branca",
    categoria: "Portal governamental",
    isMarketplace: false,
  },
  {
    id: "site-003",
    url: "https://licitacoes-e.com.br",
    nome: "Licitações-e (Banco do Brasil)",
    lista: "branca",
    categoria: "Portal governamental",
    isMarketplace: false,
  },
  {
    id: "site-004",
    url: "https://www.compras.gov.br",
    nome: "Compras.gov.br",
    lista: "branca",
    categoria: "Portal governamental",
    isMarketplace: false,
  },
  {
    id: "site-005",
    url: "https://www.bec.sp.gov.br",
    nome: "BEC/SP - Bolsa Eletrônica de Compras",
    lista: "branca",
    categoria: "Portal estadual",
    isMarketplace: false,
  },
  {
    id: "site-006",
    url: "https://www.buscaprecoapsp.com.br",
    nome: "Buscapreço APSP",
    lista: "cinza",
    motivo: "Fonte privada com dados dependentes de atualização voluntária; verificar data da última cotação.",
    categoria: "Agregador de preços",
    isMarketplace: false,
  },
  {
    id: "site-007",
    url: "https://www.cotacaoonline.com.br",
    nome: "Cotação Online",
    lista: "cinza",
    motivo: "Plataforma privada; preços podem não refletir condições reais de mercado para contratação pública.",
    categoria: "Agregador de preços",
    isMarketplace: false,
  },
  {
    id: "site-008",
    url: "https://www.mercadolivre.com.br",
    nome: "Mercado Livre",
    lista: "vermelha",
    motivo: "Marketplace com preços de terceiros; não admissível como fonte para pesquisa de preços públicos.",
    categoria: "Marketplace",
    isMarketplace: true,
  },
  {
    id: "site-009",
    url: "https://www.amazon.com.br",
    nome: "Amazon Brasil",
    lista: "vermelha",
    motivo: "Marketplace internacional; preços de terceiros sem rastreabilidade adequada.",
    categoria: "Marketplace",
    isMarketplace: true,
  },
  {
    id: "site-010",
    url: "https://www.shopee.com.br",
    nome: "Shopee",
    lista: "vermelha",
    motivo: "Marketplace com vendedores variados; não admissível por ausência de CNPJ do fornecedor.",
    categoria: "Marketplace",
    isMarketplace: true,
  },
  {
    id: "site-011",
    url: "https://www.magazineluiza.com.br",
    nome: "Magazine Luiza",
    lista: "vermelha",
    motivo: "Varejista com marketplace integrado; não é possível distinguir oferta própria de terceiros.",
    categoria: "Marketplace",
    isMarketplace: true,
  },
  {
    id: "site-012",
    url: "https://www.americanas.com.br",
    nome: "Americanas",
    lista: "vermelha",
    motivo: "Plataforma de marketplace; preços e fornecedores não identificáveis individualmente.",
    categoria: "Marketplace",
    isMarketplace: true,
  },
];
