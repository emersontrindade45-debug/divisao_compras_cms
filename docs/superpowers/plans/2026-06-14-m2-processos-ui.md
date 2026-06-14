# M2 — Processos & Cadastro de Objeto (UI mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a lista de processos com filtros avançados e a tela de detalhe com 4 abas, alimentadas por fixtures que espelham a planilha Google Sheets (integração real fica para M7).

**Architecture:** Server Components por padrão para as páginas; client components apenas para a barra de filtros (estado local) e abas. Dados vêm de `src/lib/fixtures/processos.ts`. Reutiliza `DataTable`, `StatusBadge`, `EmptyState`, `ErrorState` do M1. Novos componentes shadcn/ui: `tabs` e `select`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui (base-nova), @tanstack/react-table, Vitest + Testing Library.

---

## Convenções deste plano

- Gerenciador de pacotes: **pnpm**.
- Após cada tarefa que toca código, rodar `pnpm lint` e `pnpm typecheck` antes do commit (incluído nos steps).
- Mensagens de commit em pt-BR, imperativo.
- Branch de trabalho: `feat/processos-ui` (criada na Task 0).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/fixtures/processos.ts` | Tipo `ProcessoFixture` + 8 processos mock + helpers de acesso |
| `src/components/processos/SheetsBanner.tsx` | Banner de origem dos dados + botão "Ver planilha" |
| `src/components/processos/ProcessoFilters.tsx` | Barra de filtros client-side (busca, status, responsável, datas) |
| `src/components/processos/ProcessosTable.tsx` | Client component que une filtros + DataTable + navegação |
| `src/components/processos/ProcessoHeader.tsx` | Header do detalhe (número, objeto, badges, metadados) |
| `src/components/processos/ProcessoTabs.tsx` | Abas Estratégia/Fontes/Evidências/Série de Preços |
| `src/app/(app)/processos/page.tsx` | Página da lista (Server Component) — **modificar** |
| `src/app/(app)/processos/[id]/page.tsx` | Página de detalhe (Server Component) — **criar** |
| `.env.example` | Adicionar `NEXT_PUBLIC_SHEETS_URL` — **modificar** |
| `src/components/ui/tabs.tsx` | shadcn — **instalar via CLI** |
| `src/components/ui/select.tsx` | shadcn — **instalar via CLI** |

---

## Task 0: Branch e dependências shadcn

**Files:** nenhum arquivo editado manualmente (CLI gera `tabs.tsx` e `select.tsx`).

- [ ] **Step 1: Criar a branch a partir de main**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/processos-ui
```

- [ ] **Step 2: Instalar componentes shadcn `tabs` e `select`**

```bash
pnpm dlx shadcn@latest add tabs select
```

Expected: cria `src/components/ui/tabs.tsx` e `src/components/ui/select.tsx`. Se o CLI perguntar sobre sobrescrever algo, responder não para arquivos existentes.

- [ ] **Step 3: Verificar que os arquivos foram criados**

```bash
ls src/components/ui/tabs.tsx src/components/ui/select.tsx
```

Expected: ambos os caminhos existem.

- [ ] **Step 4: Garantir que o projeto ainda compila**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/tabs.tsx src/components/ui/select.tsx
git commit -m "chore: adiciona componentes tabs e select do shadcn/ui"
```

---

## Task 1: Fixtures de processos

**Files:**
- Create: `src/lib/fixtures/processos.ts`
- Test: `src/lib/fixtures/__tests__/processos.test.ts`

- [ ] **Step 1: Escrever o teste falho**

```ts
// src/lib/fixtures/__tests__/processos.test.ts
import { describe, expect, it } from "vitest";
import { PROCESSOS, getProcessoById, getResponsaveis } from "../processos";

describe("fixtures de processos", () => {
  it("expõe 8 processos", () => {
    expect(PROCESSOS).toHaveLength(8);
  });

  it("todo processo tem id único", () => {
    const ids = PROCESSOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cobre os quatro status do domínio", () => {
    const status = new Set(PROCESSOS.map((p) => p.status));
    expect(status).toEqual(new Set(["aderente", "parcial", "nao-aderente", "pendente"]));
  });

  it("getProcessoById retorna o processo correto", () => {
    const primeiro = PROCESSOS[0];
    expect(getProcessoById(primeiro.id)).toEqual(primeiro);
  });

  it("getProcessoById retorna undefined para id inexistente", () => {
    expect(getProcessoById("nao-existe")).toBeUndefined();
  });

  it("getResponsaveis retorna nomes únicos ordenados", () => {
    const resp = getResponsaveis();
    const ordenado = [...resp].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(resp).toEqual(ordenado);
    expect(new Set(resp).size).toBe(resp.length);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- processos.test`
Expected: FAIL com erro de import (módulo `../processos` não encontrado).

- [ ] **Step 3: Implementar os fixtures**

```ts
// src/lib/fixtures/processos.ts
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
    a.localeCompare(b, "pt-BR")
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- processos.test`
Expected: PASS (6 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fixtures/processos.ts src/lib/fixtures/__tests__/processos.test.ts
git commit -m "feat: fixtures de processos espelhando schema da planilha"
```

---

## Task 2: Banner da planilha Google Sheets

**Files:**
- Create: `src/components/processos/SheetsBanner.tsx`
- Test: `src/components/processos/__tests__/SheetsBanner.test.tsx`

- [ ] **Step 1: Escrever o teste falho**

```tsx
// src/components/processos/__tests__/SheetsBanner.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetsBanner } from "../SheetsBanner";

describe("SheetsBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exibe a mensagem de origem dos dados", () => {
    render(<SheetsBanner sheetsUrl={undefined} />);
    expect(screen.getByText(/sincronizados da planilha/i)).toBeInTheDocument();
  });

  it("mostra o botão 'Ver planilha' quando há URL", () => {
    render(<SheetsBanner sheetsUrl="https://docs.google.com/spreadsheets/abc" />);
    const link = screen.getByRole("link", { name: /ver planilha/i });
    expect(link).toHaveAttribute("href", "https://docs.google.com/spreadsheets/abc");
  });

  it("omite o botão quando não há URL", () => {
    render(<SheetsBanner sheetsUrl={undefined} />);
    expect(screen.queryByRole("link", { name: /ver planilha/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- SheetsBanner`
Expected: FAIL (módulo `../SheetsBanner` não encontrado).

- [ ] **Step 3: Implementar o banner**

```tsx
// src/components/processos/SheetsBanner.tsx
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SheetsBanner({ sheetsUrl }: { sheetsUrl: string | undefined }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Os processos são sincronizados da planilha Google Sheets. Alterações devem ser feitas
          diretamente na planilha.
        </p>
      </div>
      {sheetsUrl ? (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={sheetsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" aria-hidden />
            Ver planilha
          </a>
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- SheetsBanner`
Expected: PASS (3 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/SheetsBanner.tsx src/components/processos/__tests__/SheetsBanner.test.tsx
git commit -m "feat: banner de origem dos dados da planilha Google Sheets"
```

---

## Task 3: Barra de filtros client-side

**Files:**
- Create: `src/components/processos/ProcessoFilters.tsx`
- Test: `src/components/processos/__tests__/ProcessoFilters.test.tsx`

A barra é controlada: recebe o estado de filtros e um callback de mudança do pai. Isso a mantém pura e testável.

- [ ] **Step 1: Escrever o teste falho**

```tsx
// src/components/processos/__tests__/ProcessoFilters.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessoFilters, type FiltrosProcesso } from "../ProcessoFilters";

const FILTROS_VAZIOS: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

describe("ProcessoFilters", () => {
  it("chama onChange ao digitar na busca", () => {
    const onChange = vi.fn();
    render(
      <ProcessoFilters
        filtros={FILTROS_VAZIOS}
        responsaveis={["Ana Souza"]}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "cadeira" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_VAZIOS, busca: "cadeira" });
  });

  it("renderiza os responsáveis recebidos", () => {
    render(
      <ProcessoFilters
        filtros={FILTROS_VAZIOS}
        responsaveis={["Ana Souza", "Bruno Lima"]}
        onChange={vi.fn()}
      />
    );
    // o nativo <select> expõe as opções como options
    expect(screen.getByRole("option", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bruno Lima" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- ProcessoFilters`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar a barra de filtros**

Usa `<select>` nativo (não o shadcn `Select`) para os dropdowns, porque o `Select` do Base UI usa portal/popover que não expõe `option` de forma estável em jsdom — o nativo mantém o componente testável e acessível. O input usa o `Input` do shadcn.

```tsx
// src/components/processos/ProcessoFilters.tsx
"use client";

import { Input } from "@/components/ui/input";
import { STATUS_CONFIG, type StatusDominio } from "@/lib/domain/status";

export interface FiltrosProcesso {
  busca: string;
  status: StatusDominio | "todos";
  responsavel: string;
  dataInicio: string;
  dataFim: string;
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG) as [StatusDominio, { label: string }][];

const selectClasses =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ProcessoFilters({
  filtros,
  responsaveis,
  onChange,
}: {
  filtros: FiltrosProcesso;
  responsaveis: string[];
  onChange: (filtros: FiltrosProcesso) => void;
}) {
  function update<K extends keyof FiltrosProcesso>(key: K, value: FiltrosProcesso[K]) {
    onChange({ ...filtros, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-busca">
          Busca
        </label>
        <Input
          id="filtro-busca"
          value={filtros.busca}
          onChange={(e) => update("busca", e.target.value)}
          placeholder="Filtrar por objeto ou número..."
          className="w-64"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-status">
          Status
        </label>
        <select
          id="filtro-status"
          className={selectClasses}
          value={filtros.status}
          onChange={(e) => update("status", e.target.value as FiltrosProcesso["status"])}
        >
          <option value="todos">Todos</option>
          {STATUS_OPTIONS.map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-responsavel">
          Responsável
        </label>
        <select
          id="filtro-responsavel"
          className={selectClasses}
          value={filtros.responsavel}
          onChange={(e) => update("responsavel", e.target.value)}
        >
          <option value="todos">Todos</option>
          {responsaveis.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-data-inicio">
          De
        </label>
        <Input
          id="filtro-data-inicio"
          type="date"
          value={filtros.dataInicio}
          onChange={(e) => update("dataInicio", e.target.value)}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="filtro-data-fim">
          Até
        </label>
        <Input
          id="filtro-data-fim"
          type="date"
          value={filtros.dataFim}
          onChange={(e) => update("dataFim", e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- ProcessoFilters`
Expected: PASS (2 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ProcessoFilters.tsx src/components/processos/__tests__/ProcessoFilters.test.tsx
git commit -m "feat: barra de filtros client-side de processos"
```

---

## Task 4: Lógica de filtragem (função pura)

**Files:**
- Create: `src/lib/domain/processoFilter.ts`
- Test: `src/lib/domain/__tests__/processoFilter.test.ts`

Extrair a filtragem para uma função pura testável, separada da UI.

- [ ] **Step 1: Escrever o teste falho**

```ts
// src/lib/domain/__tests__/processoFilter.test.ts
import { describe, expect, it } from "vitest";
import { filtrarProcessos } from "../processoFilter";
import { PROCESSOS } from "@/lib/fixtures/processos";
import type { FiltrosProcesso } from "@/components/processos/ProcessoFilters";

const VAZIO: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

describe("filtrarProcessos", () => {
  it("sem filtros retorna todos", () => {
    expect(filtrarProcessos(PROCESSOS, VAZIO)).toHaveLength(PROCESSOS.length);
  });

  it("filtra por texto no objeto (case-insensitive)", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, busca: "CADEIRA" });
    expect(r).toHaveLength(1);
    expect(r[0].numero).toBe("2026/001");
  });

  it("filtra por número do processo", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, busca: "2026/004" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("proc-004");
  });

  it("filtra por status", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, status: "pendente" });
    expect(r.every((p) => p.status === "pendente")).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it("filtra por responsável", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, responsavel: "Ana Souza" });
    expect(r.every((p) => p.responsavel === "Ana Souza")).toBe(true);
  });

  it("filtra por data de abertura no intervalo", () => {
    const r = filtrarProcessos(PROCESSOS, {
      ...VAZIO,
      dataInicio: "2026-01-01",
      dataFim: "2026-12-31",
    });
    expect(r.every((p) => p.dataAbertura >= "2026-01-01" && p.dataAbertura <= "2026-12-31")).toBe(
      true
    );
    expect(r.some((p) => p.dataAbertura.startsWith("2025"))).toBe(false);
  });

  it("combina múltiplos filtros (AND)", () => {
    const r = filtrarProcessos(PROCESSOS, {
      ...VAZIO,
      status: "nao-aderente",
      responsavel: "Diego Alves",
    });
    expect(r.every((p) => p.status === "nao-aderente" && p.responsavel === "Diego Alves")).toBe(
      true
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- processoFilter`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar a função de filtragem**

```ts
// src/lib/domain/processoFilter.ts
import type { FiltrosProcesso } from "@/components/processos/ProcessoFilters";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

export function filtrarProcessos(
  processos: ProcessoFixture[],
  filtros: FiltrosProcesso
): ProcessoFixture[] {
  const busca = filtros.busca.trim().toLowerCase();

  return processos.filter((p) => {
    if (busca) {
      const alvo = `${p.objeto} ${p.numero}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    if (filtros.status !== "todos" && p.status !== filtros.status) return false;
    if (filtros.responsavel !== "todos" && p.responsavel !== filtros.responsavel) return false;
    if (filtros.dataInicio && p.dataAbertura < filtros.dataInicio) return false;
    if (filtros.dataFim && p.dataAbertura > filtros.dataFim) return false;
    return true;
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- processoFilter`
Expected: PASS (7 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/processoFilter.ts src/lib/domain/__tests__/processoFilter.test.ts
git commit -m "feat: função pura de filtragem de processos"
```

---

## Task 5: Tabela de processos com filtros e navegação

**Files:**
- Create: `src/components/processos/ProcessosTable.tsx`
- Test: `src/components/processos/__tests__/ProcessosTable.test.tsx`

Client component que mantém o estado dos filtros, aplica `filtrarProcessos`, e monta as colunas do `DataTable`. A coluna "Nº" linka para o detalhe.

- [ ] **Step 1: Escrever o teste falho**

```tsx
// src/components/processos/__tests__/ProcessosTable.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessosTable } from "../ProcessosTable";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessosTable", () => {
  it("renderiza todas as linhas inicialmente", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    expect(screen.getByText("Aquisição de cadeiras ergonômicas")).toBeInTheDocument();
    expect(screen.getByText("Locação de impressoras multifuncionais")).toBeInTheDocument();
  });

  it("filtra ao digitar na busca", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "cadeira" },
    });
    expect(screen.getByText("Aquisição de cadeiras ergonômicas")).toBeInTheDocument();
    expect(
      screen.queryByText("Locação de impressoras multifuncionais")
    ).not.toBeInTheDocument();
  });

  it("o número do processo é um link para o detalhe", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    const link = screen.getByRole("link", { name: "2026/001" });
    expect(link).toHaveAttribute("href", "/processos/proc-001");
  });

  it("mostra estado vazio quando nada bate no filtro", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "zzzznada" },
    });
    expect(screen.getByText(/nenhum processo encontrado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- ProcessosTable`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar a tabela**

A `DataTable` do M1 renderiza "Nenhum resultado." internamente quando `data` está vazio; o teste de estado vazio busca por "nenhum processo encontrado". Para satisfazer ambos sem alterar a `DataTable`, renderizamos um `EmptyState` próprio quando o resultado filtrado é vazio e a `DataTable` caso contrário.

```tsx
// src/components/processos/ProcessosTable.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderSearch } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  ProcessoFilters,
  type FiltrosProcesso,
} from "@/components/processos/ProcessoFilters";
import { filtrarProcessos } from "@/lib/domain/processoFilter";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

const FILTROS_INICIAIS: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

const CLASSIFICACAO_LABEL: Record<ProcessoFixture["classificacao"], string> = {
  comum: "Comum",
  especifico: "Específico",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const COLUNAS: ColumnDef<ProcessoFixture>[] = [
  {
    accessorKey: "numero",
    header: "Nº",
    cell: ({ row }) => (
      <Link
        href={`/processos/${row.original.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.numero}
      </Link>
    ),
  },
  { accessorKey: "objeto", header: "Objeto" },
  {
    accessorKey: "classificacao",
    header: "Classificação",
    cell: ({ row }) => (
      <Badge variant="outline">{CLASSIFICACAO_LABEL[row.original.classificacao]}</Badge>
    ),
  },
  { accessorKey: "responsavel", header: "Responsável" },
  {
    accessorKey: "dataAbertura",
    header: "Abertura",
    cell: ({ row }) => <span className="tabular-nums">{formatarData(row.original.dataAbertura)}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function ProcessosTable({ processos }: { processos: ProcessoFixture[] }) {
  const [filtros, setFiltros] = useState<FiltrosProcesso>(FILTROS_INICIAIS);

  const responsaveis = useMemo(
    () =>
      Array.from(new Set(processos.map((p) => p.responsavel))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [processos]
  );

  const filtrados = useMemo(() => filtrarProcessos(processos, filtros), [processos, filtros]);

  return (
    <div className="space-y-4">
      <ProcessoFilters filtros={filtros} responsaveis={responsaveis} onChange={setFiltros} />
      {filtrados.length ? (
        <DataTable columns={COLUNAS} data={filtrados} />
      ) : (
        <EmptyState
          icon={FolderSearch}
          title="Nenhum processo encontrado"
          description="Ajuste os filtros para ver mais resultados."
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- ProcessosTable`
Expected: PASS (4 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ProcessosTable.tsx src/components/processos/__tests__/ProcessosTable.test.tsx
git commit -m "feat: tabela de processos com filtros e link para detalhe"
```

---

## Task 6: Página da lista de processos

**Files:**
- Modify: `src/app/(app)/processos/page.tsx`
- Modify: `.env.example`

Página é Server Component: lê `PROCESSOS`, lê `NEXT_PUBLIC_SHEETS_URL`, monta banner + tabela.

- [ ] **Step 1: Adicionar a variável ao `.env.example`**

Acrescentar ao final de `.env.example`:

```env

# Google Sheets (M2 — origem dos processos; integração real no M7)
NEXT_PUBLIC_SHEETS_URL=""
```

- [ ] **Step 2: Reescrever a página da lista**

```tsx
// src/app/(app)/processos/page.tsx
import { SheetsBanner } from "@/components/processos/SheetsBanner";
import { ProcessosTable } from "@/components/processos/ProcessosTable";
import { PROCESSOS } from "@/lib/fixtures/processos";

export default function ProcessosPage() {
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_URL || undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">
          Processos de pesquisa de preços (dados de exemplo).
        </p>
      </div>
      <SheetsBanner sheetsUrl={sheetsUrl} />
      <ProcessosTable processos={PROCESSOS} />
    </div>
  );
}
```

- [ ] **Step 3: Verificar build e tipos**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação visual manual**

Run: `pnpm dev`
Abrir `http://localhost:3000/processos`. Conferir: banner aparece, filtros funcionam, clicar num número leva a `/processos/proc-XXX` (ainda 404 até a Task 7). Encerrar o dev server.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/processos/page.tsx" .env.example
git commit -m "feat: pagina da lista de processos com banner e filtros"
```

---

## Task 7: Header do detalhe do processo

**Files:**
- Create: `src/components/processos/ProcessoHeader.tsx`
- Test: `src/components/processos/__tests__/ProcessoHeader.test.tsx`

- [ ] **Step 1: Escrever o teste falho**

```tsx
// src/components/processos/__tests__/ProcessoHeader.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessoHeader } from "../ProcessoHeader";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessoHeader", () => {
  const processo = PROCESSOS[0];

  it("exibe número e objeto do processo", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText(processo.numero)).toBeInTheDocument();
    expect(screen.getByText(processo.objeto)).toBeInTheDocument();
  });

  it("exibe o badge de status", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText("Aderente")).toBeInTheDocument();
  });

  it("exibe a classificação e o responsável", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText("Comum")).toBeInTheDocument();
    expect(screen.getByText(processo.responsavel)).toBeInTheDocument();
  });

  it("tem link de voltar para a lista", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByRole("link", { name: /voltar/i })).toHaveAttribute("href", "/processos");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- ProcessoHeader`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar o header**

```tsx
// src/components/processos/ProcessoHeader.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

const CLASSIFICACAO_LABEL: Record<ProcessoFixture["classificacao"], string> = {
  comum: "Comum",
  especifico: "Específico",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function ProcessoHeader({ processo }: { processo: ProcessoFixture }) {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/processos">
          <ArrowLeft className="size-4" aria-hidden />
          Voltar
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {processo.numero}
          </span>
          <StatusBadge status={processo.status} />
          <Badge variant="outline">{CLASSIFICACAO_LABEL[processo.classificacao]}</Badge>
        </div>

        <h1 className="text-2xl font-semibold">{processo.objeto}</h1>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Responsável:</dt>
            <dd>{processo.responsavel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Abertura:</dt>
            <dd className="tabular-nums">{formatarData(processo.dataAbertura)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Quantidade:</dt>
            <dd className="tabular-nums">
              {processo.quantidade} {processo.unidade}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- ProcessoHeader`
Expected: PASS (4 testes).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ProcessoHeader.tsx src/components/processos/__tests__/ProcessoHeader.test.tsx
git commit -m "feat: header do detalhe do processo"
```

---

## Task 8: Abas do detalhe do processo

**Files:**
- Create: `src/components/processos/ProcessoTabs.tsx`
- Test: `src/components/processos/__tests__/ProcessoTabs.test.tsx`

Usa o `Tabs` do shadcn instalado na Task 0. A aba Estratégia mostra texto mock que varia pela classificação; as outras três mostram `EmptyState`.

- [ ] **Step 1: Escrever o teste falho**

```tsx
// src/components/processos/__tests__/ProcessoTabs.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessoTabs } from "../ProcessoTabs";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessoTabs", () => {
  it("renderiza os rótulos das quatro abas", () => {
    render(<ProcessoTabs processo={PROCESSOS[0]} />);
    expect(screen.getByRole("tab", { name: /estratégia/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /fontes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /evidências/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /série de preços/i })).toBeInTheDocument();
  });

  it("mostra a recomendação de estratégia na aba inicial", () => {
    render(<ProcessoTabs processo={PROCESSOS[0]} />);
    expect(screen.getByText(/ordem de busca recomendada/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- ProcessoTabs`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar as abas**

> **Nota:** o import de `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` deve bater com a API gerada pelo shadcn na Task 0. Se os nomes exportados diferirem, ajustar os imports conforme o arquivo `src/components/ui/tabs.tsx` gerado.

```tsx
// src/components/processos/ProcessoTabs.tsx
import { FileText, Globe, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import type { ProcessoFixture } from "@/lib/fixtures/processos";

function estrategiaTexto(processo: ProcessoFixture): string {
  if (processo.classificacao === "comum") {
    return "Item comum: priorize contratações públicas similares e sites admissíveis, com cotação direta apenas como complemento.";
  }
  return "Item específico: priorize cotação direta com fornecedores qualificados e contratações públicas similares; sites tendem a ter menor aderência.";
}

export function ProcessoTabs({ processo }: { processo: ProcessoFixture }) {
  return (
    <Tabs defaultValue="estrategia" className="space-y-4">
      <TabsList>
        <TabsTrigger value="estrategia">Estratégia</TabsTrigger>
        <TabsTrigger value="fontes">Fontes</TabsTrigger>
        <TabsTrigger value="evidencias">Evidências</TabsTrigger>
        <TabsTrigger value="serie">Série de preços</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordem de busca recomendada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{estrategiaTexto(processo)}</p>
            <div>
              <p className="font-medium">Características técnicas</p>
              <p className="text-muted-foreground">{processo.caracteristicasTecnicas}</p>
            </div>
            <div>
              <p className="font-medium">Palavras-chave</p>
              <p className="text-muted-foreground">{processo.palavrasChave.join(", ")}</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="fontes">
        <EmptyState
          icon={Globe}
          title="Nenhuma fonte registrada ainda"
          description="As fontes de preço serão adicionadas no módulo de fontes (M3)."
        />
      </TabsContent>

      <TabsContent value="evidencias">
        <EmptyState
          icon={FileText}
          title="Nenhuma evidência registrada ainda"
          description="Evidências com data/hora de acesso serão anexadas às fontes."
        />
      </TabsContent>

      <TabsContent value="serie">
        <EmptyState
          icon={Layers}
          title="Nenhum preço registrado ainda"
          description="A série de preços será consolidada no módulo de cotações (M4)."
        />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- ProcessoTabs`
Expected: PASS (2 testes). Se falhar por nome de export de `tabs.tsx`, ajustar imports e rodar de novo.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ProcessoTabs.tsx src/components/processos/__tests__/ProcessoTabs.test.tsx
git commit -m "feat: abas do detalhe do processo (estrategia, fontes, evidencias, serie)"
```

---

## Task 9: Página de detalhe do processo

**Files:**
- Create: `src/app/(app)/processos/[id]/page.tsx`

Server Component que recebe `params.id`, busca via `getProcessoById`. Se não achar, renderiza um estado de erro estático (não o `ErrorState` client, que tem botão de retry inútil aqui) com link de volta.

- [ ] **Step 1: Implementar a página de detalhe**

> **Nota Next.js 16:** `params` é assíncrono em Server Components — tipar como `Promise` e `await`.

```tsx
// src/app/(app)/processos/[id]/page.tsx
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessoHeader } from "@/components/processos/ProcessoHeader";
import { ProcessoTabs } from "@/components/processos/ProcessoTabs";
import { getProcessoById } from "@/lib/fixtures/processos";

export default async function ProcessoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const processo = getProcessoById(id);

  if (!processo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertTriangle className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Processo não encontrado. Ele pode ter sido removido da planilha.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/processos">Voltar para a lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProcessoHeader processo={processo} />
      <ProcessoTabs processo={processo} />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build e tipos**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 3: Verificação visual manual**

Run: `pnpm dev`
- Abrir `http://localhost:3000/processos`, clicar num número → detalhe abre com header e abas.
- Alternar as 4 abas; conferir conteúdo.
- Abrir `http://localhost:3000/processos/nao-existe` → estado de erro com link de volta.
Encerrar o dev server.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/processos/[id]/page.tsx"
git commit -m "feat: pagina de detalhe do processo com abas e tratamento de id invalido"
```

---

## Task 10: Verificação final do milestone

**Files:** nenhum (gate de qualidade).

- [ ] **Step 1: Rodar a suíte completa**

Run: `pnpm test`
Expected: todos os testes passam (incluindo os do M1 e os novos do M2).

- [ ] **Step 2: Lint, format e typecheck**

Run: `pnpm lint && pnpm format:check && pnpm typecheck`
Expected: sem erros. Se `format:check` reclamar, rodar `pnpm format` e commitar a formatação.

- [ ] **Step 3: Build de produção**

Run: `pnpm build`
Expected: build conclui sem erros.

- [ ] **Step 4: Marcar entregas do M2 no PLAN.md**

Editar `docs/PLAN.md`, marcar todas as entregas do M2 como `[x]`:
- Lista de processos (DataTable + filtros: status, responsável, data).
- Formulário de cadastro de objeto → **substituir o texto** por: "Cadastro de objeto via planilha Google Sheets (sincronização automática — UI mock; integração no M7)."
- Tela de detalhe do processo com abas: Estratégia · Fontes · Evidências · Série de preços.
- Classificação do item (comum / específico) na UI.
- Fixtures de processos/itens para popular as telas.

- [ ] **Step 5: Commit final do milestone**

```bash
git add docs/PLAN.md
git commit -m "feat: telas de processos e cadastro estruturado de objeto (mock)"
```

- [ ] **Step 6: Abrir PR para main**

```bash
git push -u origin feat/processos-ui
gh pr create --base main --title "M2: telas de processos e cadastro de objeto (mock)" --body "$(cat <<'EOF'
## Resumo
Implementa o M2 — lista de processos com filtros avançados e tela de detalhe com 4 abas, alimentadas por fixtures que espelham a planilha Google Sheets. Cadastro de objeto é feito via planilha (integração real fica para o M7).

## Entregas
- Lista de processos com filtros (busca, status, responsável, intervalo de data)
- Banner de origem dos dados (Google Sheets) com link configurável
- Detalhe do processo com abas Estratégia/Fontes/Evidências/Série de Preços
- Classificação comum/específico na UI
- Fixtures de 8 processos

## Testes
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` passam.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review (preenchido pelo autor do plano)

**Cobertura do spec:**
- Lista com filtros (status, responsável, data) → Tasks 3, 4, 5, 6 ✓
- Banner Google Sheets + URL por env → Tasks 2, 6 ✓
- Detalhe com 4 abas → Tasks 8, 9 ✓
- Classificação comum/específico na UI → Tasks 5 (coluna), 7 (header) ✓
- Fixtures → Task 1 ✓
- ID inválido → ErrorState → Task 9 ✓
- Critério de aceite (lint/typecheck/test) → Task 10 ✓
- Sem formulário de cadastro (entrada via planilha) → refletido na Task 10 (PLAN.md) ✓

**Consistência de tipos:** `FiltrosProcesso` definido na Task 3 e consumido nas Tasks 4 e 5 com os mesmos campos; `ProcessoFixture` definido na Task 1 e usado em todas as demais; `getProcessoById`/`getResponsaveis` definidos na Task 1 e usados nas Tasks 5 e 9.

**Placeholders:** nenhum — todo código está completo. Há uma nota condicional na Task 8 sobre nomes de export do `tabs.tsx` gerado, que é orientação de adaptação, não placeholder.
