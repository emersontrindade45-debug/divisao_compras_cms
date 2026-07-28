# Pesquisa de Preços — Divisão de Compras / CMS

Plataforma interna de orquestração da pesquisa de preços da Câmara Municipal de Santos, em conformidade com a IN SEGES/ME 65/2021.

Briefing técnico: [CLAUDE.md](CLAUDE.md) · Roadmap: [docs/PLAN.md](docs/PLAN.md).

## Pré-requisitos

- Node.js 20+ e pnpm 9+
- PostgreSQL 15+ (local via Docker ou instância gerenciada)

> **O sistema não envia e-mail.** O disparo de cotação é feito pela Câmara, fora da plataforma —
> aqui só se registra status e SLA. Não configure provedor de envio; a dependência do Resend foi
> removida no M11 e a regra está no [CLAUDE.md §9.3](CLAUDE.md).

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

<details>
<summary><strong>Alternativa sem Docker: Postgres nativo no WSL</strong></summary>

Quando o Docker Desktop não estiver disponível no WSL, dá para rodar o Postgres
direto na distribuição, com a mesma configuração do `docker-compose.yml` — assim
o `DATABASE_URL` do `.env` continua valendo sem alteração:

```bash
sudo apt-get install -y postgresql
sudo service postgresql start            # WSL não tem systemd: repetir a cada reinício
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres createdb divisao_compras
```

O WSL2 encaminha `localhost` do Windows para a distribuição, então a aplicação
rodando no Windows (`pnpm dev`) alcança este banco normalmente — verificado com o
seed em 2026-07-27.

Note que `prisma db seed` invoca `tsx` pelo nome e falha com `ENOENT` se o
`node_modules/.bin` não estiver no PATH. Rodar `pnpm exec tsx prisma/seed.ts`
contorna isso.

**Ter um banco local não é conforto, é requisito de conformidade.** Sem ele, toda
migration estreia em produção — foi a causa raiz das lições §9.19, §9.31 e §9.43
do CLAUDE.md.
</details>

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
3. Chaves de API: `OPENAI_API_KEY` (extração do TR e ranking de similaridade) e, opcionalmente,
   `PERPLEXITY_API_KEY` (busca web do assistente)

### Passo a passo

```bash
# 1. Login na Vercel
vercel login

# 2. Vincular projeto (primeira vez)
vercel link

# 3. Configurar variáveis de ambiente de produção
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel env add OPENAI_API_KEY production
vercel env add CRON_SECRET production

# 4. Aplicar migrations no banco de produção
DATABASE_URL="<url-producao>" pnpm exec prisma migrate deploy

# 5. Deploy de produção
vercel --prod
```

### Variáveis obrigatórias na Vercel

Veja `.env.example` para a lista completa. As mínimas obrigatórias são:

- `DATABASE_URL` — pooler de transação (porta 6543 no Supabase); ver CLAUDE.md §9.32
- `DIRECT_URL` — conexão direta, usada só pelo CLI de migrations
- `AUTH_SECRET`
- `OPENAI_API_KEY`
- `CRON_SECRET` — sem ela a rota de lembretes fica pública (§9.45)

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
- **Cotações** — registro de envio, controle de SLA e checklist de propostas (o e-mail é
  disparado pela Câmara, fora do sistema)
- **Relatórios** — memória de cálculo em PDF e série de preços em Excel

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Server Actions + Route Handlers |
| Banco | PostgreSQL + Prisma ORM |
| Testes unitários | Vitest + Testing Library |
| Testes E2E | Playwright + axe-core |
| Deploy | Vercel (compatível com Node.js autônomo) |

Ver [CLAUDE.md](CLAUDE.md) para convenções de código detalhadas.
