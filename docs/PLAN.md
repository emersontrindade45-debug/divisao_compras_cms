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
- [x] Tokens de tema: paleta neutra + primária discreta (azul institucional), dark mode via CSS variables.
- [x] Tipografia (Geist — "Inter ou similar") e números tabulares (`tabular-nums`) para colunas de preço.
- [x] Componente `StatusBadge` com estados semânticos (aderente / parcial / não aderente / pendente).
- [x] `AppShell`: sidebar com navegação dos módulos + topbar (usuário, busca global placeholder).
- [x] `DataTable` reutilizável (ordenação, paginação, filtros) sobre shadcn/ui.
- [x] `MetricCard` para dashboard.
- [x] Rotas-placeholder de todos os módulos (dashboard, processos, contratações, sites, fornecedores, cotações, relatórios).
- [x] Página de estados vazios/erro/carregamento padronizada.

### Critério de aceite
Navegação entre todos os módulos funciona; tema claro/escuro alterna; componentes base catalogados.

> **Commit final:** `feat: design system, app shell e navegação entre módulos`

---

## M2 — Processos & Cadastro de Objeto (UI) `[UI (mock)]`

- **Branch:** `feat/processos-ui`
- **Objetivo:** Telas de listagem e detalhe de processo e o cadastro estruturado do objeto, com dados mock.

### Entregas
- [x] Lista de processos (DataTable + filtros: status, responsável, data).
- [x] Cadastro de objeto via planilha Google Sheets (sincronização automática — UI mock; integração no M7). _(decisão: a entrada de dados é feita na planilha; a plataforma é leitora/orquestradora, sem formulário interno nesta fase)_
- [x] Tela de detalhe do processo com abas: Estratégia · Fontes · Evidências · Série de preços.
- [x] Classificação do item (comum / específico) na UI.
- [x] Fixtures de processos/itens para popular as telas.

### Critério de aceite
A lista mostra os processos da planilha (mock) com filtros; é possível abrir o detalhe com as abas; id inválido exibe estado de erro.

> **Commit final:** `feat: telas de processos e cadastro estruturado de objeto (mock)`

---

## M3 — Módulos de Fontes (UI) `[UI (mock)]`

- **Branch:** `feat/fontes-ui`
- **Objetivo:** Interfaces das três fontes de preço + orquestrador de estratégia, ainda com mock.

### Entregas
- [x] **Orquestrador de estratégia:** painel que sugere a ordem de busca por tipo de objeto.
- [x] **Contratações públicas similares:** busca/filtros, registro de aderência (alta/parcial/não aderente) com justificativa, comparador lado a lado.
- [x] **Sites admissíveis:** listas branca/cinza/vermelha, formulário com captura de URL + data/hora, alerta de marketplace bloqueado.
- [x] **Fornecedores:** cadastro vivo (CNPJ, contatos, categoria, cidade, responsável), badge de score, histórico.
- [x] Painel de evidência reutilizável (arquivo + metadados de data/hora).

### Critério de aceite
As três fontes têm UI completa e o orquestrador exibe recomendação coerente com o tipo de item (mock).

> **Commit final:** `feat: UI de contratações, sites, fornecedores e orquestrador (mock)`

---

## M4 — Cotações, Validação & Consolidação (UI) `[UI (mock)]`

- **Branch:** `feat/cotacoes-consolidacao-ui`
- **Objetivo:** Fechar o fluxo visual ponta-a-ponta: e-mails de cotação, checklist de proposta,
  série de preços e relatórios — tudo mock.

### Entregas
- [x] Seleção em lote de fornecedores + composição de e-mail por template (preview).
- [x] Painel de controle de cotações: status (positiva/negativa/incompleta/silenciosa), SLA, lembretes.
- [x] Checklist de validade da proposta (CNPJ, descrição, valor unit./total, data, responsável) com marcação válida/ressalva/inválida.
- [x] Tabela de série de preços com fonte por preço, método (média/mediana/menor valor) e exclusões.
- [x] Dashboard com MetricCards (processos em andamento, taxa de resposta, gargalos).
- [x] Telas de relatório resumido/completo e memória de cálculo (layout).

### Critério de aceite
Fluxo completo demonstrável em mock, do cadastro do objeto até a tela de memória de cálculo.

> **Commit final:** `feat: UI de cotações, validação de proposta, série de preços e relatórios (mock)`

---

## M5 — Banco de Dados & Camada de Dados `[BACKEND]`

- **Branch:** `feat/db-prisma`
- **Objetivo:** Modelar o domínio em Postgres via Prisma e preparar acesso a dados (ainda sem
  trocar as telas — seed alimenta o que antes era mock).

### Entregas
- [x] Postgres local (docker-compose) + `DATABASE_URL`.
- [x] `prisma/schema.prisma` com modelos: User, Processo, Item, Fonte, Evidencia, Fornecedor, Cotacao, Proposta, SeriePreco/PrecoConsolidado, AuditLog.
- [x] Migration inicial + `lib/db.ts` (singleton Prisma).
- [x] Script de seed com dados equivalentes às fixtures de UI.
- [x] Schemas Zod compartilhados em `lib/validations/` alinhados ao schema do banco.

### Critério de aceite
`prisma migrate` e `prisma db seed` rodam; dados visíveis via Prisma Studio.

> **Commit final:** `feat: schema Prisma, migration inicial e seed do domínio`

---

## M6 — Autenticação, RBAC & Auditoria `[BACKEND]`

- **Branch:** `feat/auth-rbac`
- **Objetivo:** Login real, sessões, permissões por papel e trilha de auditoria por usuário.

### Entregas
- [x] Login/logout + sessão (solução própria sobre Postgres/Prisma, conforme CLAUDE.md §2).
- [x] Papéis: pesquisa / revisão / aprovação + middleware de proteção de rotas.
- [x] Guarda de permissão em server actions sensíveis.
- [x] `AuditLog` gravado em ações relevantes (criação/edição/exclusão, mudança de status).
- [x] Onboarding mínimo (tela/checklist do fluxo correto de pesquisa).

### Critério de aceite
Acesso exige login; um usuário "pesquisa" não consegue aprovar; ações geram registro de auditoria.

> **Commit final:** `feat: autenticação, RBAC por papel e trilha de auditoria`

---

## M7 — Ligação Backend & Regras da IN 65/2021 `[CONFORMIDADE]` ✅ CONCLUÍDO

- **Branch:** `feat/backend-integracao`
- **Início:** 2026-06-14
- **Conclusão:** 2026-06-14
- **Base normativa:** [docs/regulamentos-cms.md](regulamentos-cms.md)
- **Objetivo:** Substituir o mock por dados reais via server actions e implementar a lógica de
  domínio com as regras de conformidade — o núcleo de maior risco.

### Entregas
- [x] Server actions de CRUD para processos, itens, fontes, fornecedores, cotações, propostas.
- [x] `lib/domain/`: estatística de preços (média/mediana/menor valor) **com testes unitários**.
- [x] Regras IN 65 aplicadas: preço só entra com fonte+data+evidência; ≥3 fornecedores na pesquisa direta; justificativa obrigatória ao não usar fonte pública; alerta de dispersão exigindo análise crítica.
- [x] Score de fornecedor (tempo de resposta + completude documental).
- [x] Validador de proposta server-side (checklist mínimo).
- [x] Upload de arquivos via abstração `lib/storage`.
- [x] Busca e filtros server-side (item, período, quantidade, localidade, fornecedor, aderência).
- [x] Telas de M2–M4 desligadas do mock e ligadas aos dados reais.

### Critério de aceite
Fluxo ponta-a-ponta com dados reais; testes de domínio passam; regras de conformidade bloqueiam
casos inválidos (provado por teste).

> **Commit final:** `feat: integração backend e regras de conformidade da IN 65/2021`

---

## M8 — E-mails, Notificações & Relatórios `[BACKEND]` ✅ CONCLUÍDO

- **Branch:** `feat/emails-relatorios`
- **Início:** 2026-06-14
- **Conclusão:** 2026-06-14
- **Objetivo:** Disparo real de cotações, controle de SLA/lembretes, notificações e exportação.

### Entregas
- [x] Integração Resend: envio de cotação por template parametrizável + registro de data/hora.
- [x] Controle de SLA + lembretes automáticos via Vercel Cron Job (`/api/jobs/lembretes`, hourly).
- [x] Registro do status de resposta e da relação de não respondentes (`lembreteEnviado` flag).
- [x] Notificações in-app (`AlertasBanner`): prazo, pendências documentais, falta de fonte pública, dispersão de preços.
- [x] Exportação: memória de cálculo em PDF (`@react-pdf/renderer`) e série de preços em Excel (`xlsx`).

### Critério de aceite
E-mail de cotação chega ao destinatário (ambiente de teste); lembrete dispara; relatórios exportam
com a série de preços e a memória de cálculo.

> **Commit final:** `feat: disparo de e-mails, SLA, notificações e exportação de relatórios`

---

## M9 — Hardening & Deploy `[ENTREGA]` ✅ CONCLUÍDO

- **Branch:** `chore/deploy`
- **Início:** 2026-06-14
- **Conclusão:** 2026-06-14
- **Objetivo:** Estabilizar, cobrir caminhos críticos com teste e publicar.

### Entregas

- [x] Testes E2E do fluxo principal (Playwright: login → dashboard → processos → cotações → relatórios).
- [x] Revisão de acessibilidade (axe-core WCAG 2.1 AA) e responsividade das tabelas/painéis.
- [x] Tratamento de erros (error boundaries) e estados de carregamento (skeleton loaders) padronizados em todo o app.
- [x] Variáveis de ambiente de produção documentadas no `.env.example`.
- [x] Build compatível com Vercel e hospedagem própria Node.js (sem DATABASE_URL na build).
- [x] README com instruções de operação e de deploy.

### Critério de aceite
Build de produção sobe; E2E do fluxo principal passa; aplicação acessível na URL de deploy.

> **Commit final:** `chore: hardening, testes E2E e deploy de produção`

---

## M10 — Pesquisa por Similaridade (TR → Contratos → Fornecedores) `[CONFORMIDADE]` ✅ CONCLUÍDO (com ressalvas — ver M11)

- **Branch:** `feat/pesquisa-similaridade`
- **Design:** [docs/superpowers/specs/2026-06-15-pesquisa-similaridade-design.md](superpowers/specs/2026-06-15-pesquisa-similaridade-design.md)
- **Objetivo:** Resolver o maior gargalo do fluxo real — encontrar contratações públicas
  similares com precisão suficiente para servir de justificativa formal — a partir do
  Termo de Referência (TR) e da planilha padrão que já é o registro mestre dos itens.

> Checklist revisado em 2026-07-23 lendo o código, não só os commits — o texto abaixo ficou
> desatualizado por meses em relação ao que já tinha sido entregue.

### Entregas

- [x] `lib/ia/`: client abstrato com `extrairEspecificacaoTR()` e `rankearSimilaridade()`.
  **Ressalva:** `getProvedorIA()` (`src/lib/ia/index.ts`) usa `OpenAIProvider` em produção, não
  `GeminiProvider` como planejado aqui; `GeminiProvider` existe no código mas não é instanciado.
  Decisão formal disso vai para o M11.
- [x] `lib/integracoes/pncp.ts` e `painelPrecos.ts`: clients tipados para as APIs públicas, com testes.
- [x] `lib/similaridade/`: orquestração do pipeline (extração → busca paralela → ranking),
  reaproveitando `priceStats.ts` e `in65Rules.ts` sem duplicar regras de conformidade.
- [x] Ranking de similaridade com 3 parâmetros ponderados (descrição semântica 40%, especificação
  técnica 35%, unidade/quantidade 25%) e corte de recência (>365 dias fora) — `scoreFinal.ts` e
  `filtroRecencia.ts`.
- [x] Busca de fornecedores diretos por nicho + camadas geográficas (Baixada Santista → SP →
  Sudeste → Sul → Centro-Oeste) — implementada em `lib/domain/buscarFornecedorPorCamada.ts` e
  `camadaGeografica.ts`, com testes. **Ressalva:** não é chamada por `pesquisaSimilaridade.ts` —
  sem fallback automático de fornecedor dentro da aba de similaridade ainda. Vai para o M11.
- [ ] Busca em sites eletrônicos restrita à lista branca já existente no módulo Sites, para itens
  de uso comum. **Não feito** — `lib/actions/sites.ts` só tem captura manual de evidência, nada
  no pipeline de similaridade consulta sites automaticamente. Vai para o M11.
- [x] Nova aba "Pesquisa por Similaridade" no detalhe do processo: upload de planilha + TR, caixa
  de diálogo de revisão por item, tabela resumo read-only pós-revisão.
- [x] Escrita de volta na planilha original — `lib/sheets/preencherPrecosPublicos.ts`, via Service
  Account real (`GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY`). Deixou de ser stub.
- [x] Remoção do disparo automático de e-mail via Resend em `criarCotacao` (a Câmara envia por
  fora do sistema); mantém apenas o registro de cotação/SLA.

### Critério de aceite
Para um TR + planilha de teste real, o sistema retorna candidatos a contrato público rankeados,
com os 3 parâmetros detalhados; edição na caixa de diálogo reflete na planilha original; nenhum
preço é promovido a `Fonte` sem ação manual do usuário. **Atendido**, com as duas ressalvas de
fornecedor/sites documentadas acima.

> **Commit final:** `feat: pesquisa de similaridade entre TR, contratos públicos e fornecedores`

---

## M11 — Fechamento de gaps & Prontidão para produção `[CONFORMIDADE / ENTREGA]`

- **Branch:** `feat/fechamento-m10-producao`
- **Objetivo:** Fechar as ressalvas deixadas pelo M10 e os gaps de prontidão para produção real
  identificados numa auditoria do código (não só dos testes passando) — sem esses itens, o
  sistema funciona mas tem lacunas silenciosas de cobertura e de observabilidade em produção.

### Entregas

- [x] Decidir e alinhar `lib/ia/` num único provedor: documentar formalmente por que
  `OpenAIProvider` é o usado em produção (ou migrar para `GeminiProvider`, conforme o design
  original) e remover o código morto do provedor não adotado. **Decisão:** manter
  `OpenAIProvider` — é o que já roda em produção (`getProvedorIA()` hardcoded), tem a
  dependência `openai` já instalada e testada, e não havia nenhum teste cobrindo
  `GeminiProvider`. Removidos `src/lib/ia/geminiProvider.ts`, `src/lib/ia/geminiClient.ts`, o
  export de `GeminiProvider` em `src/lib/ia/index.ts` e `GEMINI_API_KEY` do `.env.example`.
  `ProvedorIA` (`types.ts`) foi mantida como interface própria, não removida, para permitir
  trocar de provedor futuramente sem tocar em `lib/similaridade/`. **Ressalva:** a dependência
  `@google/genai` (`package.json`) ficou órfã após a remoção — não foi removida aqui porque
  alterar `package.json` exige autorização explícita do usuário (CLAUDE.md §8); fica pendente
  de aprovação numa próxima iteração.
- [x] **DESCARTADO** — Integrar o fallback de fornecedores por camada geográfica
  (`buscarFornecedorPorCamada.ts`) no pipeline de `pesquisaSimilaridade.ts`.
  **Justificativa (decisão de 2026-07-25):** a aba "Pesquisa por Similaridade" tem escopo
  deliberado de **contratações públicas similares** — a fonte prioritária da IN 65/2021. Misturar
  fornecedores diretos no mesmo pipeline confunde a hierarquia de fontes que o sistema existe para
  orientar (CLAUDE.md §1) e enfraquece a rastreabilidade: cada fonte tem exigências probatórias
  próprias (fornecedor direto exige ≥3 consultados e registro dos silentes). O módulo
  `fornecedores/` e o fluxo de cotações já cobrem essa via, com as guardas de conformidade certas.
  `buscarFornecedorPorCamada.ts` e `camadaGeografica.ts` **permanecem no código** — são testados e
  seguem disponíveis para o módulo de fornecedores; não são código morto.
- [x] **DESCARTADO** — Implementar a busca automática em sites da lista branca dentro do pipeline
  de similaridade.
  **Justificativa (decisão de 2026-07-25):** mesma razão acima, somada a um requisito de
  conformidade incompatível com automação: evidência de site exige **captura de data/hora de
  acesso** e arquivo armazenado (CLAUDE.md §1). Uma busca automática que só coleta preços produz
  registro sem valor probatório, e gerar evidência sintética violaria a regra de que nenhum preço
  entra na estimativa sem fonte+data+evidência real. O módulo `sites/` mantém a captura manual com
  validação de lista branca/cinza/vermelha e bloqueio de marketplace, que é o comportamento
  correto.
- [ ] Monitoramento de erro em produção (Sentry ou equivalente), complementando o `error.tsx`
  local que hoje só cobre a experiência do usuário, não a observabilidade da equipe.
- [x] Limpar `.env.example` (2026-07-25). Removidas as **8 variáveis mortas** diagnosticadas
  (`RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_RESPONSAVEL`, `BLOB_READ_WRITE_TOKEN`,
  `NEXT_PUBLIC_APP_URL`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SHEETS_PLANILHA_MODELO_ID`). O arquivo agora bate 1:1 com as 9 variáveis lidas em
  `src/`/`prisma.config.ts` mais as 2 de E2E, verificado por enumeração exaustiva de
  `process.env.*` no repositório — não pela lista do diagnóstico anterior.
  **Achado adicional:** `AGENTS.md` mandava configurar `NEXT_PUBLIC_APP_URL` e alertava que
  `RESEND_API_KEY=""` quebrava o build via `src/lib/email/client.ts` — módulo e dependência
  `resend` não existem mais (removidos com o §9.3), então o alerta descrevia um crash impossível
  e pedia variável que ninguém lê. Corrigido no mesmo commit. Os `docs/superpowers/plans/*`
  citam as variáveis antigas e foram **deixados como estão**: são registro histórico de
  milestones concluídas, não instruções vigentes.
- [x] Teste unitário para `src/lib/domain/alertas.ts` (único módulo de `lib/domain/` sem
  cobertura correspondente). **29 testes**, cobrindo as quatro categorias de alerta, as fronteiras
  de `diasRestantes` (-1/0/1/2), a ordenação por severidade e as strings exigidas pela IN 65/2021.
  Cobertura validada por teste de mutação na revisão: remover `"IN 65/2021"`, remover
  `"exige análise crítica"` ou quebrar a fronteira `<= 1` faz 5 testes falharem.
  **Bug corrigido no mesmo ciclo:** o id do alerta de dispersão derivava de `itemDescricao` (texto
  livre) e é usado como chave de dispensa em `AlertasBanner`. Dois itens com descrição idêntica
  colidiam, e dispensar um escondia o outro — suprimindo da tela um item que exige análise crítica.
  Passou a usar `seriePrecoId`: a query itera `SeriePreco` e `Item -> SeriePreco` é 1-N, então
  `itemId` reintroduziria a colisão para itens com duas séries acima do limiar de CV.
  **Pendência conhecida (não bloqueante):** o CV é formatado com `toFixed(1)`, gerando
  `"CV de 42.6%"` em UI pt-BR, onde o esperado seria `42,6%`. Dois testes fixam o formato atual;
  corrigir para `toLocaleString("pt-BR")` fará ambos falharem, sinalizando o ponto a atualizar.

- [x] **Regressão descoberta em 2026-07-25 e corrigida no mesmo dia:** as lições §9.8 (formato da
  URL de evidência do PNCP) e §9.9 (excluir o CNPJ do próprio órgão das buscas de similaridade)
  estavam **documentadas no CLAUDE.md mas nunca implementadas na `main`** — ficaram no commit
  `d781a16` (PR #9, branch do Cursor Agent), que foi deployado como preview e nunca mesclado.
  Em produção: toda evidência de contratação similar apontava para link inválido, e em processos
  de prorrogação o contrato sendo renovado podia servir de referência de preço para si mesmo.
  Reimplementadas na `main` atual (o commit órfão não era mesclável — trazia de volta o
  `GeminiProvider` removido no M11). URL validada abrindo o link real no portal, conforme a §9.8
  exige; CNPJ `49203409000102` confirmado como o da Câmara Municipal de Santos.

### Próximos passos (retomar por aqui)

1. **Limpar `.env.example`** — diagnóstico já feito em 2026-07-25. São **8 variáveis documentadas
   que o código nunca lê**: `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_RESPONSAVEL` (órfãs da remoção
   do módulo de e-mail — ver §9.3), `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_APP_URL`,
   `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` e
   `GOOGLE_SHEETS_PLANILHA_MODELO_ID`. Manter `E2E_EMAIL`/`E2E_PASSWORD` — são usadas em
   `e2e/auth.setup.ts`, fora de `src/`. As lidas de fato são: `ADMIN_MIGRATE_SECRET`,
   `AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`,
   `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_SHEETS_URL`, `OPENAI_API_KEY` e `ORGAO_CNPJ`.
2. **Monitoramento de erro em produção (Sentry ou equivalente)** — exige instalar dependência,
   o que precisa de autorização explícita do usuário (CLAUDE.md §8).

### Fora do M11 — pendências abertas em 2026-07-25

- **Rota `/api/admin/migrate` continua quebrada** com `Cannot find module 'effect'` (dependência
  transitiva de `@prisma/config` que ficou fora do bundle). Três ciclos de correção de tracing
  falharam — ver §9.18, §9.26, §9.28 e §9.29. **Não tentar uma quarta variação de glob.** O plano
  acordado é executar o SQL das migrations via `pg`: ler `prisma/migrations/*/migration.sql`,
  comparar com a tabela `_prisma_migrations` e aplicar o pendente em transação, sem subprocesso
  nem CLI empacotado. Não bloqueia nada — o canal manual funciona (editar `DIRECT_URL` no `.env`
  local, rodar `pnpm prisma migrate deploy`, reverter), e foi assim que a migration pendente foi
  aplicada em 2026-07-25.
- **Senha do banco Supabase precisa ser rotacionada** — foi exposta durante a sessão de
  2026-07-25 e chegou a passar por dois arquivos versionados antes de ser removida. Verificado que
  **nunca entrou em nenhum commit** (`git log --all -S`), mas a credencial está comprometida.
  Trocar em Supabase → Settings → Database → Reset database password, e atualizar **as duas**
  variáveis na Vercel (`DATABASE_URL` com o Transaction pooler na porta 6543 e `DIRECT_URL` com a
  conexão direta na 5432 — ver §9.32), seguido de redeploy.

### Pendências conhecidas (não bloqueantes)

- **Formatação do CV em pt-BR:** `alertas.ts` usa `toFixed(1)`, gerando `"CV de 42.6%"` onde a UI
  pt-BR esperaria `42,6%`. Dois testes fixam o formato atual e sinalizarão o ponto exato quando
  for corrigido para `toLocaleString("pt-BR")`.
- **Worktrees não herdam `.env`** (é gitignored), então `pnpm build` falha neles em "collecting
  page data" com `DATABASE_URL environment variable is not set`. Contornável com variável dummy
  inline; vale decidir se o build deve ser resiliente a isso ou se basta documentar.

### Critério de aceite
Cada ressalva do M10 está ou implementada ou formalmente descartada (com justificativa registrada
neste arquivo); `.env.example` bate 1:1 com as variáveis lidas em `src/`; erros em produção geram
alerta rastreável, não só uma tela de erro local; `pnpm test` cobre `alertas.ts`.

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
| M10 | `feat/pesquisa-similaridade` | Conformidade | TR → contratos similares → fornecedores, via IA |
| M11 | `feat/fechamento-m10-producao` | Conformidade/Entrega | Fecha ressalvas do M10 + observabilidade em produção |
