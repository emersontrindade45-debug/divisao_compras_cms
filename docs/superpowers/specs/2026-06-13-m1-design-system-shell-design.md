# M1 — Design System & Shell — Design

Spec de implementação do Milestone 1 da Plataforma de Pesquisa de Preços (Divisão de Compras / CMS).

- **Escopo / convenções:** [../../../CLAUDE.md](../../../CLAUDE.md) (§3 código, §5 identidade visual)
- **Plano geral:** [../../PLAN.md](../../PLAN.md) (M1)
- **Branch:** `feat/design-system`
- **Fase:** UI (mock) — sem banco, sem auth real, sem server actions.

## Objetivo

Materializar a identidade visual (CLAUDE.md §5) em tokens e componentes base, e entregar o
layout autenticado (sidebar + topbar) navegável entre os 7 módulos com telas-placeholder.
Critério de aceite do PLAN.md: navegação entre todos os módulos funciona; tema claro/escuro
alterna; componentes base existem de verdade.

## Decisões fixadas (do brainstorming)

- **Cor primária:** azul institucional sóbrio — `oklch(0.52 0.13 250)` (claro), clareado no dark.
  Usada para ação/estado, não decoração.
- **Status semânticos:** tokens dedicados (`--success/--warning/--danger`) + `StatusBadge` tipado
  com mapa de domínio testado. Não usar cores Tailwind soltas.
- **DataTable:** `@tanstack/react-table` (headless) + componentes `Table` do shadcn na apresentação.
- **Tipografia:** manter **Geist** (já configurado; qualifica como "Inter ou similar"). Geist Mono
  disponível para numerais; colunas de preço usam `tabular-nums`.
- **Sem página de catálogo `/dev/ui`** — componentes validados nas próprias rotas dos módulos.

## Arquitetura

Três camadas, de baixo pra cima:

1. **Tokens de tema** (`globals.css`) + ajustes do root `layout.tsx`.
2. **Primitivos shadcn** instalados via CLI.
3. **Componentes de domínio** (`src/components/`) + roteamento `(app)` com o shell.

### Estrutura de arquivos

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx          # AppShell (sidebar + topbar) envolve os módulos
│   │   ├── dashboard/page.tsx  # MetricCards mock
│   │   ├── processos/page.tsx  # DataTable de exemplo (mock)
│   │   ├── contratacoes/page.tsx
│   │   ├── sites/page.tsx
│   │   ├── fornecedores/page.tsx
│   │   ├── cotacoes/page.tsx
│   │   └── relatorios/page.tsx
│   ├── layout.tsx              # root: fontes, ThemeProvider, lang/metadata pt-BR
│   └── page.tsx                # redirect → /dashboard
├── components/
│   ├── ui/                     # shadcn (gerado)
│   ├── shell/                  # AppShell, Sidebar, Topbar, ThemeToggle, UserMenu
│   ├── data-table/             # DataTable + tipos
│   └── common/                 # StatusBadge, MetricCard, EmptyState, ErrorState, LoadingState
├── lib/
│   ├── domain/status.ts        # StatusDominio + STATUS_CONFIG (testado)
│   └── navigation.ts           # NAV_ITEMS — fonte única do menu
```

Princípio: a navegação vive num só lugar (`lib/navigation.ts`); adicionar módulo = uma entrada.
Server Components por padrão; `"use client"` isolado em ThemeToggle, UserMenu, destaque de rota
ativa (`usePathname`) e no DataTable.

## Componentes

### Tokens de tema (`globals.css`)

Mantém a base neutra existente e adiciona por cima:

```css
:root {
  --primary: oklch(0.52 0.13 250);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.52 0.13 250);

  --success: oklch(0.55 0.13 150);  --success-foreground: oklch(0.985 0 0);
  --warning: oklch(0.70 0.15 75);   --warning-foreground: oklch(0.205 0 0);
  --danger:  oklch(0.55 0.20 27);   --danger-foreground:  oklch(0.985 0 0);
  /* "pendente" reaproveita o muted/neutro existente */
}
.dark {
  --primary: oklch(0.62 0.14 250);
  --success: oklch(0.62 0.13 150);
  --warning: oklch(0.75 0.15 75);
  --danger:  oklch(0.62 0.19 27);
  /* corrigir --sidebar-primary do dark (hoje roxo do boilerplate) p/ o azul */
}
```

Cada token registrado em `@theme inline` (`--color-success: var(--success)`, etc.) para virar
classe utilitária (`bg-success`, `text-warning-foreground`).

### `lib/domain/status.ts` (testado)

Separa o vocabulário de negócio do token visual:

```ts
export type StatusDominio = "aderente" | "parcial" | "nao-aderente" | "pendente";

export const STATUS_CONFIG: Record<
  StatusDominio,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
>;
```

Mapeamento (consistente em todo o app, CLAUDE.md §5):
- `aderente` / válido → `success`
- `parcial` / com ressalva → `warning`
- `nao-aderente` / inválido / marketplace bloqueado → `danger`
- `pendente` / aguardando → `neutral`

**Teste unitário:** cada `StatusDominio` mapeia para variante + label esperados; cobre os 4 casos.

### `StatusBadge` (`components/common/StatusBadge.tsx`)

Recebe `status: StatusDominio`, lê `STATUS_CONFIG`, renderiza o `Badge` do shadcn com as classes
do token correspondente. Ícone lucide opcional. Sem lógica de cor inline — tudo via mapa.

### AppShell (`components/shell/` + `app/(app)/layout.tsx`)

Layout autenticado: topbar no topo, sidebar à esquerda, `{children}` no conteúdo.

- **`Sidebar`** — `sidebar` do shadcn (colapsável; mobile vira drawer). Lê `NAV_ITEMS`; item da
  rota atual destacado com a primária. Ícones lucide por módulo. Topo com nome curto do sistema.
- **`Topbar`** — gatilho de colapso, busca global **placeholder** (sem lógica no M1), `ThemeToggle`,
  `UserMenu` (`dropdown-menu` + `avatar`, itens mock Perfil/Sair — auth real é M6).
- **`ThemeToggle`** (`"use client"`) — alterna claro/escuro via `next-themes`; `ThemeProvider` no
  root layout para persistir e evitar flash.

### `lib/navigation.ts`

```ts
export const NAV_ITEMS = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/processos",    label: "Processos",    icon: FolderSearch },
  { href: "/contratacoes", label: "Contratações", icon: FileText },
  { href: "/sites",        label: "Sites",        icon: Globe },
  { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { href: "/cotacoes",     label: "Cotações",     icon: Mail },
  { href: "/relatorios",   label: "Relatórios",   icon: BarChart3 },
] as const;
```

### `DataTable` (`components/data-table/`)

Genérico, tipado, `"use client"`. `@tanstack/react-table` (headless) + `Table` do shadcn.
- API: `<DataTable columns={columns} data={data} />` com `ColumnDef<T>` por módulo.
- M1: ordenação por header, paginação client-side, filtro global (input que casa com a busca da
  topbar depois), densidade compacta. Colunas de preço com `tabular-nums`.
- Salto para filtros server-side (M7) troca o data source sem mudar a API pública.

### `MetricCard` (`components/common/MetricCard.tsx`)

Card compacto do dashboard. Props: `label`, `value`, `delta?` (sinal + cor success/danger),
`icon?`, `hint?`. Numeral tabular no valor.

### Estados padrão (`components/common/`)

- **`EmptyState`** — ícone + título + descrição + ação opcional.
- **`ErrorState`** — mensagem + botão "Tentar novamente".
- **`LoadingState`** — `skeleton` do shadcn; variantes para tabela (linhas) e cards.

## Rotas e dados mock

- `app/page.tsx` → redirect para `/dashboard`.
- `dashboard/page.tsx` → grade de `MetricCard` com valores mock (processos em aberto, taxa de
  resposta, gargalos).
- `processos/page.tsx` → `DataTable` de exemplo com fixtures de processos mock (prova
  ordenação/paginação/filtro).
- Demais módulos (`contratacoes`, `sites`, `fornecedores`, `cotacoes`, `relatorios`) → `EmptyState`
  "módulo em construção".

Fixtures mock ficam locais às páginas que as usam (nada de banco no M1).

## Primitivos shadcn a instalar

Via CLI, os que o M1 usa e ainda não existem: `sidebar`, `table`, `badge`, `card`,
`dropdown-menu`, `avatar`, `input`, `separator`, `skeleton`, `sonner` (toasts para estados de
erro/sucesso futuros). Button já existe.

## Dependências novas

- `@tanstack/react-table` — motor do DataTable.
- `next-themes` — alternância e persistência de tema.

## Fora de escopo (M1)

Busca global funcional, auth real, dados de banco, server actions, regras de conformidade IN 65,
qualquer CRUD. A UI já reflete campos/estados de conformidade quando aparecem, mas sem lógica.

## Testes

- Unitário de `lib/domain/status.ts`: os 4 status mapeiam para variante + label corretos.
- Verificação manual do critério de aceite: `pnpm dev`, navegar pelos 7 módulos, alternar tema.
- `pnpm lint` / `pnpm typecheck` / `pnpm test` limpos antes de fechar o milestone.

## Critério de aceite (PLAN.md M1)

Navegação entre todos os módulos funciona; tema claro/escuro alterna; componentes base
(`StatusBadge`, `DataTable`, `MetricCard`, estados) existem e são usados em pelo menos uma tela.
