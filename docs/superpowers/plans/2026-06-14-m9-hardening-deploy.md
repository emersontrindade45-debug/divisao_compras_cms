# M9 — Hardening & Deploy — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilizar a plataforma de pesquisa de preços com testes E2E, acessibilidade, erros padronizados, variáveis de produção e deploy na Vercel.

**Architecture:** Playwright para E2E cobrindo o fluxo crítico (login → processo → cotação → relatório); patches de acessibilidade (aria-labels, foco) e estados de loading/error por página; `.env.production` documentado + deploy via CLI Vercel com migrations aplicadas no banco de produção.

**Tech Stack:** Playwright, @axe-core/playwright (a11y audit), Next.js App Router, Vercel CLI, Prisma, pnpm.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `e2e/auth.setup.ts` | Criar | Autenticação global de sessão para Playwright |
| `e2e/fluxo-principal.spec.ts` | Criar | E2E: login → processo → cotação → relatório |
| `e2e/a11y.spec.ts` | Criar | Auditoria de acessibilidade nas páginas principais |
| `playwright.config.ts` | Criar | Configuração Playwright: baseURL, browsers, storage state |
| `src/app/(app)/processos/loading.tsx` | Criar | Skeleton loader da lista de processos |
| `src/app/(app)/processos/[id]/loading.tsx` | Criar | Skeleton loader do detalhe do processo |
| `src/app/(app)/dashboard/loading.tsx` | Criar | Skeleton loader do dashboard |
| `src/app/(app)/cotacoes/loading.tsx` | Criar | Skeleton loader de cotações |
| `src/app/(app)/relatorios/loading.tsx` | Criar | Skeleton loader de relatórios |
| `src/app/(app)/contratacoes/loading.tsx` | Criar | Skeleton loader de contratações |
| `src/app/(app)/fornecedores/loading.tsx` | Criar | Skeleton loader de fornecedores |
| `src/app/(app)/sites/loading.tsx` | Criar | Skeleton loader de sites |
| `src/app/error.tsx` | Criar | Boundary global de erro Next.js |
| `src/app/(app)/processos/error.tsx` | Criar | Boundary de erro segmento processos |
| `src/components/common/PageSkeleton.tsx` | Criar | Skeleton reutilizável (cabeçalho + tabela) |
| `src/components/common/SegmentError.tsx` | Criar | Componente de erro reutilizável de segmento |
| `README.md` | Modificar | Adicionar seções de operação e deploy |
| `.env.example` | Verificar/atualizar | Documentar todas as variáveis necessárias em prod |

---

## Task 1: Branch e instalação do Playwright

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`

- [ ] **Step 1: Criar branch chore/deploy**

```bash
git checkout main
git checkout -b chore/deploy
```

Expected: branch `chore/deploy` criada.

- [ ] **Step 2: Instalar Playwright e @axe-core/playwright**

```bash
pnpm add -D @playwright/test @axe-core/playwright
```

- [ ] **Step 3: Instalar browsers do Playwright**

```bash
pnpm exec playwright install chromium
```

Expected: Chromium instalado em ~/.cache/ms-playwright.

- [ ] **Step 4: Criar playwright.config.ts**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

- [ ] **Step 5: Adicionar script de E2E e pasta ao .gitignore**

Em `package.json`, adicionar no bloco `"scripts"`:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

Em `.gitignore`, acrescentar:
```
# Playwright
/e2e/.auth/
/playwright-report/
/test-results/
```

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts package.json .gitignore
git commit -m "chore: instala Playwright e configura projeto de testes E2E"
```

---

## Task 2: Setup de autenticação para E2E

**Files:**
- Create: `e2e/.auth/.gitkeep`
- Create: `e2e/auth.setup.ts`

**Contexto:** O sistema usa sessão própria em cookie. O setup faz login via UI uma vez e salva o storage state para os demais testes.

- [ ] **Step 1: Criar pasta e2e/.auth**

```bash
mkdir -p e2e/.auth
touch e2e/.auth/.gitkeep
```

- [ ] **Step 2: Criar e2e/auth.setup.ts**

```ts
// e2e/auth.setup.ts
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("autenticar usuário de teste", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_EMAIL ?? "admin@cms.gov.br");
  await page.getByLabel("Senha").fill(process.env.E2E_PASSWORD ?? "teste123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 3: Adicionar variáveis ao .env.example**

No `.env.example`, garantir que existam:
```
# Testes E2E (usuário seed com papel aprovação)
E2E_EMAIL=admin@cms.gov.br
E2E_PASSWORD=teste123
```

- [ ] **Step 4: Verificar se o seed cria esse usuário**

Ler `prisma/seed.ts` e confirmar que existe usuário `admin@cms.gov.br` com senha `teste123` e papel `aprovacao`. Se não existir, adicionar ao seed:

```ts
// Em prisma/seed.ts — adicionar se não existir
await db.user.upsert({
  where: { email: "admin@cms.gov.br" },
  update: {},
  create: {
    email: "admin@cms.gov.br",
    name: "Admin Teste",
    passwordHash: await bcrypt.hash("teste123", 10),
    role: "aprovacao",
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add e2e/ .env.example prisma/seed.ts
git commit -m "chore: setup de autenticação para testes E2E"
```

---

## Task 3: Testes E2E do fluxo principal

**Files:**
- Create: `e2e/fluxo-principal.spec.ts`

**Fluxo coberto:** Login (já feito pelo setup) → Dashboard carrega → Processos lista → Detalhe de processo abre → Cotações carregam → Relatórios carregam → Logout.

- [ ] **Step 1: Criar e2e/fluxo-principal.spec.ts**

```ts
// e2e/fluxo-principal.spec.ts
import { test, expect } from "@playwright/test";

test.describe("fluxo principal", () => {
  test("dashboard carrega métricas", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/processos em andamento/i)).toBeVisible();
  });

  test("lista de processos renderiza", async ({ page }) => {
    await page.goto("/processos");
    await expect(page.getByRole("heading", { name: /processos/i })).toBeVisible();
    // Tabela ou estado vazio deve estar presente
    const tabela = page.getByRole("table");
    const vazioMsg = page.getByText(/nenhum processo/i);
    await expect(tabela.or(vazioMsg)).toBeVisible();
  });

  test("detalhe de processo com id inválido exibe erro", async ({ page }) => {
    await page.goto("/processos/id-invalido-000");
    await expect(page.getByText(/não encontrado/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /voltar/i })).toBeVisible();
  });

  test("página de cotações renderiza abas", async ({ page }) => {
    await page.goto("/cotacoes");
    await expect(page.getByRole("heading", { name: /cotações/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /painel de controle/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /nova cotação/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /validação de propostas/i })).toBeVisible();
  });

  test("página de relatórios renderiza abas", async ({ page }) => {
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: /relatórios/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /visão geral/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /memória de cálculo/i })).toBeVisible();
  });

  test("sidebar navega entre módulos", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /fornecedores/i }).click();
    await expect(page).toHaveURL(/fornecedores/);
    await expect(page.getByRole("heading", { name: /fornecedores/i })).toBeVisible();
  });

  test("acesso sem login redireciona para login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Executar E2E (com DB seed rodado e dev server separado)**

```bash
pnpm test:e2e
```

Expected: todos os testes passam ou falham por ausência de dados de seed (não por erro de código).

Se falhar por falta de seed: `pnpm db:seed` e rodar novamente.

- [ ] **Step 3: Commit**

```bash
git add e2e/fluxo-principal.spec.ts
git commit -m "test: testes E2E do fluxo principal com Playwright"
```

---

## Task 4: Testes de acessibilidade E2E

**Files:**
- Create: `e2e/a11y.spec.ts`

- [ ] **Step 1: Criar e2e/a11y.spec.ts**

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "processos", path: "/processos" },
  { name: "cotacoes", path: "/cotacoes" },
  { name: "fornecedores", path: "/fornecedores" },
  { name: "relatorios", path: "/relatorios" },
];

for (const { name, path } of PAGES) {
  test(`acessibilidade — ${name}`, async ({ page }) => {
    await page.goto(path);
    // Aguarda conteúdo principal carregar
    await page.waitForSelector("main");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".recharts-wrapper") // gráficos externos excluídos
      .analyze();
    expect(
      results.violations,
      `Violações de acessibilidade em ${name}:\n${JSON.stringify(results.violations, null, 2)}`
    ).toHaveLength(0);
  });
}
```

- [ ] **Step 2: Executar testes de acessibilidade**

```bash
pnpm test:e2e -- --grep a11y
```

Expected: 0 violações WCAG 2.1 AA nas páginas principais. Se houver violações, serão listadas com seletor e descrição — corrigir antes do próximo passo.

- [ ] **Step 3: Commit**

```bash
git add e2e/a11y.spec.ts
git commit -m "test: auditoria de acessibilidade WCAG 2.1 AA com axe-core"
```

---

## Task 5: Skeleton loaders — loading.tsx por segmento

**Files:**
- Create: `src/components/common/PageSkeleton.tsx`
- Create: `src/app/(app)/processos/loading.tsx`
- Create: `src/app/(app)/processos/[id]/loading.tsx`
- Create: `src/app/(app)/dashboard/loading.tsx`
- Create: `src/app/(app)/cotacoes/loading.tsx`
- Create: `src/app/(app)/relatorios/loading.tsx`
- Create: `src/app/(app)/contratacoes/loading.tsx`
- Create: `src/app/(app)/fornecedores/loading.tsx`
- Create: `src/app/(app)/sites/loading.tsx`

- [ ] **Step 1: Criar PageSkeleton reutilizável**

```tsx
// src/components/common/PageSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  rows?: number;
  showHeader?: boolean;
}

export function PageSkeleton({ rows = 5, showHeader = true }: PageSkeletonProps) {
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      )}
      <div className="rounded-md border">
        <div className="border-b px-4 py-3">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar loading.tsx para cada segmento de app**

Criar os arquivos abaixo todos com este conteúdo padrão (substituindo o path comentado):

`src/app/(app)/processos/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton />; }
```

`src/app/(app)/processos/[id]/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton rows={3} />; }
```

`src/app/(app)/dashboard/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
```

`src/app/(app)/cotacoes/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton />; }
```

`src/app/(app)/relatorios/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton rows={3} />; }
```

`src/app/(app)/contratacoes/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton />; }
```

`src/app/(app)/fornecedores/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton />; }
```

`src/app/(app)/sites/loading.tsx`:
```tsx
import { PageSkeleton } from "@/components/common/PageSkeleton";
export default function Loading() { return <PageSkeleton />; }
```

- [ ] **Step 3: Verificar que pnpm typecheck passa**

```bash
pnpm typecheck
```

Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/PageSkeleton.tsx src/app/
git commit -m "feat: skeleton loaders padronizados em todos os segmentos de app"
```

---

## Task 6: Error boundaries padronizados

**Files:**
- Create: `src/components/common/SegmentError.tsx`
- Create: `src/app/error.tsx`
- Create: `src/app/(app)/processos/error.tsx`

- [ ] **Step 1: Criar SegmentError reutilizável**

```tsx
// src/components/common/SegmentError.tsx
"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SegmentErrorProps {
  reset: () => void;
  title?: string;
}

export function SegmentError({ reset, title = "Erro ao carregar esta seção" }: SegmentErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente ou contate o suporte.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Criar boundary global src/app/error.tsx**

```tsx
// src/app/error.tsx
"use client";

import { SegmentError } from "@/components/common/SegmentError";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center p-6">
        <SegmentError reset={reset} title="Erro inesperado na aplicação" />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Criar boundary de segmento processos**

```tsx
// src/app/(app)/processos/error.tsx
"use client";

import { SegmentError } from "@/components/common/SegmentError";

export default function ProcessosError({ reset }: { reset: () => void }) {
  return <SegmentError reset={reset} title="Erro ao carregar processos" />;
}
```

- [ ] **Step 4: Verificar typecheck e lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SegmentError.tsx src/app/error.tsx src/app/\(app\)/processos/error.tsx
git commit -m "feat: error boundaries padronizados (global e segmentos)"
```

---

## Task 7: Revisão de acessibilidade manual

Esta task cobre correções pontuais identificadas nos testes de acessibilidade (Task 4).

**Files:** Qualquer componente com violação axe-core.

- [ ] **Step 1: Rodar auditoria e listar violações**

```bash
pnpm test:e2e -- --grep a11y --reporter=list
```

Anote cada violação com seletor e regra (ex.: `color-contrast`, `label`, `button-name`).

- [ ] **Step 2: Corrigir violações mais comuns**

Correções típicas a verificar e aplicar:

**a) Botões sem label acessível** — adicionar `aria-label`:
```tsx
// Antes
<Button onClick={...}><X /></Button>
// Depois
<Button onClick={...} aria-label="Fechar"><X /></Button>
```

**b) Campos de input sem label associada** — garantir que `<label htmlFor>` existe:
```tsx
<label htmlFor="busca">Busca</label>
<input id="busca" ... />
```

**c) Contraste insuficiente** — revisar `text-muted-foreground` em texto pequeno; ajustar token se necessário em `globals.css`.

**d) Elementos interativos sem foco visível** — confirmar que Tailwind `focus-visible:ring` está aplicado nos componentes shadcn. Se não, adicionar em `globals.css`:
```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

- [ ] **Step 3: Rodar auditoria novamente até 0 violações**

```bash
pnpm test:e2e -- --grep a11y
```

Expected: PASS em todas as páginas.

- [ ] **Step 4: Commit**

```bash
git add -p
git commit -m "fix: correções de acessibilidade WCAG 2.1 AA"
```

---

## Task 8: Revisão de responsividade

**Files:** Componentes de tabela e painéis com layout que pode quebrar em telas menores.

- [ ] **Step 1: Testar em viewport mobile (375px) via Playwright**

Adicionar snapshot visual rápido em `e2e/fluxo-principal.spec.ts`:
```ts
test("dashboard responsivo em mobile", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "e2e/.auth/user.json",
    viewport: { width: 375, height: 812 },
  });
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await ctx.close();
});
```

- [ ] **Step 2: Verificar DataTable com overflow**

Em `src/components/data-table/DataTable.tsx`, garantir que a tabela tem wrapper com overflow:
```tsx
// Wrapping div deve ter:
<div className="overflow-x-auto rounded-md border">
  <table ...>
```

Se já existir, confirmar e pular. Se não, adicionar o wrapper.

- [ ] **Step 3: Verificar MetricCards em grid responsivo**

No `src/app/(app)/dashboard/page.tsx`, confirmar que o grid usa:
```tsx
className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
```

Já existe conforme leitura do arquivo. Confirmar visualmente em 375px.

- [ ] **Step 4: Commit**

```bash
git add e2e/fluxo-principal.spec.ts src/components/data-table/DataTable.tsx
git commit -m "fix: responsividade em mobile — overflow de tabelas"
```

---

## Task 9: Variáveis de ambiente de produção

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Auditar variáveis usadas no código**

```bash
grep -r "process\.env\." src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u
```

- [ ] **Step 2: Garantir que .env.example tem todas as variáveis com comentários de produção**

O `.env.example` deve conter (verificar e atualizar):

```bash
# Banco de dados
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require"

# Autenticação (gerar com: openssl rand -base64 32)
AUTH_SECRET="sua-chave-secreta-aqui-min-32-chars"

# E-mail — Resend (https://resend.com)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxx"
RESEND_FROM="pesquisa@cms.santos.sp.gov.br"

# Storage — Vercel Blob (opcional, usar local se não disponível)
BLOB_READ_WRITE_TOKEN=""

# Google Sheets (opcional — integração de sincronização de objetos)
NEXT_PUBLIC_SHEETS_URL=""
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_SHEETS_PRIVATE_KEY=""

# Testes E2E (usuário seed com papel aprovacao)
E2E_EMAIL=admin@cms.gov.br
E2E_PASSWORD=teste123

# URL pública do app (necessário para links em e-mails)
NEXT_PUBLIC_APP_URL="https://seu-dominio.vercel.app"
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: documenta todas as variáveis de ambiente para produção"
```

---

## Task 10: README com instruções de operação e deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Ler README atual**

Ler o README.md existente para não perder nenhuma seção presente.

- [ ] **Step 2: Reescrever/atualizar README.md com seções completas**

O README deve conter:

```markdown
# Pesquisa de Preços — Divisão de Compras / CMS

Plataforma interna de orquestração da pesquisa de preços da Câmara Municipal de Santos, em conformidade com a IN SEGES/ME 65/2021.

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
vercel env add RESEND_FROM production
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
- `RESEND_FROM`
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

Ver [CLAUDE.md](CLAUDE.md) para convenções de código e [docs/PLAN.md](docs/PLAN.md) para histórico de milestones.

### Fluxo principal

Login → Dashboard → Processos → [Detalhe: Fontes / Evidências / Série de preços] → Cotações → Relatórios

### Módulos

- **Processos** — cadastro de objeto e orquestração da pesquisa
- **Contratações** — busca de contratos públicos similares (fonte prioritária IN 65)
- **Sites** — validador de sites admissíveis com listas branca/cinza/vermelha
- **Fornecedores** — cadastro vivo com score operacional
- **Cotações** — disparo de e-mails, SLA e checklist de propostas
- **Relatórios** — memória de cálculo em PDF e série de preços em Excel
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com instruções de operação e deploy"
```

---

## Task 11: Build de produção local e checklist final

**Files:** nenhum (verificação)

- [ ] **Step 1: Executar build de produção**

```bash
pnpm build
```

Expected: build finaliza sem erros. Warnings de `Dynamic server usage` são aceitáveis.

- [ ] **Step 2: Executar suite completa de testes**

```bash
pnpm test
```

Expected: todos os testes unitários passam.

- [ ] **Step 3: Executar testes E2E completos**

```bash
pnpm test:e2e
```

Expected: todos os testes E2E passam.

- [ ] **Step 4: Verificar typecheck e lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 erros.

- [ ] **Step 5: Commit final de hardening**

```bash
git add .
git commit -m "chore: hardening, testes E2E e deploy de produção"
```

---

## Task 12: Deploy na Vercel

**Files:** nenhum (operação)

**Pré-requisito:** Vercel CLI instalado (`npm i -g vercel`) e banco de produção configurado.

- [ ] **Step 1: Login e vinculação do projeto**

```bash
vercel login
vercel link
```

- [ ] **Step 2: Adicionar variáveis de ambiente de produção**

```bash
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel env add RESEND_API_KEY production
vercel env add RESEND_FROM production
vercel env add NEXT_PUBLIC_APP_URL production
# Opcional:
vercel env add BLOB_READ_WRITE_TOKEN production
```

- [ ] **Step 3: Aplicar migrations no banco de produção**

```bash
DATABASE_URL="<url-do-banco-de-producao>" pnpm exec prisma migrate deploy
```

Expected: mensagem `All migrations have been successfully applied.`

- [ ] **Step 4: Deploy de produção**

```bash
vercel --prod
```

Expected: URL de produção exibida ao final (ex.: `https://saas-divisao-compras-cms.vercel.app`).

- [ ] **Step 5: Verificar aplicação na URL de produção**

Abrir URL, fazer login e confirmar que dashboard carrega com dados reais.

- [ ] **Step 6: Marcar M9 como concluído no PLAN.md**

Em `docs/PLAN.md`, atualizar o cabeçalho do M9:
```markdown
## M9 — Hardening & Deploy `[ENTREGA]` ✅ CONCLUÍDO
```

E marcar cada entrega `[x]`.

- [ ] **Step 7: Commit e abertura de PR**

```bash
git add docs/PLAN.md
git commit -m "docs: marca M9 como concluído no PLAN.md"
git push origin chore/deploy
gh pr create --title "M9: Hardening, testes E2E e deploy de produção" --body "Fecha o milestone 9 com testes E2E (Playwright), auditoria de acessibilidade (axe-core), skeleton loaders, error boundaries, README de operação e deploy na Vercel."
```

---

## Critério de aceite final

- [ ] `pnpm build` sem erros
- [ ] `pnpm test` — todos os testes unitários passam
- [ ] `pnpm test:e2e` — fluxo principal e a11y passam
- [ ] `pnpm typecheck` — 0 erros TypeScript
- [ ] `pnpm lint` — 0 erros ESLint
- [ ] Aplicação acessível na URL de produção (Vercel)
- [ ] README contém instruções de operação e deploy
