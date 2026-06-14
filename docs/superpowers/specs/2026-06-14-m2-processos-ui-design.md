# M2 — Processos & Cadastro de Objeto (UI mock)

**Data:** 2026-06-14  
**Branch:** `feat/processos-ui`  
**Status:** Aprovado para implementação

---

## Contexto

M2 expande o módulo `/processos` com lista completa, filtros avançados e tela de detalhe com abas. A entrada de dados de processos é feita exclusivamente via planilha Google Sheets compartilhada — a plataforma é leitora/orquestradora. Nesta fase (UI mock), os dados vêm de fixtures que espelham o schema da planilha; a integração real com a API do Google Sheets fica para o M7.

---

## Decisões de design

| Decisão | Escolha | Motivo |
|---|---|---|
| Formulário de cadastro | Não existe | Entrada de dados é pela planilha Google Sheets |
| Sincronização | Automática (polling/webhook) | Usuário não aciona importação manualmente |
| Fase M2 | UI mock com fixtures | Integração real fica para M7 (backend) |
| URL da planilha | `NEXT_PUBLIC_SHEETS_URL` | Configurável por ambiente, sem hardcode |

---

## Telas

### 1. Lista `/processos`

**Componente:** `src/app/(app)/processos/page.tsx` (substitui o atual)

**Layout:**
- Banner informativo no topo: "Os processos são sincronizados da planilha Google Sheets. Alterações devem ser feitas diretamente na planilha." + botão "Ver planilha" (link externo para `NEXT_PUBLIC_SHEETS_URL`)
- Filtros em linha acima da tabela (client-side sobre fixtures):
  - Input de busca textual (objeto / número do processo)
  - Select de status: Todos / Aderente / Parcial / Não aderente / Pendente
  - Select de responsável: lista dinâmica extraída dos fixtures
  - Date-range de data de abertura (dois inputs `date`)
- `DataTable` com colunas: Nº · Objeto · Classificação · Responsável · Data de abertura · Status
- Linhas clicáveis → navegam para `/processos/[id]`
- `EmptyState` quando nenhum resultado bate nos filtros

**Componentes necessários:**
- `src/components/processos/ProcessoFilters.tsx` — barra de filtros client-side
- `src/components/processos/SheetsBanner.tsx` — banner de origem dos dados

### 2. Detalhe `/processos/[id]`

**Componente:** `src/app/(app)/processos/[id]/page.tsx`

**Layout:**
- Header: número do processo, objeto (título), `StatusBadge`, badge de classificação (comum/específico), responsável, data de abertura
- Botão "← Voltar" → `/processos`
- 4 abas (`Tabs` do shadcn/ui):
  - **Estratégia** — `Card` com texto mock de recomendação de ordem de busca baseada na classificação do item
  - **Fontes** — `EmptyState` "Nenhuma fonte registrada ainda"
  - **Evidências** — `EmptyState` "Nenhuma evidência registrada ainda"
  - **Série de Preços** — `EmptyState` "Nenhum preço registrado ainda"
- Se `id` não encontrado nos fixtures → `ErrorState` com link de volta

**Componentes necessários:**
- `src/components/processos/ProcessoHeader.tsx` — header com metadados do processo
- `src/components/processos/ProcessoTabs.tsx` — abas com conteúdo mock

---

## Fixtures

**Arquivo:** `src/lib/fixtures/processos.ts`

**Schema do objeto `ProcessoFixture`:**
```ts
interface ProcessoFixture {
  id: string;                    // "proc-001"
  numero: string;                // "2026/001"
  objeto: string;                // descrição do objeto
  unidade: string;               // "unidade" | "serviço" | "m²" etc.
  quantidade: number;
  caracteristicasTecnicas: string;
  palavrasChave: string[];
  classificacao: "comum" | "especifico";
  responsavel: string;
  status: StatusDominio;
  dataAbertura: string;          // ISO 8601 "YYYY-MM-DD"
}
```

**Volume:** 8 processos cobrindo:
- 4 status distintos (2 pendente, 2 aderente, 2 parcial, 2 não aderente)
- 2 classificações (comum e específico)
- 4 responsáveis distintos
- Datas variadas em 2025–2026

---

## Variáveis de ambiente

```env
# .env.example (adicionar)
NEXT_PUBLIC_SHEETS_URL=https://docs.google.com/spreadsheets/...
```

O banner exibe o botão "Ver planilha" somente se `NEXT_PUBLIC_SHEETS_URL` estiver definida.

---

## Componentes shadcn/ui necessários (ainda não instalados)

- `tabs` — para as abas do detalhe
- `select` — para filtros de status e responsável
- `dialog` (opcional, para futuros modais) — pode aguardar M3

---

## Critério de aceite

- [ ] É possível ver a lista de processos com filtros funcionando (client-side)
- [ ] Clicar em um processo abre o detalhe com as 4 abas
- [ ] ID inválido exibe `ErrorState`
- [ ] Banner da planilha aparece na lista; botão "Ver planilha" some se `NEXT_PUBLIC_SHEETS_URL` não estiver definida
- [ ] `pnpm lint`, `pnpm typecheck` e `pnpm test` passam

---

## Fora do escopo deste milestone

- Formulário de cadastro de processo (entrada é via Google Sheets)
- Integração real com API do Google Sheets (M7)
- Conteúdo real nas abas Fontes, Evidências, Série de Preços (M3 e M4)
- Paginação server-side (M7)
