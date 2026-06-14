# Pesquisa de Preços — Divisão de Compras / CMS

Plataforma interna de orquestração da pesquisa de preços da Câmara Municipal de Santos, em conformidade com a IN SEGES/ME 65/2021.

Briefing técnico: [CLAUDE.md](CLAUDE.md) · Roadmap: [docs/PLAN.md](docs/PLAN.md).

## Pré-requisitos

- Node.js 20+ e pnpm 9+
- PostgreSQL 15+ (local via Docker ou instância gerenciada)
- Conta Resend para disparo de e-mails

## Desenvolvimento local

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd saas-divisao-compras-cms
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

### 3. Banco de dados

```bash
# Subir Postgres via Docker
docker compose up -d

# Aplicar migrations
pnpm db:migrate

# Popular com dados de exemplo
pnpm db:seed
```

### 4. Iniciar servidor de desenvolvimento

```bash
pnpm dev
# App disponível em http://localhost:3000
```

**Usuário padrão (seed):**

- E-mail: `admin@cms.gov.br`
- Senha: `teste123`
- Papel: `aprovacao`

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm start` | Inicia build de produção localmente |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript sem emissão |
| `pnpm format` | Prettier |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:e2e` | Testes E2E (Playwright) |
| `pnpm db:migrate` | Aplica migrations Prisma |
| `pnpm db:seed` | Popula banco com dados de exemplo |
| `pnpm db:studio` | Abre Prisma Studio |

## Deploy na Vercel

### Pré-requisitos de deploy

1. Conta na Vercel e CLI instalada: `npm i -g vercel`
2. Banco PostgreSQL de produção (ex.: Neon, Supabase, Railway)
3. API key do Resend configurada

### Passo a passo

```bash
# 1. Login na Vercel
vercel login

# 2. Vincular projeto (primeira vez)
vercel link

# 3. Configurar variáveis de ambiente de produção
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel env add RESEND_API_KEY production
vercel env add EMAIL_RESPONSAVEL production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production

# 4. Aplicar migrations no banco de produção
DATABASE_URL="<url-producao>" pnpm exec prisma migrate deploy

# 5. Deploy de produção
vercel --prod
```

### Variáveis obrigatórias na Vercel

Veja `.env.example` para a lista completa. As mínimas obrigatórias são:

- `DATABASE_URL`
- `AUTH_SECRET`
- `RESEND_API_KEY`
- `EMAIL_RESPONSAVEL`
- `NEXT_PUBLIC_APP_URL`

## Deploy em hospedagem própria (Node.js)

```bash
# Build
pnpm build

# Iniciar servidor
pnpm start
# ou com PM2:
pm2 start "pnpm start" --name pesquisa-precos
```

A aplicação roda como servidor Node.js padrão na porta `3000` (configurável via `PORT`).

## Arquitetura

### Fluxo principal

Login → Dashboard → Processos → [Detalhe: Fontes / Evidências / Série de preços] → Cotações → Relatórios

### Módulos

- **Processos** — cadastro de objeto e orquestração da pesquisa de preços
- **Contratações** — busca de contratos públicos similares (fonte prioritária IN 65/2021)
- **Sites** — validador de sites admissíveis com listas branca/cinza/vermelha
- **Fornecedores** — cadastro vivo com score operacional e histórico
- **Cotações** — disparo de e-mails via Resend, controle de SLA e checklist de propostas
- **Relatórios** — memória de cálculo em PDF e série de preços em Excel

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Server Actions + Route Handlers |
| Banco | PostgreSQL + Prisma ORM |
| E-mail | Resend |
| Testes unitários | Vitest + Testing Library |
| Testes E2E | Playwright + axe-core |
| Deploy | Vercel (compatível com Node.js autônomo) |

Ver [CLAUDE.md](CLAUDE.md) para convenções de código detalhadas.
