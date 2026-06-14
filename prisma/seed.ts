import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurado");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed...");

  // ── Usuário padrão ──────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: "admin@cms.santos.sp.gov.br" },
    update: {},
    create: {
      email: "admin@cms.santos.sp.gov.br",
      name: "Administrador",
      passwordHash: "$2b$10$placeholder_hash_change_in_m6",
      role: "aprovacao",
    },
  });
  console.log("✓ Usuário criado:", user.email);

  // ── Sites ───────────────────────────────────────────────────────────────────
  const sites = await Promise.all([
    prisma.site.upsert({
      where: { url: "https://www.paineldeprecos.gov.br" },
      update: {},
      create: { url: "https://www.paineldeprecos.gov.br", nome: "Painel de Preços", lista: "branca", categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.comprasnet.gov.br" },
      update: {},
      create: { url: "https://www.comprasnet.gov.br", nome: "Comprasnet", lista: "branca", categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://licitacoes-e.com.br" },
      update: {},
      create: { url: "https://licitacoes-e.com.br", nome: "Licitações-e (Banco do Brasil)", lista: "branca", categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.compras.gov.br" },
      update: {},
      create: { url: "https://www.compras.gov.br", nome: "Compras.gov.br", lista: "branca", categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.bec.sp.gov.br" },
      update: {},
      create: { url: "https://www.bec.sp.gov.br", nome: "BEC/SP - Bolsa Eletrônica de Compras", lista: "branca", categoria: "Portal estadual", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.buscaprecoapsp.com.br" },
      update: {},
      create: { url: "https://www.buscaprecoapsp.com.br", nome: "Buscapreço APSP", lista: "cinza", motivo: "Fonte privada com dados dependentes de atualização voluntária; verificar data da última cotação.", categoria: "Agregador de preços", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.cotacaoonline.com.br" },
      update: {},
      create: { url: "https://www.cotacaoonline.com.br", nome: "Cotação Online", lista: "cinza", motivo: "Plataforma privada; preços podem não refletir condições reais de mercado para contratação pública.", categoria: "Agregador de preços", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.mercadolivre.com.br" },
      update: {},
      create: { url: "https://www.mercadolivre.com.br", nome: "Mercado Livre", lista: "vermelha", motivo: "Marketplace com preços de terceiros; não admissível como fonte para pesquisa de preços públicos.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.amazon.com.br" },
      update: {},
      create: { url: "https://www.amazon.com.br", nome: "Amazon Brasil", lista: "vermelha", motivo: "Marketplace internacional; preços de terceiros sem rastreabilidade adequada.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.shopee.com.br" },
      update: {},
      create: { url: "https://www.shopee.com.br", nome: "Shopee", lista: "vermelha", motivo: "Marketplace com vendedores variados; não admissível por ausência de CNPJ do fornecedor.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.magazineluiza.com.br" },
      update: {},
      create: { url: "https://www.magazineluiza.com.br", nome: "Magazine Luiza", lista: "vermelha", motivo: "Varejista com marketplace integrado; não é possível distinguir oferta própria de terceiros.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.americanas.com.br" },
      update: {},
      create: { url: "https://www.americanas.com.br", nome: "Americanas", lista: "vermelha", motivo: "Plataforma de marketplace; preços e fornecedores não identificáveis individualmente.", categoria: "Marketplace", isMarketplace: true },
    }),
  ]);
  console.log("✓ Sites criados:", sites.length);

  // ── Fornecedores ────────────────────────────────────────────────────────────
  const forn001 = await prisma.fornecedor.upsert({
    where: { cnpj: "12.345.678/0001-90" },
    update: {},
    create: { cnpj: "12.345.678/0001-90", razaoSocial: "Móveis Corporativos Santista Ltda.", nomeFantasia: "Santos Office", categoria: ["Mobiliário", "Equipamentos de escritório"], cidade: "Santos", estado: "SP", responsavelContato: "Roberto Ferreira", email: "roberto.ferreira@santosoffice.com.br", telefone: "(13) 3211-4500", score: 88, totalCotacoes: 12, totalRespostas: 11, taxaResposta: 91.7, ultimaResposta: new Date("2026-05-20"), status: "ativo" },
  });
  const forn002 = await prisma.fornecedor.upsert({
    where: { cnpj: "23.456.789/0001-01" },
    update: {},
    create: { cnpj: "23.456.789/0001-01", razaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.", nomeFantasia: "HigiePro", categoria: ["Material de limpeza", "Higienização"], cidade: "São Paulo", estado: "SP", responsavelContato: "Marta Oliveira", email: "marta.oliveira@higiepro.com.br", telefone: "(11) 2233-8800", score: 79, totalCotacoes: 8, totalRespostas: 7, taxaResposta: 87.5, ultimaResposta: new Date("2026-04-15"), status: "ativo" },
  });
  const forn003 = await prisma.fornecedor.upsert({
    where: { cnpj: "34.567.890/0001-12" },
    update: {},
    create: { cnpj: "34.567.890/0001-12", razaoSocial: "TechSupply Informática Eireli", nomeFantasia: "TechSupply", categoria: ["Informática", "Notebooks", "Periféricos"], cidade: "Campinas", estado: "SP", responsavelContato: "Felipe Andrade", email: "felipe.andrade@techsupply.com.br", telefone: "(19) 3344-9900", score: 92, totalCotacoes: 15, totalRespostas: 14, taxaResposta: 93.3, ultimaResposta: new Date("2026-06-01"), status: "ativo" },
  });
  const forn004 = await prisma.fornecedor.upsert({
    where: { cnpj: "45.678.901/0001-23" },
    update: {},
    create: { cnpj: "45.678.901/0001-23", razaoSocial: "Papelaria e Consumíveis União Ltda.", nomeFantasia: "Papelaria União", categoria: ["Material de consumo", "Papel", "Papelaria"], cidade: "Santos", estado: "SP", responsavelContato: "Lucia Santos", email: "lucia.santos@papelariaUniao.com.br", score: 65, totalCotacoes: 6, totalRespostas: 4, taxaResposta: 66.7, ultimaResposta: new Date("2026-03-10"), status: "ativo" },
  });
  const forn005 = await prisma.fornecedor.upsert({
    where: { cnpj: "56.789.012/0001-34" },
    update: {},
    create: { cnpj: "56.789.012/0001-34", razaoSocial: "Impressão Total Serviços Gráficos Ltda.", nomeFantasia: "Impressão Total", categoria: ["Impressoras", "Outsourcing de impressão"], cidade: "São Vicente", estado: "SP", responsavelContato: "Carlos Nascimento", email: "carlos.nascimento@impressaototal.com.br", telefone: "(13) 3555-2200", score: 58, totalCotacoes: 5, totalRespostas: 3, taxaResposta: 60.0, ultimaResposta: new Date("2026-02-28"), status: "ativo" },
  });
  const forn006 = await prisma.fornecedor.upsert({
    where: { cnpj: "67.890.123/0001-45" },
    update: {},
    create: { cnpj: "67.890.123/0001-45", razaoSocial: "Construtora e Manutenção Predial Litoral S.A.", nomeFantasia: "LitoralMant", categoria: ["Manutenção predial", "Serviços gerais"], cidade: "Guarujá", estado: "SP", responsavelContato: "Sandra Moreira", email: "sandra.moreira@litoralmant.com.br", telefone: "(13) 3444-7700", score: 42, totalCotacoes: 4, totalRespostas: 2, taxaResposta: 50.0, ultimaResposta: new Date("2025-12-05"), status: "ativo" },
  });
  const forn007 = await prisma.fornecedor.upsert({
    where: { cnpj: "78.901.234/0001-56" },
    update: {},
    create: { cnpj: "78.901.234/0001-56", razaoSocial: "Software Solutions Consultoria em TI Eireli", nomeFantasia: "SoftSol", categoria: ["Software", "Consultoria em TI", "Segurança da informação"], cidade: "São Paulo", estado: "SP", responsavelContato: "Thiago Ramos", email: "thiago.ramos@softsol.com.br", score: 35, totalCotacoes: 3, totalRespostas: 1, taxaResposta: 33.3, status: "inativo" },
  });
  const forn008 = await prisma.fornecedor.upsert({
    where: { cnpj: "89.012.345/0001-67" },
    update: {},
    create: { cnpj: "89.012.345/0001-67", razaoSocial: "EcoSuprimentos Ltda.", nomeFantasia: "EcoSupri", categoria: ["Material de limpeza", "Produtos sustentáveis"], cidade: "Praia Grande", estado: "SP", responsavelContato: "Patrícia Costa", email: "patricia.costa@ecosupri.com.br", telefone: "(13) 3666-1100", score: 72, totalCotacoes: 7, totalRespostas: 6, taxaResposta: 85.7, ultimaResposta: new Date("2026-05-12"), status: "ativo" },
  });
  console.log("✓ Fornecedores criados: 8");

  // ── Histórico de cotações ───────────────────────────────────────────────────
  await prisma.historicoCotacao.createMany({
    data: [
      { fornecedorId: forn001.id, processoNumero: "2026/001", data: new Date("2026-03-10"), statusResposta: "respondido", valorProposto: 1250.0 },
      { fornecedorId: forn001.id, processoNumero: "2025/045", data: new Date("2025-09-22"), statusResposta: "respondido", valorProposto: 1180.0 },
      { fornecedorId: forn001.id, processoNumero: "2025/031", data: new Date("2025-06-14"), statusResposta: "nao_respondido" },
      { fornecedorId: forn002.id, processoNumero: "2026/003", data: new Date("2026-02-18"), statusResposta: "respondido", valorProposto: 87.5 },
      { fornecedorId: forn002.id, processoNumero: "2025/062", data: new Date("2025-11-07"), statusResposta: "respondido", valorProposto: 92.0 },
      { fornecedorId: forn003.id, processoNumero: "2026/005", data: new Date("2026-05-02"), statusResposta: "respondido", valorProposto: 4750.0 },
      { fornecedorId: forn003.id, processoNumero: "2025/089", data: new Date("2025-12-10"), statusResposta: "respondido", valorProposto: 4600.0 },
      { fornecedorId: forn004.id, processoNumero: "2026/007", data: new Date("2026-03-25"), statusResposta: "respondido", valorProposto: 29.5 },
      { fornecedorId: forn005.id, processoNumero: "2026/008", data: new Date("2026-04-08"), statusResposta: "recusado" },
      { fornecedorId: forn006.id, processoNumero: "2026/002", data: new Date("2026-01-30"), statusResposta: "nao_respondido" },
      { fornecedorId: forn007.id, processoNumero: "2026/006", data: new Date("2026-02-05"), statusResposta: "nao_respondido" },
      { fornecedorId: forn008.id, processoNumero: "2026/003", data: new Date("2026-02-20"), statusResposta: "respondido", valorProposto: 91.0 },
    ],
    skipDuplicates: true,
  });
  console.log("✓ Histórico de cotações criado");

  // ── Processos ───────────────────────────────────────────────────────────────
  const proc001 = await prisma.processo.upsert({
    where: { numero: "2026/001" },
    update: {},
    create: { numero: "2026/001", objeto: "Aquisição de cadeiras ergonômicas", unidade: "unidade", quantidade: 40, caracteristicasTecnicas: "Encosto regulável, apoio lombar, certificação NR-17.", palavrasChave: ["cadeira", "ergonômica", "mobiliário"], classificacao: "comum", responsavel: "Ana Souza", status: "aderente", dataAbertura: new Date("2026-02-10") },
  });
  const proc002 = await prisma.processo.upsert({
    where: { numero: "2026/002" },
    update: {},
    create: { numero: "2026/002", objeto: "Serviço de manutenção predial preventiva", unidade: "serviço", quantidade: 1, caracteristicasTecnicas: "Contrato anual, atendimento mensal, equipe especializada.", palavrasChave: ["manutenção", "predial", "serviço"], classificacao: "especifico", responsavel: "Bruno Lima", status: "pendente", dataAbertura: new Date("2026-03-05") },
  });
  const proc003 = await prisma.processo.upsert({
    where: { numero: "2026/003" },
    update: {},
    create: { numero: "2026/003", objeto: "Material de limpeza e higienização", unidade: "kit", quantidade: 120, caracteristicasTecnicas: "Kits com produtos biodegradáveis, registro ANVISA.", palavrasChave: ["limpeza", "higiene", "consumo"], classificacao: "comum", responsavel: "Carla Dias", status: "parcial", dataAbertura: new Date("2026-01-22") },
  });
  await prisma.processo.upsert({
    where: { numero: "2026/004" },
    update: {},
    create: { numero: "2026/004", objeto: "Licença de software de gestão documental", unidade: "licença", quantidade: 25, caracteristicasTecnicas: "Licença anual, suporte técnico, conformidade LGPD.", palavrasChave: ["software", "licença", "gestão"], classificacao: "especifico", responsavel: "Diego Alves", status: "nao_aderente", dataAbertura: new Date("2025-11-30") },
  });
  const proc005 = await prisma.processo.upsert({
    where: { numero: "2026/005" },
    update: {},
    create: { numero: "2026/005", objeto: "Aquisição de notebooks corporativos", unidade: "unidade", quantidade: 30, caracteristicasTecnicas: "16GB RAM, SSD 512GB, garantia on-site 36 meses.", palavrasChave: ["notebook", "informática", "equipamento"], classificacao: "comum", responsavel: "Ana Souza", status: "pendente", dataAbertura: new Date("2026-04-12") },
  });
  await prisma.processo.upsert({
    where: { numero: "2026/006" },
    update: {},
    create: { numero: "2026/006", objeto: "Serviço de consultoria em segurança da informação", unidade: "serviço", quantidade: 1, caracteristicasTecnicas: "Diagnóstico, plano de ação e relatório de conformidade.", palavrasChave: ["consultoria", "segurança", "TI"], classificacao: "especifico", responsavel: "Carla Dias", status: "aderente", dataAbertura: new Date("2025-12-15") },
  });
  const proc007 = await prisma.processo.upsert({
    where: { numero: "2026/007" },
    update: {},
    create: { numero: "2026/007", objeto: "Aquisição de papel A4 sustentável", unidade: "resma", quantidade: 500, caracteristicasTecnicas: "Certificação FSC, gramatura 75g/m², alvura 90%.", palavrasChave: ["papel", "consumo", "sustentável"], classificacao: "comum", responsavel: "Bruno Lima", status: "parcial", dataAbertura: new Date("2026-02-28") },
  });
  await prisma.processo.upsert({
    where: { numero: "2026/008" },
    update: {},
    create: { numero: "2026/008", objeto: "Locação de impressoras multifuncionais", unidade: "serviço", quantidade: 12, caracteristicasTecnicas: "Outsourcing de impressão, franquia mensal, manutenção inclusa.", palavrasChave: ["impressora", "locação", "outsourcing"], classificacao: "especifico", responsavel: "Diego Alves", status: "nao_aderente", dataAbertura: new Date("2025-10-08") },
  });
  console.log("✓ Processos criados: 8");

  // ── Contratações Públicas ───────────────────────────────────────────────────
  await prisma.contratacaoPublica.createMany({
    data: [
      { processoId: proc001.id, numero: "PE-2025/0142", orgao: "Câmara Municipal de Santos", objeto: "Aquisição de cadeiras ergonômicas com encosto regulável e apoio lombar", modalidade: "Pregão Eletrônico", valorUnitario: 1250.0, quantidade: 40, unidade: "unidade", dataContratacao: new Date("2025-08-15"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: "aderente", palavrasChave: ["cadeira", "ergonômica", "mobiliário"] },
      { processoId: proc001.id, numero: "PE-2025/0389", orgao: "Tribunal Regional Eleitoral de SP", objeto: "Fornecimento de cadeiras giratórias ergonômicas NR-17", modalidade: "Pregão Eletrônico", valorUnitario: 1180.0, quantidade: 60, unidade: "unidade", dataContratacao: new Date("2025-06-20"), fonteUrl: "https://comprasnet.gov.br", aderencia: "aderente", palavrasChave: ["cadeira", "ergonômica", "NR-17"] },
      { processoId: proc003.id, numero: "DL-2025/0071", orgao: "Ministério da Saúde", objeto: "Aquisição de kits de material de limpeza e higienização com registro ANVISA", modalidade: "Dispensa de Licitação", valorUnitario: 87.5, quantidade: 100, unidade: "kit", dataContratacao: new Date("2025-09-03"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: "aderente", palavrasChave: ["limpeza", "higiene", "ANVISA"] },
      { processoId: proc003.id, numero: "PE-2025/0501", orgao: "Prefeitura Municipal de Guarujá", objeto: "Fornecimento de material de limpeza biodegradável para uso institucional", modalidade: "Pregão Eletrônico", valorUnitario: 95.0, quantidade: 80, unidade: "kit", dataContratacao: new Date("2025-10-11"), fonteUrl: "https://comprasnet.gov.br", aderencia: "parcial", justificativaAderencia: "Especificação de biodegradabilidade atende, mas quantidade mínima por item diverge levemente.", palavrasChave: ["limpeza", "biodegradável"] },
      { processoId: proc005.id, numero: "CC-2025/0018", orgao: "Tribunal de Contas do Estado de SP", objeto: "Aquisição de notebooks corporativos com 16GB RAM e SSD 512GB", modalidade: "Concorrência", valorUnitario: 4850.0, quantidade: 25, unidade: "unidade", dataContratacao: new Date("2025-05-28"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: "aderente", palavrasChave: ["notebook", "informática", "equipamento"] },
      { processoId: proc005.id, numero: "PE-2024/0677", orgao: "Câmara dos Deputados", objeto: "Fornecimento de notebooks com processador Intel i5 e 8GB RAM", modalidade: "Pregão Eletrônico", valorUnitario: 3200.0, quantidade: 50, unidade: "unidade", dataContratacao: new Date("2024-11-14"), fonteUrl: "https://comprasnet.gov.br", aderencia: "parcial", justificativaAderencia: "Especificação de RAM (8GB) inferior à demanda (16GB); valor referencial pode estar desatualizado.", palavrasChave: ["notebook", "informática"] },
      { processoId: proc007.id, numero: "PE-2025/0233", orgao: "Universidade Federal de São Paulo", objeto: "Aquisição de papel A4 75g/m² com certificação FSC", modalidade: "Pregão Eletrônico", valorUnitario: 28.9, quantidade: 400, unidade: "resma", dataContratacao: new Date("2025-07-19"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: "aderente", palavrasChave: ["papel", "consumo", "FSC"] },
    ],
    skipDuplicates: true,
  });
  console.log("✓ Contratações públicas criadas");

  // ── Cotações ────────────────────────────────────────────────────────────────
  const cot001 = await prisma.cotacao.create({ data: { processoId: proc001.id, fornecedorId: forn001.id, dataEnvio: new Date("2026-05-20"), dataLimite: new Date("2026-06-03"), status: "positiva", lembreteEnviado: false, valorProposto: 1250.0, observacao: "Proposta recebida dentro do prazo." } });
  await prisma.cotacao.create({ data: { processoId: proc001.id, fornecedorId: forn002.id, dataEnvio: new Date("2026-05-20"), dataLimite: new Date("2026-06-03"), status: "silenciosa", lembreteEnviado: true, observacao: "Lembrete enviado em 31/05. Sem resposta." } });
  const cot003 = await prisma.cotacao.create({ data: { processoId: proc001.id, fornecedorId: forn004.id, dataEnvio: new Date("2026-05-20"), dataLimite: new Date("2026-06-03"), status: "incompleta", lembreteEnviado: true, valorProposto: 980.0, observacao: "Proposta sem CNPJ do responsável." } });
  const cot004 = await prisma.cotacao.create({ data: { processoId: proc005.id, fornecedorId: forn003.id, dataEnvio: new Date("2026-06-01"), dataLimite: new Date("2026-06-20"), status: "positiva", lembreteEnviado: false, valorProposto: 4750.0 } });
  await prisma.cotacao.create({ data: { processoId: proc005.id, fornecedorId: forn007.id, dataEnvio: new Date("2026-06-01"), dataLimite: new Date("2026-06-20"), status: "negativa", lembreteEnviado: false, observacao: "Fornecedor informou que não trabalha com esse segmento." } });
  await prisma.cotacao.create({ data: { processoId: proc005.id, fornecedorId: forn008.id, dataEnvio: new Date("2026-06-01"), dataLimite: new Date("2026-06-20"), status: "silenciosa", lembreteEnviado: false } });
  const cot007 = await prisma.cotacao.create({ data: { processoId: proc003.id, fornecedorId: forn002.id, dataEnvio: new Date("2026-04-10"), dataLimite: new Date("2026-04-24"), status: "positiva", lembreteEnviado: false, valorProposto: 87.5 } });
  await prisma.cotacao.create({ data: { processoId: proc003.id, fornecedorId: forn008.id, dataEnvio: new Date("2026-04-10"), dataLimite: new Date("2026-04-24"), status: "positiva", lembreteEnviado: false, valorProposto: 91.0 } });
  console.log("✓ Cotações criadas: 8");

  // ── Propostas ───────────────────────────────────────────────────────────────
  await prisma.proposta.createMany({
    data: [
      { cotacaoId: cot001.id, cnpjValido: "valido", descricaoValida: "valido", valorUnitarioValido: "valido", valorTotalValido: "valido", dataValida: "valido", responsavelValido: "valido", statusGeral: "valida", valorUnitario: 1250.0, valorTotal: 50000.0, dataProposta: new Date("2026-05-28"), responsavel: "Roberto Ferreira" },
      { cotacaoId: cot003.id, cnpjValido: "invalido", descricaoValida: "valido", valorUnitarioValido: "valido", valorTotalValido: "valido", dataValida: "valido", responsavelValido: "ressalva", statusGeral: "invalida", valorUnitario: 980.0, valorTotal: 39200.0, dataProposta: new Date("2026-05-30"), responsavel: "Desconhecido", observacoes: "CNPJ do fornecedor não confere com a razão social apresentada na proposta." },
      { cotacaoId: cot004.id, cnpjValido: "valido", descricaoValida: "valido", valorUnitarioValido: "valido", valorTotalValido: "valido", dataValida: "valido", responsavelValido: "valido", statusGeral: "valida", valorUnitario: 4750.0, valorTotal: 142500.0, dataProposta: new Date("2026-06-08"), responsavel: "Felipe Andrade" },
      { cotacaoId: cot007.id, cnpjValido: "valido", descricaoValida: "ressalva", valorUnitarioValido: "valido", valorTotalValido: "valido", dataValida: "valido", responsavelValido: "valido", statusGeral: "com_ressalva", valorUnitario: 87.5, valorTotal: 10500.0, dataProposta: new Date("2026-04-18"), responsavel: "Marta Oliveira", observacoes: "Descrição do produto ligeiramente diferente do especificado no edital." },
    ],
  });
  console.log("✓ Propostas criadas: 4");

  // ── Itens e Séries de Preços ─────────────────────────────────────────────────
  const item001 = await prisma.item.create({ data: { processoId: proc001.id, descricao: "Cadeira ergonômica com encosto regulável e apoio lombar", unidade: "unidade", quantidade: 40, classificacao: "comum", caracteristicasTecnicas: "Encosto regulável, apoio lombar, certificação NR-17.", palavrasChave: ["cadeira", "ergonômica", "mobiliário"] } });
  const item003 = await prisma.item.create({ data: { processoId: proc003.id, descricao: "Kit de material de limpeza e higienização biodegradável", unidade: "kit", quantidade: 120, classificacao: "comum", caracteristicasTecnicas: "Kits com produtos biodegradáveis, registro ANVISA.", palavrasChave: ["limpeza", "higiene", "consumo"] } });
  const item005 = await prisma.item.create({ data: { processoId: proc005.id, descricao: "Notebook corporativo 16GB RAM SSD 512GB", unidade: "unidade", quantidade: 30, classificacao: "comum", caracteristicasTecnicas: "16GB RAM, SSD 512GB, garantia on-site 36 meses.", palavrasChave: ["notebook", "informática", "equipamento"] } });

  const serie001 = await prisma.seriePreco.create({ data: { itemId: item001.id, metodo: "media", valorEstimado: 1250.0, media: 1250.0, mediana: 1250.0, menorValor: 1180.0, coeficienteVariacao: 5.6, totalPrecos: 5, precosIncluidos: 3 } });
  await prisma.precoConsolidado.createMany({ data: [
    { seriePrecoId: serie001.id, fonte: "contratacao_publica", descricaoFonte: "Pregão 045/2025 — TRE-SP", fornecedorOuOrgao: "TRE-SP", dataReferencia: new Date("2025-11-10"), valorUnitario: 1180.0, status: "incluido" },
    { seriePrecoId: serie001.id, fonte: "contratacao_publica", descricaoFonte: "Pregão 012/2025 — ALESP", fornecedorOuOrgao: "ALESP", dataReferencia: new Date("2025-08-22"), valorUnitario: 1320.0, status: "incluido" },
    { seriePrecoId: serie001.id, fonte: "site_eletronico", descricaoFonte: "Consulta site da fabricante — Marelli", fornecedorOuOrgao: "Marelli S.A.", dataReferencia: new Date("2026-05-15"), valorUnitario: 1450.0, status: "excluido", motivoExclusao: "Valor discrepante (>20% acima da média): possível precificação desatualizada." },
    { seriePrecoId: serie001.id, fonte: "fornecedor_direto", descricaoFonte: "Proposta Móveis Corporativos Santista", fornecedorOuOrgao: "Santos Office", dataReferencia: new Date("2026-05-28"), valorUnitario: 1250.0, status: "incluido" },
    { seriePrecoId: serie001.id, fonte: "fornecedor_direto", descricaoFonte: "Proposta Papelaria União (inválida)", fornecedorOuOrgao: "Papelaria União", dataReferencia: new Date("2026-05-30"), valorUnitario: 980.0, status: "excluido", motivoExclusao: "Proposta inválida: CNPJ não confere." },
  ]});

  const serie005 = await prisma.seriePreco.create({ data: { itemId: item005.id, metodo: "mediana", valorEstimado: 4750.0, media: 4723.33, mediana: 4750.0, menorValor: 4600.0, coeficienteVariacao: 2.4, totalPrecos: 3, precosIncluidos: 3 } });
  await prisma.precoConsolidado.createMany({ data: [
    { seriePrecoId: serie005.id, fonte: "contratacao_publica", descricaoFonte: "Pregão 089/2025 — TCE-SP", fornecedorOuOrgao: "TCE-SP", dataReferencia: new Date("2025-12-10"), valorUnitario: 4600.0, status: "incluido" },
    { seriePrecoId: serie005.id, fonte: "contratacao_publica", descricaoFonte: "Pregão 033/2026 — Prefeitura de Guarulhos", fornecedorOuOrgao: "Prefeitura de Guarulhos", dataReferencia: new Date("2026-03-18"), valorUnitario: 4820.0, status: "incluido" },
    { seriePrecoId: serie005.id, fonte: "fornecedor_direto", descricaoFonte: "Proposta TechSupply Informática", fornecedorOuOrgao: "TechSupply", dataReferencia: new Date("2026-06-08"), valorUnitario: 4750.0, status: "incluido" },
  ]});

  const serie003 = await prisma.seriePreco.create({ data: { itemId: item003.id, metodo: "media", valorEstimado: 90.17, media: 90.17, mediana: 91.0, menorValor: 87.5, coeficienteVariacao: 2.6, totalPrecos: 3, precosIncluidos: 3 } });
  await prisma.precoConsolidado.createMany({ data: [
    { seriePrecoId: serie003.id, fonte: "contratacao_publica", descricaoFonte: "Pregão 062/2025 — SABESP", fornecedorOuOrgao: "SABESP", dataReferencia: new Date("2025-11-07"), valorUnitario: 92.0, status: "incluido" },
    { seriePrecoId: serie003.id, fonte: "fornecedor_direto", descricaoFonte: "Proposta HigiePro", fornecedorOuOrgao: "HigiePro", dataReferencia: new Date("2026-04-18"), valorUnitario: 87.5, status: "incluido" },
    { seriePrecoId: serie003.id, fonte: "fornecedor_direto", descricaoFonte: "Proposta EcoSupri", fornecedorOuOrgao: "EcoSupri", dataReferencia: new Date("2026-04-20"), valorUnitario: 91.0, status: "incluido" },
  ]});

  console.log("✓ Séries de preços e preços criados");

  // suppress unused variable warnings for proc002, proc007
  void proc002;
  void proc007;

  console.log("✅ Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
