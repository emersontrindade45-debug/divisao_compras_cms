# PLAN.md — Plano de Execução

Plano de implementação da Plataforma de Pesquisa de Preços (Divisão de Compras / CMS).
Fonte de escopo: [../PRD-Claude_divisão_compras.md](../PRD-Claude_divisão_compras.md) ·
Convenções e stack: [../CLAUDE.md](../CLAUDE.md).

## Estratégia

Construção **interface primeiro, backend depois**: cada módulo nasce com a UI navegável usando
dados de exemplo (fixtures/mock), validada visualmente, e só então é ligado ao Prisma/Postgres e
às server actions. Isso permite revisão precoce com a equipe da Câmara e reduz retrabalho de domínio.

Convenções deste plano:
- Cada milestone tem **branch própria** a partir de `main`, com **commit final** sugerido (pt-BR, imperativo).
- Marcar cada entrega `[x]` ao concluir; abrir PR para `main` ao fechar o milestone.
- Não avançar de milestone sem o critério de aceite atendido.
- Regras de conformidade da IN 65/2021 (ver CLAUDE.md §1) só são realmente exigidas a partir do M7,
  mas a UI deve já refletir os campos/estados desde os milestones de interface.

Legenda de fases: **FUNDAÇÃO** → **UI (mock)** → **BACKEND** → **CONFORMIDADE** → **ENTREGA**.

---

## M0 — Setup & Fundação `[FUNDAÇÃO]`

- **Branch:** `chore/setup`
- **Objetivo:** Esqueleto do projeto rodando localmente, com toolchain, padrões de qualidade e
  estrutura de pastas do CLAUDE.md prontos — sem features ainda.

### Entregas
- [x] Scaffold Next.js (App Router) + TypeScript `strict` + pnpm.
- [x] Tailwind CSS configurado.
- [x] shadcn/ui inicializado (`components/ui`). _(base **Base UI**, preset `base-nova`; Button validado)_
- [x] ESLint + Prettier + scripts (`lint`, `format`, `typecheck`, `dev`, `build`).
- [x] Estrutura de pastas `src/` conforme CLAUDE.md §4 (pastas vazias com `.gitkeep` onde fizer sentido).
- [x] `.env.example` com variáveis previstas (DATABASE_URL, RESEND_API_KEY, AUTH_SECRET, etc.).
- [x] `.gitignore`, `README.md` curto de "como rodar".
- [x] Vitest + Testing Library configurados (sem testes reais ainda, só o "hello test" verde).

### Critério de aceite
`pnpm dev` sobe, `pnpm lint` / `pnpm typecheck` / `pnpm test` passam limpos.

> **Commit final:** `chore: scaffold do projeto com Next.js, Tailwind, shadcn/ui e toolchain`

---

## M1 — Design System & Shell `[UI (mock)]`

- **Branch:** `feat/design-system`
- **Objetivo:** Identidade visual (CLAUDE.md §5) materializada em tokens e componentes base, mais o
  layout autenticado (sidebar + topbar) navegável entre todos os módulos (telas vazias).

### Entregas
- [ ] Tokens de tema: paleta neutra + primária discreta, dark mode via CSS variables.
- [ ] Tipografia (Inter) e números tabulares para colunas de preço.
- [ ] Componente `StatusBadge` com estados semânticos (aderente / parcial / não aderente / pendente).
- [ ] `AppShell`: sidebar com navegação dos módulos + topbar (usuário, busca global placeholder).
- [ ] `DataTable` reutilizável (ordenação, paginação, filtros) sobre shadcn/ui.
- [ ] `MetricCard` para dashboard.
- [ ] Rotas-placeholder de todos os módulos (dashboard, processos, contratações, sites, fornecedores, cotações, relatórios).
- [ ] Página de estados vazios/erro/carregamento padronizada.

### Critério de aceite
Navegação entre todos os módulos funciona; tema claro/escuro alterna; componentes base catalogados.

> **Commit final:** `feat: design system, app shell e navegação entre módulos`

---

## M2 — Processos & Cadastro de Objeto (UI) `[UI (mock)]`

- **Branch:** `feat/processos-ui`
- **Objetivo:** Telas de listagem e detalhe de processo e o cadastro estruturado do objeto, com dados mock.

### Entregas
- [ ] Lista de processos (DataTable + filtros: status, responsável, data).
- [ ] Formulário de cadastro de objeto (descrição, unidade, quantidade, características técnicas, palavras-chave) validado com Zod.
- [ ] Tela de detalhe do processo com abas: Estratégia · Fontes · Evidências · Série de preços.
- [ ] Classificação do item (comum / específico) na UI.
- [ ] Fixtures de processos/itens para popular as telas.

### Critério de aceite
É possível "criar" um processo (em memória), vê-lo na lista e abrir o detalhe com as abas.

> **Commit final:** `feat: telas de processos e cadastro estruturado de objeto (mock)`

---

## M3 — Módulos de Fontes (UI) `[UI (mock)]`

- **Branch:** `feat/fontes-ui`
- **Objetivo:** Interfaces das três fontes de preço + orquestrador de estratégia, ainda com mock.

### Entregas
- [ ] **Orquestrador de estratégia:** painel que sugere a ordem de busca por tipo de objeto.
- [ ] **Contratações públicas similares:** busca/filtros, registro de aderência (alta/parcial/não aderente) com justificativa, comparador lado a lado.
- [ ] **Sites admissíveis:** listas branca/cinza/vermelha, formulário com captura de URL + data/hora, alerta de marketplace bloqueado.
- [ ] **Fornecedores:** cadastro vivo (CNPJ, contatos, categoria, cidade, responsável), badge de score, histórico.
- [ ] Painel de evidência reutilizável (arquivo + metadados de data/hora).

### Critério de aceite
As três fontes têm UI completa e o orquestrador exibe recomendação coerente com o tipo de item (mock).

> **Commit final:** `feat: UI de contratações, sites, fornecedores e orquestrador (mock)`

---

## M4 — Cotações, Validação & Consolidação (UI) `[UI (mock)]`

- **Branch:** `feat/cotacoes-consolidacao-ui`
- **Objetivo:** Fechar o fluxo visual ponta-a-ponta: e-mails de cotação, checklist de proposta,
  série de preços e relatórios — tudo mock.

### Entregas
- [ ] Seleção em lote de fornecedores + composição de e-mail por template (preview).
- [ ] Painel de controle de cotações: status (positiva/negativa/incompleta/silenciosa), SLA, lembretes.
- [ ] Checklist de validade da proposta (CNPJ, descrição, valor unit./total, data, responsável) com marcação válida/ressalva/inválida.
- [ ] Tabela de série de preços com fonte por preço, método (média/mediana/menor valor) e exclusões.
- [ ] Dashboard com MetricCards (processos em andamento, taxa de resposta, gargalos).
- [ ] Telas de relatório resumido/completo e memória de cálculo (layout).

### Critério de aceite
Fluxo completo demonstrável em mock, do cadastro do objeto até a tela de memória de cálculo.

> **Commit final:** `feat: UI de cotações, validação de proposta, série de preços e relatórios (mock)`

---

## M5 — Banco de Dados & Camada de Dados `[BACKEND]`

- **Branch:** `feat/db-prisma`
- **Objetivo:** Modelar o domínio em Postgres via Prisma e preparar acesso a dados (ainda sem
  trocar as telas — seed alimenta o que antes era mock).

### Entregas
- [ ] Postgres local (docker-compose) + `DATABASE_URL`.
- [ ] `prisma/schema.prisma` com modelos: User, Processo, Item, Fonte, Evidencia, Fornecedor, Cotacao, Proposta, SeriePreco/PrecoConsolidado, AuditLog.
- [ ] Migration inicial + `lib/db.ts` (singleton Prisma).
- [ ] Script de seed com dados equivalentes às fixtures de UI.
- [ ] Schemas Zod compartilhados em `lib/validations/` alinhados ao schema do banco.

### Critério de aceite
`prisma migrate` e `prisma db seed` rodam; dados visíveis via Prisma Studio.

> **Commit final:** `feat: schema Prisma, migration inicial e seed do domínio`

---

## M6 — Autenticação, RBAC & Auditoria `[BACKEND]`

- **Branch:** `feat/auth-rbac`
- **Objetivo:** Login real, sessões, permissões por papel e trilha de auditoria por usuário.

### Entregas
- [ ] Login/logout + sessão (solução própria sobre Postgres/Prisma, conforme CLAUDE.md §2).
- [ ] Papéis: pesquisa / revisão / aprovação + middleware de proteção de rotas.
- [ ] Guarda de permissão em server actions sensíveis.
- [ ] `AuditLog` gravado em ações relevantes (criação/edição/exclusão, mudança de status).
- [ ] Onboarding mínimo (tela/checklist do fluxo correto de pesquisa).

### Critério de aceite
Acesso exige login; um usuário "pesquisa" não consegue aprovar; ações geram registro de auditoria.

> **Commit final:** `feat: autenticação, RBAC por papel e trilha de auditoria`

---

## M7 — Ligação Backend & Regras da IN 65/2021 `[CONFORMIDADE]`

- **Branch:** `feat/backend-integracao`
- **Objetivo:** Substituir o mock por dados reais via server actions e implementar a lógica de
  domínio com as regras de conformidade — o núcleo de maior risco.

### Entregas
- [ ] Server actions de CRUD para processos, itens, fontes, fornecedores, cotações, propostas.
- [ ] `lib/domain/`: estatística de preços (média/mediana/menor valor) **com testes unitários**.
- [ ] Regras IN 65 aplicadas: preço só entra com fonte+data+evidência; ≥3 fornecedores na pesquisa direta; justificativa obrigatória ao não usar fonte pública; alerta de dispersão exigindo análise crítica.
- [ ] Score de fornecedor (tempo de resposta + completude documental).
- [ ] Validador de proposta server-side (checklist mínimo).
- [ ] Upload de arquivos via abstração `lib/storage`.
- [ ] Busca e filtros server-side (item, período, quantidade, localidade, fornecedor, aderência).
- [ ] Telas de M2–M4 desligadas do mock e ligadas aos dados reais.

### Critério de aceite
Fluxo ponta-a-ponta com dados reais; testes de domínio passam; regras de conformidade bloqueiam
casos inválidos (provado por teste).

> **Commit final:** `feat: integração backend e regras de conformidade da IN 65/2021`

---

## M8 — E-mails, Notificações & Relatórios `[BACKEND]`

- **Branch:** `feat/emails-relatorios`
- **Objetivo:** Disparo real de cotações, controle de SLA/lembretes, notificações e exportação.

### Entregas
- [ ] Integração Resend: envio de cotação por template parametrizável + registro de data/hora.
- [ ] Controle de SLA por complexidade + lembretes automáticos (job agendado) para fornecedores sem resposta.
- [ ] Registro do status de resposta e da relação de não respondentes.
- [ ] Notificações in-app (prazo, pendências documentais, falta de fonte pública).
- [ ] Exportação: relatório resumido, relatório completo e memória de cálculo (PDF/planilha).

### Critério de aceite
E-mail de cotação chega ao destinatário (ambiente de teste); lembrete dispara; relatórios exportam
com a série de preços e a memória de cálculo.

> **Commit final:** `feat: disparo de e-mails, SLA, notificações e exportação de relatórios`

---

## M9 — Hardening & Deploy `[ENTREGA]`

- **Branch:** `chore/deploy`
- **Objetivo:** Estabilizar, cobrir caminhos críticos com teste e publicar.

### Entregas
- [ ] Testes E2E do fluxo principal (cadastro → fontes → consolidação).
- [ ] Revisão de acessibilidade e responsividade das tabelas/painéis.
- [ ] Tratamento de erros e estados de carregamento padronizados em todo o app.
- [ ] Variáveis de ambiente de produção + migrations aplicadas.
- [ ] Deploy na Vercel (mantendo build compatível com hospedagem própria Node).
- [ ] README com instruções de operação e de deploy.

### Critério de aceite
Build de produção sobe; E2E do fluxo principal passa; aplicação acessível na URL de deploy.

> **Commit final:** `chore: hardening, testes E2E e deploy de produção`

---

## Resumo das milestones

| # | Branch | Fase | Entrega-chave |
|---|---|---|---|
| M0 | `chore/setup` | Fundação | Esqueleto + toolchain |
| M1 | `feat/design-system` | UI | Tokens, shell, DataTable |
| M2 | `feat/processos-ui` | UI | Processos + cadastro de objeto |
| M3 | `feat/fontes-ui` | UI | Contratações, sites, fornecedores, orquestrador |
| M4 | `feat/cotacoes-consolidacao-ui` | UI | Cotações, validação, série de preços, relatórios |
| M5 | `feat/db-prisma` | Backend | Schema Prisma + seed |
| M6 | `feat/auth-rbac` | Backend | Auth, RBAC, auditoria |
| M7 | `feat/backend-integracao` | Conformidade | Server actions + regras IN 65 |
| M8 | `feat/emails-relatorios` | Backend | Resend, SLA, notificações, exportação |
| M9 | `chore/deploy` | Entrega | E2E, hardening, deploy |
