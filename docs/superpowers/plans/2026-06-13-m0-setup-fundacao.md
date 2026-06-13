# M0 — Setup & Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js (App Router) + TypeScript project skeleton with the toolchain, quality gates, folder structure, and a green test, running locally — no product features yet.

**Architecture:** Next.js App Router app in `src/`, using pnpm. Tailwind + shadcn/ui for UI, ESLint + Prettier for quality, Vitest + Testing Library for tests. Folder layout follows CLAUDE.md §4. This milestone produces an empty-but-correct foundation that all later milestones build on.

**Tech Stack:** Next.js (App Router), React, TypeScript (strict), pnpm, Tailwind CSS, shadcn/ui, ESLint, Prettier, Vitest, @testing-library/react.

**References:** [../../../CLAUDE.md](../../../CLAUDE.md) (§2 stack, §3 conventions, §4 folders) · [../../PLAN.md](../../PLAN.md) (M0).

> **Environment note:** Primary shell is PowerShell on Windows. Commands below use cross-platform syntax where possible. The branch for this milestone is `chore/setup` — create it before Task 1 if the repo is initialized (`git init` first if not).

---

### Task 1: Scaffold Next.js project with pnpm

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`, `postcss.config.mjs`

- [ ] **Step 1: Run create-next-app**

Run from the project root (the directory already exists with the `.md` docs — answer prompts as below):

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

If it refuses because the directory is non-empty, scaffold in a temp dir and move files in:

```bash
pnpm dlx create-next-app@latest .tmp-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

Then move everything except the existing `.md`/`docs` into the root, and delete `.tmp-scaffold`.

- [ ] **Step 2: Verify TypeScript strict mode**

Open `tsconfig.json` and confirm `"strict": true` is present under `compilerOptions`. create-next-app sets this by default; if missing, add it.

- [ ] **Step 3: Verify dev server boots**

Run: `pnpm dev`
Expected: server starts on `http://localhost:3000`, default Next.js page renders. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js com TypeScript, Tailwind e pnpm"
```

---

### Task 2: Configure Prettier alongside ESLint

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Install Prettier and the ESLint config**

```bash
pnpm add -D prettier eslint-config-prettier
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
.next
node_modules
pnpm-lock.yaml
*.md
```

- [ ] **Step 4: Wire `eslint-config-prettier` into the ESLint flat config**

In `eslint.config.mjs`, append `"prettier"` (via `...compat.extends("prettier")` if using FlatCompat, or add the prettier config object) as the LAST entry so it disables formatting rules that conflict with Prettier.

- [ ] **Step 5: Add scripts to `package.json`**

In the `"scripts"` block, add:

```json
"format": "prettier --write .",
"format:check": "prettier --check .",
"typecheck": "tsc --noEmit"
```

(Keep the existing `dev`, `build`, `start`, `lint`.)

- [ ] **Step 6: Run the gates**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: format rewrites files, lint passes (no errors), typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: configura Prettier e scripts de qualidade"
```

---

### Task 3: Set up Vitest + Testing Library with a passing smoke test

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/lib/__tests__/smoke.test.ts`
- Modify: `package.json` (test script + devDependencies)

- [ ] **Step 1: Install test dependencies**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/dom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add the test script to `package.json`**

In `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the smoke test**

Create `src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("toolchain smoke test", () => {
  it("runs and asserts correctly", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 1 passed (1 test).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: configura Vitest e Testing Library com teste de fumaça"
```

---

### Task 4: Create the folder structure from CLAUDE.md §4

**Files:**
- Create: directories under `src/` with `.gitkeep` placeholders (git does not track empty dirs)

- [ ] **Step 1: Create the directories and placeholders**

Run (PowerShell):

```powershell
$dirs = @(
  "src/app/(auth)",
  "src/app/(app)/dashboard",
  "src/app/(app)/processos",
  "src/app/(app)/contratacoes",
  "src/app/(app)/sites",
  "src/app/(app)/fornecedores",
  "src/app/(app)/cotacoes",
  "src/app/(app)/relatorios",
  "src/app/api",
  "src/components/ui",
  "src/lib/domain",
  "src/lib/auth",
  "src/lib/email",
  "src/lib/storage",
  "src/lib/validations",
  "src/hooks",
  "src/types"
)
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  if (-not (Test-Path "$d/.gitkeep")) { New-Item -ItemType File -Path "$d/.gitkeep" | Out-Null }
}
```

- [ ] **Step 2: Verify the tree**

Run: `pnpm typecheck`
Expected: exits 0 (empty dirs don't break the build).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: cria estrutura de pastas do projeto (CLAUDE.md §4)"
```

---

### Task 5: Initialize shadcn/ui

**Files:**
- Create/Modify: `components.json`, `src/lib/utils.ts`, `src/app/globals.css` (tokens), `tailwind`-related config as shadcn requires

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init
```

Choose: base color **Neutral** (matches CLAUDE.md §5 neutral palette), CSS variables **yes**. Accept the default paths (it should detect `src/` and the `@/*` alias).

- [ ] **Step 2: Add one component to prove the pipeline works**

```bash
pnpm dlx shadcn@latest add button
```

Expected: creates `src/components/ui/button.tsx`.

- [ ] **Step 3: Render the button on the home page**

Replace `src/app/page.tsx` with:

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Pesquisa de Preços — CMS</h1>
      <Button>Componente shadcn/ui funcionando</Button>
    </main>
  );
}
```

- [ ] **Step 4: Verify it builds and renders**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: inicializa shadcn/ui e valida com componente Button"
```

---

### Task 6: Add environment template and README

**Files:**
- Create: `.env.example`, `README.md`
- Modify: `.gitignore` (ensure `.env*` ignored except `.env.example`)

- [ ] **Step 1: Create `.env.example`**

```
# Banco de dados (M5)
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/divisao_compras?schema=public"

# Autenticação (M6)
AUTH_SECRET="troque-por-um-segredo-aleatorio"

# E-mail / Resend (M8)
RESEND_API_KEY=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- [ ] **Step 2: Ensure `.gitignore` ignores real env files but keeps the example**

Confirm `.gitignore` contains these lines (create-next-app adds `.env*`); add the negation:

```
.env*
!.env.example
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Plataforma de Pesquisa de Preços — Divisão de Compras (CMS)

Plataforma web interna para orquestração da pesquisa de preços, em conformidade com a IN 65/2021.
Briefing técnico: [CLAUDE.md](CLAUDE.md) · Roadmap: [docs/PLAN.md](docs/PLAN.md).

## Como rodar

Pré-requisitos: Node.js 20+, pnpm.

```bash
pnpm install
cp .env.example .env   # preencha as variáveis conforme necessário
pnpm dev               # http://localhost:3000
```

## Scripts

| Script | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Checagem de tipos (tsc) |
| `pnpm format` | Formata com Prettier |
| `pnpm test` | Testes (Vitest) |
```

- [ ] **Step 4: Final verification — run all gates**

Run: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; build succeeds.

- [ ] **Step 5: Commit (milestone final commit)**

```bash
git add -A
git commit -m "chore: adiciona .env.example e README de operação"
```

---

## Milestone close-out

- [ ] Open a PR from `chore/setup` to `main`.
- [ ] Confirm M0 acceptance criteria from PLAN.md: `pnpm dev` boots, and `pnpm lint` / `pnpm typecheck` / `pnpm test` pass clean.
- [ ] Tick M0's boxes in [../../PLAN.md](../../PLAN.md).
