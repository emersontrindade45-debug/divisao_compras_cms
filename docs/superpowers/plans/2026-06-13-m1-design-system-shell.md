# M1 — Design System & Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a identidade visual em tokens + componentes base e um shell autenticado (sidebar + topbar) navegável entre os 7 módulos com telas-placeholder mock.

**Architecture:** Três camadas — tokens de tema em `globals.css`, primitivos shadcn instalados via CLI, e componentes de domínio em `src/components/` consumidos por um route group `(app)` cujo `layout.tsx` é o AppShell. Server Components por padrão; `"use client"` isolado em ThemeToggle, UserMenu, destaque de rota ativa e DataTable. Navegação numa fonte única (`lib/navigation.ts`).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui (base-nova), `@tanstack/react-table`, `next-themes`, Vitest + Testing Library, lucide-react.

**Spec:** [../specs/2026-06-13-m1-design-system-shell-design.md](../specs/2026-06-13-m1-design-system-shell-design.md)

---

## Convenções para todas as tarefas

- Idioma: código/identificadores em inglês; UI/rótulos em pt-BR (CLAUDE.md §3).
- Commits em pt-BR, imperativo. Terminam com a linha de co-autoria padrão.
- Antes de fechar o milestone: `pnpm lint`, `pnpm typecheck`, `pnpm test` limpos.
- Gerenciador: **pnpm**. shadcn via `pnpm dlx shadcn@latest`.

---

## Task 0: Branch de trabalho

**Files:** nenhum (operação git).

- [ ] **Step 1: Criar e entrar na branch**

Run:
```bash
git checkout -b feat/design-system
```
Expected: `Switched to a new branch 'feat/design-system'`

- [ ] **Step 2: Confirmar branch**

Run: `git branch --show-current`
Expected: `feat/design-system`

---

## Task 1: Dependências e primitivos shadcn

**Files:**
- Modify: `package.json` (novas deps)
- Create: `src/components/ui/{sidebar,table,badge,card,dropdown-menu,avatar,input,separator,skeleton,sonner}.tsx` (gerados)

- [ ] **Step 1: Instalar deps de runtime**

Run:
```bash
pnpm add @tanstack/react-table next-themes
```
Expected: ambos adicionados a `dependencies` em `package.json`.

- [ ] **Step 2: Gerar primitivos shadcn**

Run:
```bash
pnpm dlx shadcn@latest add sidebar table badge card dropdown-menu avatar input separator skeleton sonner
```
Expected: arquivos criados em `src/components/ui/`. Se o CLI perguntar sobre sobrescrever, aceitar apenas novos (não sobrescrever `button.tsx`).

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck`
Expected: PASS (sem erros). Se o `sidebar` trouxer dependência de hook (`use-mobile`), o CLI já a gera; confirmar que existe.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui
git commit -m "chore: adiciona tanstack-table, next-themes e primitivos shadcn do M1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Tokens de tema (primária azul + status semânticos)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Substituir a primária neutra pelo azul institucional**

Em `src/app/globals.css`, no bloco `:root`, trocar:
```css
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
```
por:
```css
  --primary: oklch(0.52 0.13 250);
  --primary-foreground: oklch(0.985 0 0);
```
E trocar `--ring: oklch(0.708 0 0);` por `--ring: oklch(0.52 0.13 250);`.

- [ ] **Step 2: Adicionar tokens de status no `:root`**

Ainda no bloco `:root`, logo após a linha `--destructive: ...`, adicionar:
```css
  --success: oklch(0.55 0.13 150);
  --success-foreground: oklch(0.985 0 0);
  --warning: oklch(0.70 0.15 75);
  --warning-foreground: oklch(0.205 0 0);
  --danger: oklch(0.55 0.20 27);
  --danger-foreground: oklch(0.985 0 0);
```

- [ ] **Step 3: Ajustar o bloco `.dark`**

No bloco `.dark`, trocar:
```css
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
```
por:
```css
  --primary: oklch(0.62 0.14 250);
  --primary-foreground: oklch(0.985 0 0);
```
Trocar `--sidebar-primary: oklch(0.488 0.243 264.376);` (roxo do boilerplate) por `--sidebar-primary: oklch(0.62 0.14 250);`.
E adicionar, após `--destructive: ...` do `.dark`:
```css
  --success: oklch(0.62 0.13 150);
  --success-foreground: oklch(0.985 0 0);
  --warning: oklch(0.75 0.15 75);
  --warning-foreground: oklch(0.205 0 0);
  --danger: oklch(0.62 0.19 27);
  --danger-foreground: oklch(0.985 0 0);
```

- [ ] **Step 4: Registrar os tokens em `@theme inline`**

No bloco `@theme inline`, após `--color-destructive: var(--destructive);`, adicionar:
```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
```

- [ ] **Step 5: Verificar build do CSS**

Run: `pnpm build`
Expected: build conclui sem erro de CSS desconhecido. (Alternativa rápida: `pnpm dev` e abrir a home — o Button deve aparecer azul.)

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: tokens de tema com primaria azul institucional e status semanticos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Mapa de status de domínio (TDD)

**Files:**
- Create: `src/lib/domain/status.ts`
- Test: `src/lib/domain/__tests__/status.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/lib/domain/__tests__/status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { STATUS_CONFIG, type StatusDominio } from "../status";

describe("STATUS_CONFIG", () => {
  it("mapeia aderente para success", () => {
    expect(STATUS_CONFIG.aderente).toEqual({ label: "Aderente", variant: "success" });
  });

  it("mapeia parcial para warning", () => {
    expect(STATUS_CONFIG.parcial).toEqual({ label: "Parcial", variant: "warning" });
  });

  it("mapeia nao-aderente para danger", () => {
    expect(STATUS_CONFIG["nao-aderente"]).toEqual({ label: "Não aderente", variant: "danger" });
  });

  it("mapeia pendente para neutral", () => {
    expect(STATUS_CONFIG.pendente).toEqual({ label: "Pendente", variant: "neutral" });
  });

  it("cobre exatamente os 4 status de domínio", () => {
    const keys = Object.keys(STATUS_CONFIG).sort();
    expect(keys).toEqual((["aderente", "nao-aderente", "parcial", "pendente"] satisfies StatusDominio[]).sort());
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm test -- status`
Expected: FAIL — `Cannot find module '../status'`.

- [ ] **Step 3: Implementar o mínimo**

Create `src/lib/domain/status.ts`:
```ts
export type StatusDominio = "aderente" | "parcial" | "nao-aderente" | "pendente";

export type StatusVariant = "success" | "warning" | "danger" | "neutral";

export const STATUS_CONFIG: Record<StatusDominio, { label: string; variant: StatusVariant }> = {
  aderente: { label: "Aderente", variant: "success" },
  parcial: { label: "Parcial", variant: "warning" },
  "nao-aderente": { label: "Não aderente", variant: "danger" },
  pendente: { label: "Pendente", variant: "neutral" },
};
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `pnpm test -- status`
Expected: PASS (5 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/status.ts src/lib/domain/__tests__/status.test.ts
git commit -m "feat: mapa de status de dominio com teste unitario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: StatusBadge

**Files:**
- Create: `src/components/common/StatusBadge.tsx`
- Test: `src/components/common/__tests__/StatusBadge.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/components/common/__tests__/StatusBadge.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renderiza o rótulo pt-BR do status", () => {
    render(<StatusBadge status="aderente" />);
    expect(screen.getByText("Aderente")).toBeInTheDocument();
  });

  it("aplica a classe do token da variante danger", () => {
    render(<StatusBadge status="nao-aderente" />);
    const badge = screen.getByText("Não aderente");
    expect(badge.className).toContain("bg-danger");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- StatusBadge`
Expected: FAIL — módulo `../StatusBadge` não existe.

- [ ] **Step 3: Implementar o componente**

Create `src/components/common/StatusBadge.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, type StatusDominio, type StatusVariant } from "@/lib/domain/status";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-success text-success-foreground border-transparent",
  warning: "bg-warning text-warning-foreground border-transparent",
  danger: "bg-danger text-danger-foreground border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({ status, className }: { status: StatusDominio; className?: string }) {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge className={cn(VARIANT_CLASSES[variant], className)}>{label}</Badge>;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- StatusBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/StatusBadge.tsx src/components/common/__tests__/StatusBadge.test.tsx
git commit -m "feat: componente StatusBadge baseado no mapa de status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Estados padrão (EmptyState, ErrorState, LoadingState)

**Files:**
- Create: `src/components/common/EmptyState.tsx`
- Create: `src/components/common/ErrorState.tsx`
- Create: `src/components/common/LoadingState.tsx`
- Test: `src/components/common/__tests__/states.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/components/common/__tests__/states.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadingState } from "../LoadingState";

describe("estados padrão", () => {
  it("EmptyState mostra título e descrição", () => {
    render(<EmptyState title="Nenhum processo" description="Cadastre o primeiro objeto" />);
    expect(screen.getByText("Nenhum processo")).toBeInTheDocument();
    expect(screen.getByText("Cadastre o primeiro objeto")).toBeInTheDocument();
  });

  it("ErrorState mostra mensagem e botão de retentar", () => {
    render(<ErrorState message="Falha ao carregar" />);
    expect(screen.getByText("Falha ao carregar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("LoadingState renderiza placeholders de skeleton", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull();
  });
});
```

> Nota: o `skeleton` do shadcn (base-nova) usa `data-slot="skeleton"`. Se a versão gerada usar outro marcador, ajustar o seletor do teste para a classe real (`.animate-pulse`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- states`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar EmptyState**

Create `src/components/common/EmptyState.tsx`:
```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      {Icon ? <Icon className="size-8 text-muted-foreground" aria-hidden /> : null}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Implementar ErrorState**

Create `src/components/common/ErrorState.tsx`:
```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Implementar LoadingState**

Create `src/components/common/LoadingState.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test -- states`
Expected: PASS. Se o seletor de skeleton falhar, ajustar conforme a nota do Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/EmptyState.tsx src/components/common/ErrorState.tsx src/components/common/LoadingState.tsx src/components/common/__tests__/states.test.tsx
git commit -m "feat: estados padrao de vazio, erro e carregamento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: MetricCard

**Files:**
- Create: `src/components/common/MetricCard.tsx`
- Test: `src/components/common/__tests__/MetricCard.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/components/common/__tests__/MetricCard.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "../MetricCard";

describe("MetricCard", () => {
  it("mostra label e valor", () => {
    render(<MetricCard label="Processos em aberto" value={14} />);
    expect(screen.getByText("Processos em aberto")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("aplica tabular-nums no valor", () => {
    render(<MetricCard label="Taxa de resposta" value="72%" />);
    expect(screen.getByText("72%").className).toContain("tabular-nums");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- MetricCard`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Create `src/components/common/MetricCard.tsx`:
```tsx
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {delta ? (
            <span className={cn("text-xs font-medium tabular-nums", delta.positive ? "text-success" : "text-danger")}>
              {delta.value}
            </span>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- MetricCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/MetricCard.tsx src/components/common/__tests__/MetricCard.test.tsx
git commit -m "feat: componente MetricCard do dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: DataTable

**Files:**
- Create: `src/components/data-table/DataTable.tsx`
- Test: `src/components/data-table/__tests__/DataTable.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/components/data-table/__tests__/DataTable.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../DataTable";

type Row = { nome: string; valor: number };
const columns: ColumnDef<Row>[] = [
  { accessorKey: "nome", header: "Nome" },
  { accessorKey: "valor", header: "Valor" },
];
const data: Row[] = [
  { nome: "Item A", valor: 10 },
  { nome: "Item B", valor: 20 },
];

describe("DataTable", () => {
  it("renderiza cabeçalhos e linhas", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há dados", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText(/nenhum resultado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- DataTable`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Create `src/components/data-table/DataTable.tsx`:
```tsx
"use client";

import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** placeholder do filtro global; se omitido, o filtro não aparece */
  filterPlaceholder?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterPlaceholder,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-3">
      {filterPlaceholder ? (
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={filterPlaceholder}
          className="max-w-sm"
        />
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 data-[state=open]:bg-accent"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowUpDown className="ml-1 size-3.5" aria-hidden />
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- DataTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table/DataTable.tsx src/components/data-table/__tests__/DataTable.test.tsx
git commit -m "feat: DataTable reutilizavel com tanstack-table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Configuração de navegação

**Files:**
- Create: `src/lib/navigation.ts`

- [ ] **Step 1: Criar a fonte única de navegação**

Create `src/lib/navigation.ts`:
```ts
import {
  BarChart3,
  Building2,
  FileText,
  FolderSearch,
  Globe,
  LayoutDashboard,
  Mail,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/processos", label: "Processos", icon: FolderSearch },
  { href: "/contratacoes", label: "Contratações", icon: FileText },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { href: "/cotacoes", label: "Cotações", icon: Mail },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
] as const;
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/navigation.ts
git commit -m "feat: fonte unica de configuracao da navegacao

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: ThemeProvider e root layout pt-BR

**Files:**
- Create: `src/components/shell/ThemeProvider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Criar o ThemeProvider**

Create `src/components/shell/ThemeProvider.tsx`:
```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: Atualizar o root layout**

Replace `src/app/layout.tsx` com:
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/shell/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pesquisa de Preços — Divisão de Compras / CMS",
  description: "Plataforma interna de orquestração da pesquisa de preços (IN 65/2021).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

> Nota: `--font-sans` no `globals.css` referencia `var(--font-sans)`. O `@theme inline` já define `--font-sans: var(--font-sans)` — confirmar que a fonte Geist está ligada via `--font-geist-sans`. Se o texto não usar Geist, mapear `--font-sans: var(--font-geist-sans)` no `:root` do globals.css. (Ajuste só se a verificação visual no Task 12 mostrar fonte errada.)

- [ ] **Step 3: Verificar tipos e build**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/ThemeProvider.tsx src/app/layout.tsx
git commit -m "feat: ThemeProvider e metadata pt-BR no root layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: ThemeToggle e UserMenu

**Files:**
- Create: `src/components/shell/ThemeToggle.tsx`
- Create: `src/components/shell/UserMenu.tsx`

- [ ] **Step 1: Criar ThemeToggle**

Create `src/components/shell/ThemeToggle.tsx`:
```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 2: Criar UserMenu (mock — auth real é M6)**

Create `src/components/shell/UserMenu.tsx`:
```tsx
"use client";

import { LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu do usuário">
          <Avatar className="size-7">
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Servidor (mock)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 size-4" /> Perfil
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LogOut className="mr-2 size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/ThemeToggle.tsx src/components/shell/UserMenu.tsx
git commit -m "feat: alternador de tema e menu de usuario mock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: AppShell (Sidebar + Topbar) e route group `(app)`

**Files:**
- Create: `src/components/shell/AppSidebar.tsx`
- Create: `src/components/shell/Topbar.tsx`
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Criar AppSidebar**

Create `src/components/shell/AppSidebar.tsx`. Usa os componentes do `sidebar` shadcn e `NAV_ITEMS`; destaca a rota ativa via `usePathname` (por isso é client):
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <span className="text-sm font-semibold">Pesquisa de Preços</span>
        <span className="block text-xs text-muted-foreground">Divisão de Compras · CMS</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

> Nota: os nomes exatos dos subcomponentes do `sidebar` (ex.: `SidebarMenuButton`, `isActive`) vêm do que o CLI gerou no Task 1. Se algum nome divergir, abrir `src/components/ui/sidebar.tsx` e usar os exports reais — a estrutura (header/content/menu/item/button) é a mesma.

- [ ] **Step 2: Criar Topbar**

Create `src/components/shell/Topbar.tsx`:
```tsx
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input placeholder="Buscar (em breve)" disabled className="pl-8" />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Criar o layout `(app)`**

Create `src/app/(app)/layout.tsx`:
```tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { Topbar } from "@/components/shell/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main className="flex-1 space-y-6 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS. Corrigir nomes de import do sidebar se o CLI gerou nomes diferentes (ver nota do Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/AppSidebar.tsx src/components/shell/Topbar.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: AppShell com sidebar de navegacao e topbar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Páginas dos módulos + redirect da home

**Files:**
- Modify: `src/app/page.tsx` (redirect → /dashboard)
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/processos/page.tsx`
- Create: `src/app/(app)/contratacoes/page.tsx`
- Create: `src/app/(app)/sites/page.tsx`
- Create: `src/app/(app)/fornecedores/page.tsx`
- Create: `src/app/(app)/cotacoes/page.tsx`
- Create: `src/app/(app)/relatorios/page.tsx`
- Delete: os `.gitkeep` das pastas de módulo que ganharam `page.tsx`

- [ ] **Step 1: Redirect da home**

Replace `src/app/page.tsx` com:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Dashboard com MetricCards mock**

Create `src/app/(app)/dashboard/page.tsx`:
```tsx
import { FolderSearch, Mail, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/components/common/MetricCard";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação de pesquisa de preços.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Processos em aberto" value={14} delta={{ value: "+3", positive: true }} hint="vs. semana anterior" icon={FolderSearch} />
        <MetricCard label="Taxa de resposta" value="72%" delta={{ value: "-4%", positive: false }} hint="fornecedores no mês" icon={Mail} />
        <MetricCard label="Processos com gargalo" value={3} hint="sem fonte pública suficiente" icon={TriangleAlert} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Processos com DataTable mock**

Create `src/app/(app)/processos/page.tsx`:
```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { StatusDominio } from "@/lib/domain/status";

interface ProcessoMock {
  numero: string;
  objeto: string;
  responsavel: string;
  status: StatusDominio;
}

const DADOS: ProcessoMock[] = [
  { numero: "2026/001", objeto: "Aquisição de cadeiras ergonômicas", responsavel: "Ana", status: "aderente" },
  { numero: "2026/002", objeto: "Serviço de manutenção predial", responsavel: "Bruno", status: "pendente" },
  { numero: "2026/003", objeto: "Material de limpeza", responsavel: "Carla", status: "parcial" },
  { numero: "2026/004", objeto: "Licença de software de gestão", responsavel: "Diego", status: "nao-aderente" },
];

const COLUNAS: ColumnDef<ProcessoMock>[] = [
  { accessorKey: "numero", header: "Nº" },
  { accessorKey: "objeto", header: "Objeto" },
  { accessorKey: "responsavel", header: "Responsável" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export default function ProcessosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">Processos de pesquisa de preços (dados de exemplo).</p>
      </div>
      <DataTable columns={COLUNAS} data={DADOS} filterPlaceholder="Filtrar por objeto, responsável..." />
    </div>
  );
}
```

- [ ] **Step 4: Páginas-placeholder dos demais módulos**

Criar as 5 páginas abaixo. Cada uma segue o mesmo formato, mudando título, descrição e ícone.

`src/app/(app)/contratacoes/page.tsx`:
```tsx
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function ContratacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contratações públicas similares</h1>
        <p className="text-sm text-muted-foreground">Busca e classificação de aderência (fonte prioritária IN 65/2021).</p>
      </div>
      <EmptyState icon={FileText} title="Módulo em construção" description="A interface deste módulo chega no M3." />
    </div>
  );
}
```

`src/app/(app)/sites/page.tsx`:
```tsx
import { Globe } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function SitesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sites admissíveis</h1>
        <p className="text-sm text-muted-foreground">Validação de sites com captura de data/hora e bloqueio de marketplaces.</p>
      </div>
      <EmptyState icon={Globe} title="Módulo em construção" description="A interface deste módulo chega no M3." />
    </div>
  );
}
```

`src/app/(app)/fornecedores/page.tsx`:
```tsx
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function FornecedoresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">Cadastro vivo, score operacional e histórico de resposta.</p>
      </div>
      <EmptyState icon={Building2} title="Módulo em construção" description="A interface deste módulo chega no M3." />
    </div>
  );
}
```

`src/app/(app)/cotacoes/page.tsx`:
```tsx
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function CotacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cotações</h1>
        <p className="text-sm text-muted-foreground">Disparo de e-mails, controle de SLA e checklist de propostas.</p>
      </div>
      <EmptyState icon={Mail} title="Módulo em construção" description="A interface deste módulo chega no M4." />
    </div>
  );
}
```

`src/app/(app)/relatorios/page.tsx`:
```tsx
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Relatório resumido/completo e memória de cálculo.</p>
      </div>
      <EmptyState icon={BarChart3} title="Módulo em construção" description="A interface deste módulo chega no M4." />
    </div>
  );
}
```

- [ ] **Step 5: Remover os `.gitkeep` órfãos**

Run:
```bash
git rm "src/app/(app)/dashboard/.gitkeep" "src/app/(app)/processos/.gitkeep" "src/app/(app)/contratacoes/.gitkeep" "src/app/(app)/sites/.gitkeep" "src/app/(app)/fornecedores/.gitkeep" "src/app/(app)/cotacoes/.gitkeep" "src/app/(app)/relatorios/.gitkeep"
```
Expected: arquivos removidos do índice.

- [ ] **Step 6: Verificar tipos**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app"
git commit -m "feat: rotas dos modulos com dashboard, processos e placeholders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Verificação final do milestone

**Files:** nenhum (verificação); possível pequeno ajuste de fonte (ver Task 9 nota).

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: sem erros. Corrigir o que aparecer (imports não usados, etc.).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Testes**

Run: `pnpm test`
Expected: todos verdes (smoke + status + StatusBadge + states + MetricCard + DataTable).

- [ ] **Step 4: Verificação visual manual**

Run: `pnpm dev` e abrir `http://localhost:3000`.
Verificar:
- `/` redireciona para `/dashboard`.
- Sidebar lista os 7 módulos; clicar em cada um navega e destaca o item ativo.
- Dashboard mostra 3 MetricCards; Processos mostra a DataTable com ordenação/filtro/paginação e StatusBadges coloridos.
- ThemeToggle alterna claro/escuro e persiste no reload.
- Botões/links ativos usam o azul institucional (não preto).
- Fonte é Geist (se não for, aplicar o ajuste `--font-sans: var(--font-geist-sans)` da nota do Task 9 e recommitar).

- [ ] **Step 5: Marcar entregas do M1 no PLAN.md**

Em `docs/PLAN.md`, no bloco "## M1", trocar cada `- [ ]` das 8 entregas por `- [x]`.

- [ ] **Step 6: Commit final do milestone**

```bash
git add docs/PLAN.md
git commit -m "feat: design system, app shell e navegacao entre modulos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Abrir PR para main**

Run:
```bash
git push -u origin feat/design-system
gh pr create --base main --title "M1 — Design system, app shell e navegação entre módulos" --body "Implementa o Milestone 1 (UI mock): tokens de tema com primária azul institucional e status semânticos, StatusBadge, DataTable, MetricCard, estados padrão, AppShell (sidebar + topbar) e rotas-placeholder dos 7 módulos. Critério de aceite do PLAN.md atendido.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Critério de aceite do milestone (PLAN.md M1)

Navegação entre todos os módulos funciona; tema claro/escuro alterna; componentes base
(`StatusBadge`, `DataTable`, `MetricCard`, estados) existem e são usados em pelo menos uma tela.
`pnpm lint` / `pnpm typecheck` / `pnpm test` limpos.
