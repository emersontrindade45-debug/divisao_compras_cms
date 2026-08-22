import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Cliente Prisma do banco de **candidatos a fornecedor** (M27) — separado do
 * `db` principal de propósito.
 *
 * Por que dois bancos: `EmpresaCandidataFornecedor` tem 8,66M linhas / 5,2GB
 * (recorte SP+ativa do dump de Estabelecimentos da Receita), volume que não
 * cabe no plano do Supabase onde vive o banco transacional. Ela é o candidato
 * natural para separar porque é **derivada de fonte externa** (se perder,
 * reimporta), **somente-leitura na operação** (só o script de importação
 * escreve) e **sem relação com nenhum outro model** — nenhuma foreign key
 * aponta para ela ou dela sai.
 *
 * O que **não** foi separado, e não deve ser: `Fornecedor` (o cadastro vivo da
 * Câmara) tem relação com `Cotacao`, `Proposta` e `QualificacaoFornecedor`, e
 * carrega a trilha de auditoria exigida pela IN 65/2021 — fatiar isso quebraria
 * integridade referencial. O fluxo do M27 respeita a fronteira: o candidato é
 * lido daqui, mas ao ser promovido vira linha na planilha Google e só então
 * `Fornecedor` no banco principal (ver docs/PLAN.md M27 etapa 6).
 *
 * A credencial usada aqui (`DATABASE_CANDIDATOS_URL`) é de um papel Postgres
 * com **apenas `SELECT`** nessa única tabela — sem superuser, sem escrita, sem
 * acesso aos demais models. Se vazar, o dano possível é ler dado público da
 * Receita Federal.
 *
 * Conexão preguiçosa pelo mesmo motivo do `db.ts` (CLAUDE.md §9.54): criar o
 * client ao avaliar o módulo faz o `next build` quebrar em "Failed to collect
 * page data" quando a variável não existe — o build importa tudo, e importar
 * não pode ser usar.
 */
const globalForPrismaCandidatos = globalThis as unknown as {
  prismaCandidatos: PrismaClient | undefined;
};

function createPrismaCandidatosClient(): PrismaClient {
  // `DATABASE_CANDIDATOS_ADMIN_URL` só existe no ambiente de quem roda os scripts de
  // ingestão (importação do CSV da Receita, categorização por CNAE) — nunca na Vercel.
  // A aplicação publicada enxerga apenas `DATABASE_CANDIDATOS_URL`, cujo papel tem
  // somente `SELECT`: privilégio mínimo para o caminho exposto na web, escrita reservada
  // ao operador que roda o script pelo túnel SSH.
  const connectionString =
    process.env.DATABASE_CANDIDATOS_ADMIN_URL ?? process.env.DATABASE_CANDIDATOS_URL;
  if (!connectionString) {
    throw new Error("DATABASE_CANDIDATOS_URL environment variable is not set");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

function obterClienteCandidatos(): PrismaClient {
  const existente = globalForPrismaCandidatos.prismaCandidatos;
  if (existente) return existente;

  const cliente = createPrismaCandidatosClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrismaCandidatos.prismaCandidatos = cliente;
  }
  return cliente;
}

export const dbCandidatos = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade, receptor) {
    const valor = Reflect.get(obterClienteCandidatos(), propriedade, receptor);
    return typeof valor === "function" ? valor.bind(obterClienteCandidatos()) : valor;
  },
});
