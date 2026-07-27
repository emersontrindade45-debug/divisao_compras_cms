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
- [x] Monitoramento de erro em produção (**Sentry**, commit `2902c9e`), complementando o `error.tsx`
  local que só cobria a experiência do usuário, não a observabilidade da equipe. `@sentry/nextjs`
  10.68.0. Arquivos: `src/instrumentation.ts` (`register()` por runtime + `onRequestError`, que
  cobre Server Components, route handlers e server actions), `src/sentry.server.config.ts`,
  `src/sentry.edge.config.ts` e `src/instrumentation-client.ts`. `SegmentError` passou a reportar
  o erro e a exibir o `digest` — único elo entre a tela do usuário e o evento no Sentry.
  **Inerte sem DSN**, verificado empiricamente nos dois estados: sem `SENTRY_DSN` nada é
  inicializado e nada é enviado; com DSN o evento chega ao client com a mensagem preservada.
  `withSentryConfig` **não** foi adicionado (justificativa no `next.config.ts`): serve a source
  maps/releases e exigiria `SENTRY_AUTH_TOKEN` no build — acoplá-lo agora contrariaria a inércia.
  Consequência aceita: stack trace de erro **de client** vem minificada até alguém configurar o
  token; erro de servidor, o caso crítico, não depende de source map.
  **Pendente do usuário:** criar o projeto no Sentry e definir `SENTRY_DSN` e
  `NEXT_PUBLIC_SENTRY_DSN` na Vercel — até lá a integração fica dormente, sem risco.
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

> **ESTADO EM 2026-07-25 (sessão da noite) — ambiente RESTAURADO, migrations COMMITADAS.**
>
> **O ambiente local voltou a funcionar** — sem reboot e sem elevação. O aviso anterior aqui
> prescrevia "reiniciar o computador" com base num diagnóstico errado: `whoami /priv` **nunca** vai
> listar `SeCreateSymbolicLink` neste PC (conta admin + processo não elevado ⇒ UAC marca
> `BUILTIN\Administradores` como "usado apenas para negar"), embora symlinks funcionem normalmente
> via Modo de Desenvolvedor. A máquina chegou a ser reiniciada e o output seguiu vazio.
> Causa real do `EACCES`: o `pnpm add @sentry/nextjs` abortado deixou 30 pacotes em
> `node_modules/.ignored_*` (entre eles `next` e `vitest`) e reparse points órfãos apontando para
> binários de Linux. Corrigido com `Remove-Item node_modules -Recurse -Force` + `pnpm install` +
> `pnpm prisma generate`. Lições reescritas: **§9.36** (rebuild da árvore) e **§9.37** (testar a
> capacidade, não o proxy).
>
> **Verificação completa executada e verde:** `pnpm test` (44 suítes, **255 testes**),
> `pnpm lint` (0 erros — 2 warnings pré-existentes, alheios a estes arquivos), `pnpm typecheck`
> (limpo) e `pnpm build` (compila e gera as 15 páginas estáticas).
>
> **Rota `/api/admin/migrate` commitada em `736dd06`** (local, **sem push**).
>
> **`@sentry/nextjs` 10.68.0 instalado e integrado em `2902c9e`** — o `pnpm add` que havia quebrado
> o ambiente rodou sem incidente depois do rebuild, confirmando que a árvore estava sã. Com isso o
> **M11 fica com todas as entregas fechadas**; resta apenas ação do usuário (criar o projeto no
> Sentry e definir os DSNs na Vercel).
>
> **BLOQUEIO ATIVO PARA O PUSH (2026-07-25, ~20h30): o build não passa.**
> `pnpm build` falha em `src/app/(app)/processos/[id]/page.tsx:134`: `ProcessoTabs` passou a exigir
> a prop `conformidade` (`ConformidadeProcesso`), e nem a página nem
> `src/components/processos/__tests__/ProcessoTabs.test.tsx` a passam. É trabalho **em andamento do
> usuário** — ligação do agregador de conformidade (`b607853`) à UI, junto com os componentes ainda
> não rastreados `ProcessoStepper.tsx`, `EtapaPesquisa.tsx`, `EtapaValidacao.tsx` e
> `EtapaConsolidacao.tsx`. **Não corrigir por conta:** de onde a `conformidade` deve vir na página
> é decisão de desenho, não erro mecânico.
> Enquanto isso não fechar, **não há push** — subir com o build quebrado derrubaria a produção, que
> hoje está saudável.
>
> Já corrigido nesta sessão (`73b35ce` + commits do usuário): `PageHeader` usado sem import em 6
> páginas e imports fora do topo em `CapturaForm.tsx` (usava `cn()` em escopo de módulo — o
> Turbopack não resolve nessa ordem, embora o `tsc` aceite por hoisting).

1. **Limpar `.env.example`** — diagnóstico já feito em 2026-07-25. São **8 variáveis documentadas
   que o código nunca lê**: `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_RESPONSAVEL` (órfãs da remoção
   do módulo de e-mail — ver §9.3), `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_APP_URL`,
   `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` e
   `GOOGLE_SHEETS_PLANILHA_MODELO_ID`. Manter `E2E_EMAIL`/`E2E_PASSWORD` — são usadas em
   `e2e/auth.setup.ts`, fora de `src/`. As lidas de fato são: `ADMIN_MIGRATE_SECRET`,
   `AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`,
   `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_SHEETS_URL`, `OPENAI_API_KEY` e `ORGAO_CNPJ`.
   **FEITO em 2026-07-25** (commit `c96efb3`). Achado extra no mesmo commit: `AGENTS.md` mandava
   configurar `NEXT_PUBLIC_APP_URL` e alertava sobre um crash de `RESEND_API_KEY=""` via
   `src/lib/email/client.ts` — módulo e dependência `resend` já não existem, então a instrução
   pedia variável morta e descrevia um crash impossível. Corrigido.
2. **Monitoramento de erro em produção — Sentry. FEITO em 2026-07-25** (commit `2902c9e`).
   `@sentry/nextjs` 10.68.0 instalado (autorização do usuário registrada; §8 satisfeito) e o
   desenho combinado implementado por inteiro: `instrumentation.ts` + `instrumentation-client.ts`,
   o `error` antes ignorado agora é reportado nos dois boundaries, e a integração fica **inerte
   sem `SENTRY_DSN`** — confirmado por build verde sem DSN e sem auth token. Detalhes na entrega
   correspondente acima.
   **Resta só a ação do usuário:** criar o projeto no Sentry e definir `SENTRY_DSN` e
   `NEXT_PUBLIC_SENTRY_DSN` na Vercel (+ redeploy, §9.32). Sem isso a integração fica dormente e
   nada quebra.

### Fora do M11 — pendências abertas em 2026-07-25

- **Rota `/api/admin/migrate` — reescrita, VERIFICADA e COMMITADA (`736dd06`, local, sem push).**
  A correção acordada (SQL via `pg`, sem CLI empacotado) passou por `pnpm test`/`lint`/`typecheck`/
  `build`, todos verdes, e foi commitada em 2026-07-25.

  > **ESTADO AO FIM DA SESSÃO DE 2026-07-25 (~21h40 local) — FALTA UM PASSO SÓ.**
  >
  > Tudo publicado e sincronizado: `main` local = `origin/main` = `dacc34a`, working tree limpo,
  > deploy `dpl_9Ke8x5J` `READY` com o alias de produção. Aplicação **saudável e exercitada**:
  > nas últimas 2h serviu `/dashboard`, `/cotacoes`, `/fornecedores` e páginas de processo com
  > CUIDs reais (só renderizam lendo do Postgres) — `get_runtime_errors` sem nenhum erro.
  >
  > **O que falta:** corrigir a `MIGRATE_URL` na Vercel e rodar o `GET`. A string que o usuário
  > tem está no **Transaction pooler** e precisa ir para o **Session pooler**:
  >
  > | | está | precisa ficar |
  > |---|---|---|
  > | porta | `6543` | **`5432`** |
  > | usuário | `postgres.projeto` (placeholder?) | `postgres.bybkhnxxtbdcggfuatxc` |
  >
  > Host `aws-0-sa-east-1.pooler.supabase.com` está correto. Senha sem colchetes e com
  > URL-encoding se tiver caractere especial (`@`→`%40`, `#`→`%23`, `/`→`%2F`).
  > **Não mexer na `DATABASE_URL`** — ela fica na 6543 mesmo (Transaction é o certo para a app).
  > Depois de salvar: **redeploy** (§9.32); não precisa de push, o código já está no ar.
  >
  > **Progresso do diagnóstico (cada erro foi um passo à frente, não um retrocesso):**
  > `401` (sem segredo) → `ENOTFOUND` (rede: host IPv6-only, §9.43) → `password authentication
  > failed for user "postgres"` (autenticou e conectou; só falta o ref no usuário). O próximo erro,
  > se houver, deve ser lido do mesmo jeito: **como** a mensagem nomeia o usuário diz se o problema
  > é o ref (`"postgres"` = falta o ref) ou a senha (`"postgres.bybkh…"` = ref ok).
  >
  > **DEPLOY CONFIRMADO (2026-07-25, 23:38 UTC): a rota nova está no ar.**
  > `dpl_7r3Ke8JVbepAre1eu5RwMRV9s6GP`, `readyState: "READY"` **e** `alias` contendo
  > `divisao-compras-cms.vercel.app` — os dois critérios da §9.21, não sondagem HTTP.
  > `git ls-remote origin main` = `1d20de5…`, o commit verificado. `lambdaRuntimeStats`
  > `{"nodejs":3}` (3 lambdas — sem o inchaço de §9.26). `get_runtime_errors` na última hora: zero.
  >
  > **Falta só executar o `GET`** — depende de `ADMIN_MIGRATE_SECRET`, que existe apenas na Vercel
  > e não é acessível ao agente. Comando pronto para o usuário (PowerShell):
  > `$s = "<segredo>"; curl.exe -s -H "Authorization: Bearer $s" https://divisao-compras-cms.vercel.app/api/admin/migrate`
  > Resposta esperada: `total: 4` e `aplicadas` com as 4 migrations
  > (`20260614155015_init`, `20260616003933_add_resultado_similaridade`,
  > `20260617134642_add_planilha_origem_url`, `20260724115912_add_fonte_resultado_similaridade_unique`),
  > `pendentes: []` e `orfas: []`. **É esse resultado que valida a hipótese ainda em aberto** — se o
  > formato de `_prisma_migrations` derivado do contrato do Prisma bate com o banco real.
  > Divergência aqui (ex.: `aplicadas` vazio num banco que tem as migrations) indica que a leitura
  > da tabela precisa de ajuste, e é o sinal para **não** usar o `POST`.
  > Nota: o 401 da rota é idêntico para "sem header" e "header errado" — não serve para inferir se
  > o segredo está configurado.
  >
  > **RESOLVIDO em 2026-07-25 (~20h40): push feito.** `5250baa..1d20de5` — 13 commits publicados,
  > incluindo a rota reescrita. O commit `1d20de5` foi verificado **isoladamente**, num worktree
  > limpo com `pnpm install` próprio (não o `node_modules` do projeto): 311 testes (49 suítes),
  > typecheck limpo, lint 0 erros, build completo. O isolamento importa porque o working tree tinha
  > trabalho não commitado que não iria junto — verificar na mistura daria falso positivo (§9.28).
  > Nota: um junction de `node_modules` apontando para fora da raiz **não** funciona — o Turbopack
  > recusa com `Symlink [project]/node_modules is invalid, it points out of the filesystem root`.
  > O worktree precisa de `pnpm install` + `pnpm prisma generate` próprios.
  >
  > **Correção de escopo sobre o `GET`:** ele **não é estritamente read-only**. `lerRegistros()`
  > executa `CREATE TABLE IF NOT EXISTS "_prisma_migrations"` antes do `SELECT`, para que a rota
  > funcione num banco novo. É idempotente e inofensivo num banco que já tem migrations aplicadas,
  > mas descrevê-lo como "somente leitura" era impreciso.
  >
  > **CAUSA RAIZ do item 3 (investigada em 2026-07-25, noite): produção está defasada.**
  > O deploy de produção é o commit `5250baa`; a rota nova nunca chegou lá. Verificado lendo o
  > código publicado (`git show 5250baa:src/app/api/admin/migrate/route.ts`): ainda é a versão do
  > CLI, com `spawnSync`/`NODE_PATH`/`existsSync`. **Rodar o `GET` contra produção hoje testaria a
  > implementação antiga** e não responderia à pergunta do item 3 (validar o formato de
  > `_prisma_migrations` da implementação nova). A ordem correta é: push → deploy → só então o
  > `GET`. O 401 que a rota retorna hoje **não** distingue "segredo ausente" de "header errado" —
  > é fail-closed nos dois casos —, então não serve para inferir se `ADMIN_MIGRATE_SECRET` existe.
  >
  > **Correção de diagnóstico:** os erros `P1001`/`P1000` de banco vistos no `get_runtime_errors`
  > são **históricos**, de 10:50–11:00 UTC, atribuídos a `dpl_FP6ht` (deploy de 10:57). O deploy
  > atual é de 17:15 UTC — mais de 6h depois — e não registrou nenhum erro. Antes de mais nada eu
  > os havia apresentado como estado atual; estava errado.
  > **O banco de produção está funcionando**, e a prova não é "deu 200" (§9.30): nas últimas 6h a
  > produção serviu `/dashboard`, `/processos`, `/cotacoes`, `/fornecedores` e — decisivo — páginas
  > de detalhe com CUIDs reais (`/processos/cmqfcgkj7000004l8xx75eqyf`), que só renderizam se o
  > registro veio do Postgres. Agrupar logs por `requestPath` é o que torna essa distinção visível.
  Arquivos: `src/lib/migrations/aplicar.ts` (lógica pura), `.../\_\_tests\_\_/aplicar.test.ts`
  (18 testes), `src/app/api/admin/migrate/route.ts` (reescrito), `next.config.ts`.
  Decisões tomadas: **uma transação por migration** (escolha do usuário — mesmo comportamento de
  `prisma migrate deploy`, mantém os dois canais intercambiáveis); para na primeira falha; usa
  `DIRECT_URL` (DDL exige sessão estável), com `DATABASE_URL` como fallback; `GET` = status
  read-only, `POST` = aplica. Os 8 globs de tracing do CLI em `next.config.ts` viraram **um**
  (`./prisma/migrations/**`) — some a causa raiz de §9.26 e §9.28.
  **Cobertura validada por mutação** (§9.35): remover o `break` da falha quebra 1 teste; desativar
  o ROLLBACK no executor fake **não quebrava nada** até ser adicionado o caso que falha no `INSERT`
  (com falha no primeiro comando nada chega a ser encenado, e o teste passava por motivo errado).
  **Pendência de verificação real:** o formato de `_prisma_migrations` foi derivado do contrato do
  Prisma, **sem conferir contra o banco de produção** — o `.env` local aponta para localhost e não
  se traz credencial de produção para a sessão. Por §9.23 e §9.31, tratar como **hipótese não
  verificada** até rodar o `GET` (read-only, seguro) contra produção e comparar a lista de
  aplicadas com o que o `migrate status` manual reporta. Só depois disso usar o `POST`.
  Não bloqueia nada — o canal manual segue funcionando (editar `DIRECT_URL` no `.env` local, rodar
  `pnpm prisma migrate deploy`, reverter), e foi assim que a migration pendente foi aplicada.
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

## M12 — Arquitetura de informação & Layout `[UX]` ✅ CONCLUÍDO

- **Branch:** `main` (fases commitadas individualmente)
- **Início / Conclusão:** 2026-07-25
- **Objetivo:** A aplicação funcionava, mas apresentava as etapas de um funil sequencial (o
  "Fluxo operacional alvo" do PRD) como **8 itens de menu paralelos**, sem hierarquia. O
  servidor não tinha como saber por onde começar nem quando a pesquisa já bastava.
  Princípio adotado: **o processo é o centro; as fontes são etapas dele, não destinos irmãos.**

### Entregas

- [x] **Fase 0 — `lib/domain/conformidade.ts` + `filaTrabalho.ts`.** `avaliarConformidade()`
  agrega as regras já existentes (`in65Rules`, `priceStats`) num retrato por processo: estado
  das 4 etapas, checklist de conformidade e etapa atual. Nunca reimplementa regra — delega e
  traduz `Violation` em item de checklist. Unificou o limiar de CV divergente em duas
  constantes documentadas: `CV_PRE_ALERTA` (25, alerta antecipado) e `CV_ANALISE_CRITICA`
  (30, regra R-06). **Validado por mutação:** suficiência `>=3 → >=2` quebra 3 testes; remover
  a propagação do bloqueio R-02 quebra 2; remover o filtro de concluídos da fila quebra 1.
- [x] **Fase 1 — Sidebar em blocos.** `NAV_GROUPS`: Operação (dashboard, processos, cotações),
  Cadastros (fornecedores, sites), Consulta (contratações públicas, relatórios). "Guia de uso"
  saiu do nav para o `UserMenu` — é ajuda, não destino de trabalho.
- [x] **Fase 2 — `PageHeader` e `SELECT_CLASS` compartilhados.** O header estava duplicado nas
  7 páginas; o `SELECT_CLASS`, em 6 componentes com variações de largura.
- [x] **Fase 3 — Stepper de 4 etapas no detalhe do processo.** ① Estratégia ② Pesquisa de preços
  ③ Validação ④ Consolidação, com estado derivado dos dados (nunca coluna nova — sem migration).
  Similaridade + fontes + evidências se fundiram na etapa ②. A etapa ③ é conteúdo novo
  (cotações, checklist de propostas, não-respondentes) sobre dados que `obterProcessoDetalhado`
  já carregava e a tela não exibia. Deep-link `?etapa=`, com precedência validada por mutação.
- [x] **Fase 4 — `ConformidadePanel`.** Checklist vivo da IN 65/2021 em aside sticky, cada linha
  ligando à etapa onde a pendência se resolve. Alimentado só por `avaliarConformidade()`.
- [x] **Fase 5 — Dashboard acionável.** MetricCards viram links para listas filtradas
  (`processos/page.tsx` passou a ler `searchParams`, que a página ignorava embora
  `listarProcessos` já aceitasse). O card "Resumo de processos" (redundante) deu lugar à fila
  de trabalho ordenada por urgência.
- [x] **Fase 6 — Limpeza.** Removidos `CotacoesTable`, `CotacoesFilters`, `MemoriaCalculo`
  (órfãos). Botões "Lembrar"/"Ver" sem handler viraram indicador informativo. A aba "Memória de
  cálculo" saiu do hard-code em `[0]` e lista todos os processos. Onboarding perdeu os checks
  verdes falsos (`idx < 2`) e teve duas instruções obsoletas corrigidas.

### Critério de aceite
`pnpm lint`, `typecheck`, `test` (317 testes) e `build` verdes em cada fase.
**Pendente de validação visual pelo usuário** — o agente não teve acesso a navegador nesta
sessão (CLAUDE.md §7); a conferência de layout no browser é o único item não verificado.

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
| M12 | `main` | UX | Sidebar em blocos, stepper de etapas, painel de conformidade, dashboard acionável |
| M13 | `main` | Conformidade/UX | Assistente de pesquisa: chat com PNCP + web (OpenAI e Perplexity), candidatos e justificativas |

---

## M13 — Assistente de pesquisa (OpenAI + Perplexity) — EM ANDAMENTO

**Problema.** O pipeline de similaridade do M10 faz uma passada só: extrai o TR, deriva um termo,
consulta o PNCP, rankeia e grava candidatos. Quando o termo sai genérico ou o PNCP não devolve nada
aderente, o fluxo trava — não há como refinar de dentro do sistema. Some-se a isso que o Painel de
Preços está desativado (`painelPrecos.ts` é stub), então **o PNCP é a única fonte automática**, e a
web aberta, onde o servidor de fato pesquisa, não tem porta de entrada na plataforma.

**Decisões com o usuário (2026-07-27).** Um chat só, com os motores como ferramentas (o usuário
nunca escolhe o motor); busca web **por dois caminhos** — `web_search` nativo da OpenAI e Perplexity
Sonar; chat por processo (persistido) **e** atalho global; o assistente **grava candidato e nunca
Fonte**; instruções de pesquisa editáveis em **três níveis** (global + categoria + processo);
formaliza justificativa de aderência, metodológica/memória de cálculo e de rota/fornecedores.

**Ressalva de escopo.** O `CLAUDE.md` §6 e o PRD listavam "Chat/Mensagens" como fora de escopo —
aquilo é chat *entre pessoas*, não assistente de IA. Ambos os documentos foram corrigidos na fase
13.0 com aviso explícito para o módulo não ser removido por engano (modo de falha da §9.33).

### Fase 13.0 — Escopo — CONCLUÍDA
- [x] Ressalva registrada em `CLAUDE.md` §6 e no `PRD-Claude_divisão_compras.md`.

### Fase 13.1 — Fundação — PARCIAL
- [x] Schema + migration `20260727104500_add_assistente_pesquisa`: models `ConversaAssistente`,
      `MensagemAssistente`, `InstrucaoPesquisa`; enums `OrigemResultado`, `PapelMensagem`,
      `EscopoInstrucaoPesquisa`; `site_eletronico` em `TipoCandidatoSimilaridade`; colunas `origem`,
      `conversaId` e `termoBuscaUsado` em `ResultadoSimilaridade`. SQL gerado por `prisma migrate
      diff` (não escrito à mão). **Ainda não aplicada em banco algum** — ver pendências.
- [x] `domain/orgaoProprio.ts`: exclusão do CNPJ do próprio órgão promovida de privada do
      `pncp.ts` a fonte única, para que a busca web herde a regra (§9.9 + §9.33).
- [x] `domain/tipoFonteSimilaridade.ts`: `podePromoverCandidato` recusa promover achado de site
      eletrônico a Fonte — a evidência sairia com data/hora da promoção, não do acesso real.
- [x] `integracoes/perplexity.ts`: `fetch` + Zod (sem dependência nova), com
      `search_domain_filter` (lista branca/vermelha, teto de 20) e `search_recency_filter: year`.
- [x] `assistente/guardas.ts`: filtro de órgão próprio, lista vermelha por sufixo de domínio e
      relato dos descartes.
- [x] `assistente/instrucoes.ts`: composição global → categoria → processo, com chave única.
- [x] `assistente/laco.ts`: laço agentico com orçamento de 8 passos/turno, fechamento obrigatório
      ao esgotar e tolerância a falha de ferramenta.
- [x] `ia/assistenteOpenAI.ts` — Responses API (não `chat.completions`: só ela mistura o tool
      hospedado `web_search` com function tools na mesma requisição). Modelo configurável por
      `OPENAI_ASSISTENTE_MODEL`, padrão `gpt-5.4-mini` — escolhido consultando `GET /v1/models`
      na conta real, não de memória. Descoberta relevante: o `web_search` da OpenAI só aceita
      `allowed_domains`, sem denylist, o que confirma a necessidade da lista vermelha em código.
- [x] `assistente/promptSistema.ts` — regras de conformidade no prompt para o modelo *entender*
      o terreno; o cumprimento continua em código.
- [x] `assistente/ferramentas.ts` — registry com os executores. Duas decisões estruturais:
      **(a) o modelo nunca digita um preço** — `registrar_candidatos` aceita apenas IDs de
      candidatos que uma busca da própria conversa devolveu (catálogo em memória do registry);
      id desconhecido é recusado, então valor, órgão e data vêm sempre da fonte. **(b) o modelo
      nunca atribui um score** — a escrita roda o mesmo `rankearCandidatos` do pipeline automático
      (filtro de recência da IN 65 + corte por score mínimo), o que mantém candidato do assistente
      e candidato do robô comparáveis na mesma tabela. Escreve só `ResultadoSimilaridade`; nunca
      `Fonte`, `Evidencia`, `SeriePreco` ou `PrecoConsolidado`. Numa conversa de processo o escopo
      é fixo: ler ou escrever em outro processo é recusado.
- [x] `assistente/carregarInstrucoes.ts` — leitura dos 3 niveis. `ClassificacaoItem` só tem
      `comum`/`especifico` e não serve de categoria de pesquisa; o casamento do nível "categoria"
      é textual contra objeto + descrição dos itens + palavras-chave. Separado de `instrucoes.ts`
      para aquele módulo seguir puro e testável sem mock de Prisma.
- [x] `app/api/assistente/chat/route.ts` — SSE. `getCurrentUser` (401 JSON) em vez de
      `requireAuth`, que redireciona e devolveria HTML no lugar do stream. O `conversaId` vem do
      cliente, então o dono é validado — sem isso qualquer usuário autenticado leria a conversa de
      outro pelo id. Só mensagens `user`/`assistant` voltam ao modelo: as `tool` de turnos
      anteriores são JSON bruto de busca, caro em token e já resumido pelo assistente. Falha vai
      **pelo stream**, não por status HTTP — o 200 já saiu com o primeiro evento, e lançar deixaria
      o cliente com stream truncado e nada na tela. `maxDuration = 60` (teto do plano Hobby,
      aceito em todos).

### Fase 13.2 — UI — CONCLUÍDA
- [x] `lib/assistente/sse.ts` — parser de Server-Sent Events, puro e sem DOM. Separado do
      componente porque é a parte mais fácil de errar (um chunk TCP corta o `\n\n` no meio) e a
      mais difícil de testar dentro do React. Duas armadilhas cobertas por teste: a sobra parcial
      do buffer precisa voltar na próxima chamada, e o `TextDecoder` precisa de `stream: true`
      senão acento partido entre chunks vira `�`.
- [x] `components/ui/textarea.tsx` — escrito à mão no molde de `input.tsx`. A Base UI não expõe
      primitivo de textarea (`@base-ui/react/input` é só para `<input>`), e o CLI do shadcn
      instalaria a variante do Radix, mexendo no `package.json` (§8).
- [x] `components/assistente/AssistenteChat.tsx` — chat único, usado nos dois escopos. Rastro de
      ferramentas em linguagem de servidor ("Buscando contratações no PNCP", não `buscar_pncp`):
      o rastro existe para auditar de onde veio cada afirmação da IA, e nome interno não cumpre
      essa função. `AbortController` cancela o stream na desmontagem — sem isso o turno seguiria
      consumindo tokens com o painel fechado.
- [x] `components/assistente/PassoFerramenta.tsx` — um passo do rastro, com estado
      andamento/sucesso/erro e o termo pesquisado extraído dos argumentos.
- [x] `components/assistente/AssistenteSheet.tsx` — gatilho em painel lateral.
- [x] `actions/instrucoesPesquisa.ts` + `InstrucoesPesquisaForm.tsx` +
      `app/(app)/assistente/instrucoes/page.tsx` — os 3 níveis. Escrita exige
      `requireRole("revisao")`: o texto entra no prompt de toda busca e todo ranking, então quem
      edita altera o critério de similaridade de **todos** os processos. `upsert` sobre a chave
      `@unique`, não busca-depois-grava (§9.14). Desativa em vez de apagar — a instrução já
      influenciou rankings anteriores, e apagá-la deixaria o histórico sem explicação.
- [x] `navigation.ts` ganha "Instruções de pesquisa"; `Topbar` ganha o atalho global.

**Desvio do plano aprovado, deliberado:** o plano previa uma **aba** no detalhe do processo; foi
feito **painel lateral**. Motivo concreto: as abas daquela tela SÃO as 4 etapas do fluxo da IN
65/2021 (`EtapaId`, consumido por `conformidade.ts` e pelo `ProcessoStepper`), e uma quinta aba
não-etapa distorceria um tipo do qual a conformidade depende. O painel também serve melhor ao uso
real — o servidor conversa enquanto continua vendo a lista de candidatos por trás. O gatilho ficou
no `ProcessoHeader`, que ganhou um slot `acoes`.

### Fase 13.3 — NÃO INICIADA
Os três tipos de `rascunhar_justificativa` (aderência da fonte, metodologia da série, rota e
escolha de fornecedores).

### Verificação até aqui
`tsc --noEmit` exit 0 · `eslint` 0 erros (2 warnings pré-existentes) · `next build` compilou e
listou `/api/assistente/chat` · **473 testes em 60 arquivos** (eram 429 em 57 ao fim da fase
anterior; 321 em 50 no início do M13).

Mutações confirmadas — cada guarda foi desligada e os testes falharam. Fases anteriores: exclusão do
órgão próprio (6 falhas), casamento de domínio da lista vermelha (5), recusa de promoção de site
eletrônico (2, no domínio **e** na action). Fase 13.1, seis mutações com mapeamento 1:1:

| Guarda desligada | Teste que caiu |
|---|---|
| Checagem de id desconhecido em `registrar_candidatos` | 2 testes (recusa de id forjado + isolamento entre conversas) |
| Escopo de processo na escrita | "recusa escrever em item de outro processo" |
| `filtrarResultadosWeb` na busca web | "descarta resultado de domínio da lista vermelha" |
| Gate `perplexityConfigurada()` | "não é anunciada quando a Perplexity não está configurada" |
| Dono da conversa na rota SSE | "recusa conversa de outro usuário" |
| Filtro de mensagens `tool` no histórico | "não reenvia ao modelo as mensagens `tool`" |

Armadilha encontrada nos testes da rota: o corpo de um `ReadableStream` roda **depois** que `POST`
retorna. Asserir sobre gravação ou auditoria sem drenar o stream testa uma corrida — dois testes
passavam por sorte de ordenação de microtask. O helper `postCompleto` consome o stream antes de
asserir.

Artefato do ambiente, não do código: `next build` rodado pelo PowerShell com `2>&1` sai com código 1
mesmo compilando, porque o aviso de deprecação do `middleware` vira error record do PowerShell. A
evidência de sucesso é o `✓ Compiled successfully` seguido da tabela de rotas — não o exit code.

### Pendências

1. ~~**Ruído de CRLF na árvore de trabalho.**~~ **RESOLVIDA (2026-07-27).** `.gitattributes` com
   `* text=auto eol=lf`; os 10 arquivos convertidos no mesmo commit. Árvore ficou com 0 arquivos
   modificados. `text=auto` preserva a detecção de binário do git, o que protege
   `docs/ATO2017_2023.md` (UTF-8 com 834 bytes NUL). Regra explícita para
   `prisma/migrations/**/*.sql`: o checksum em `_prisma_migrations` é do conteúdo do arquivo, e
   renormalizar migration já aplicada faria o `migrate deploy` recusá-la.

2. ~~**Migration não aplicada / sem banco de desenvolvimento.**~~ **RESOLVIDA em dev
   (2026-07-27).** A causa raiz não era a `MIGRATE_URL`: era a **ausência de banco de dev**, que
   fazia toda migration estrear em produção — origem comum das lições §9.19, §9.31 e §9.43.
   Postgres 18.4 instalado nativamente no WSL com a mesma configuração do `docker-compose.yml`
   (usuário `postgres`, base `divisao_compras`, porta 5432), então o `.env` valeu sem alteração.
   Documentado no README.
   Verificado:
   - `prisma migrate deploy` → as 5 migrations aplicam; `migrate status` responde
     **`Database schema is up to date!`**.
   - **O caminho de produção foi testado à parte.** `migrate deploy` não exercita o runner próprio
     (`src/lib/migrations/aplicar.ts`), que envolve cada migration em **uma transação** — onde mora
     o risco do `ALTER TYPE ... ADD VALUE`. Num banco descartável, com as 4 migrations anteriores
     aplicadas, a do M13 rodou via `psql --single-transaction` e passou; o valor `site_eletronico`
     é utilizável após o commit.
   - A constraint de unicidade da instrução global foi provada empiricamente: a segunda linha
     `chave='global'` é rejeitada pelo banco. E a contraprova confirma o desenho —
     `UNIQUE(escopo, categoria, processoId)` **aceita duas linhas globais** quando as colunas
     anuláveis são NULL.
   - `prisma db seed` rodou **a partir do Windows** contra o Postgres do WSL: 8 processos,
     8 fornecedores, 12 sites (5 na lista vermelha). Confirma que a app alcança o banco.

   **Continua aberto:** aplicar em **produção**. Depende da correção da `MIGRATE_URL` na Vercel
   (porta 6543 → 5432, usuário `postgres.projeto` → `postgres.bybkhnxxtbdcggfuatxc`), que é ação
   do usuário no painel (§8). Só então vale a §9.19.

3. **`PERPLEXITY_API_KEY`** no `.env` e na Vercel — depende do usuário. Sem ela a ferramenta se
   auto-desabilita e o assistente segue com PNCP e busca web da OpenAI, então não bloqueia.
   `OPENAI_ASSISTENTE_MODEL` é opcional (padrão `gpt-5.4-mini`, conferido contra a conta real).

4. ~~**Contraste WCAG 2 AA.**~~ **RESOLVIDA (2026-07-27).** Ter a suíte E2E rodando (consequência
   da pendência 2) revelou 5 falhas de contraste pré-existentes, invisíveis até então. Duas eram
   valor de token no modo claro: `--muted-foreground` dava 4.34:1 sobre `--muted` e `--success`
   dava 4.38:1 sob o texto do badge "aderente" — ambos abaixo do mínimo de 4.5:1.

   As outras três eram um problema **estrutural**, não de valor: `--warning` e `--danger` faziam
   dois papéis conflitantes ao mesmo tempo — fundo sólido com `-foreground` por cima
   (`bg-danger text-danger-foreground`) e texto sobre uma tinta clara de si mesmos
   (`bg-warning/10 text-warning`, que dava 2.5:1). Escurecer o token conserta o segundo e quebra o
   primeiro: `text-warning-foreground` cairia de 6.5:1 para 3.47:1. Um token não consegue ser fundo
   e texto ao mesmo tempo. A correção foi criar `--warning-strong` e `--danger-strong`, dedicados
   ao texto sobre tinta, com valores invertidos no modo escuro (lá a tinta é escura, então o texto
   precisa ser mais claro que a base). Seis usos passaram a apontar para os tokens novos.

   Os valores foram calculados a partir da luminância relativa dos fundos reais, não escolhidos por
   tentativa. Resultado: **E2E de 9 passando / 5 falhando para 14 passando / 0 falhando**.

### Auditoria da Vercel (2026-07-27) — via CLI, não MCP

Não há ferramenta MCP da Vercel nesta sessão, mas a CLI (`vercel` 56.5.0) está instalada no Windows,
autenticada e com o projeto vinculado (`divisao-compras-cms`). Cruzar `vercel env ls` com o que o
código realmente lê revelou:

**VULNERABILIDADE — rota de cron pública em produção. Corrigida no código, ainda não deployada.**
`CRON_SECRET` era lida pelo código mas **nunca existiu** na Vercel. A guarda era
`if (cronSecret && authHeader !== ...)`, que com a variável ausente curto-circuita e libera.
Confirmado exercitando produção: `GET /api/jobs/lembretes` respondia **200 sem cabeçalho nenhum**,
rodando query no banco a cada requisição anônima e expondo razão social de fornecedor, número de
processo e prazos quando houvesse cotação vencendo em 3 dias. Ver CLAUDE.md §9.45.
Ordem seguida (a inversa quebraria o cron): **1.** `CRON_SECRET` criada na Vercel em Production, com
64 chars hex gerados dentro do PowerShell para o valor não passar por contexto nem por log;
**2.** código passou a fail-closed, no padrão de `/api/admin/migrate`; **3.** 7 testes novos, com a
falha provada por mutação (voltar ao fail-open derruba os 2 testes do caso "sem segredo").
Preview ficou sem a variável de propósito: cron só roda em produção, e lá a rota passa a negar tudo.
**Continua exposta até o deploy** — o código corrigido está apenas commitado localmente.

**Variáveis mortas (definidas na Vercel, lidas por zero arquivos):** `GEMINI_API_KEY`,
`GOOGLE_SHEETS_PLANILHA_MODELO_ID`, `EMAIL_RESPONSAVEL`, `NEXT_PUBLIC_APP_URL`. Por decisão do
usuário (2026-07-27) **não foram removidas** — o risco é alguma automação externa ao repositório
depender delas. Nota: `GEMINI_API_KEY` é credencial ativa sem uso desde o M11; vale revogar no
Google mesmo mantendo a variável.

**`MIGRATE_URL` — RESOLVIDA (2026-07-27).** A senha do `postgres` era irrecuperável: o Supabase
grava o `pooler-url` **sem** ela e nunca reexibe a senha depois da criação; na Vercel as três
variáveis são Sensitive (write-only). Sobravam duas saídas:

| | resetar a senha do `postgres` | usuário dedicado |
|---|---|---|
| Downtime | ~5 min de app fora | nenhum |
| O que toca | as 3 variáveis, inclusive as que funcionavam | só a `MIGRATE_URL`, já quebrada |
| Reversível | não | sim (`drop role`) |

Escolhido o segundo: resetar a senha pediria **arriscar o que funciona para consertar o que está
quebrado**. Criado via Management API (que autentica pelo token da CLI, sem senha de banco):

```sql
create role migrator with login password '<gerado por RNG criptográfico>';
grant postgres to migrator;          -- direito de DDL nas tabelas existentes
alter role migrator set role to postgres;  -- objetos novos nascem com o dono certo
```

A terceira linha é a que a maioria esquece: sem ela as tabelas criadas pela migration teriam dono
`migrator` e o schema ficaria inconsistente. Credencial validada de ponta a ponta pelo **session
pooler** antes de qualquer migration — `session_user = migrator`, `current_user = postgres`,
`has_schema_privilege('public','CREATE') = true`. O Supavisor **aceita** usuário customizado no
formato `<usuario>.<project-ref>`, que era o risco em aberto (a doc mostra só exemplos com
`CREATE USER`).

Ganho colateral: a `MIGRATE_URL` passa a ser **rotacionável sozinha** — se vazar, basta
`drop role migrator`, sem tocar na aplicação. Com a senha do `postgres` isso era impossível.

Histórico de como o alvo foi levantado, antes da correção: A Vercel não devolve o
valor atual (Sensitive), mas a CLI do Supabase está instalada e autenticada, e vincular o projeto
num diretório temporário fez a própria API do Supabase gravar o alvo em `supabase/.temp/pooler-url`:

```
postgresql://postgres.bybkhnxxtbdcggfuatxc:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Isto é o **Session pooler**, e cada parte foi confirmada contra o projeto real, não deduzida:
região `sa-east-1` (South America/São Paulo), prefixo `aws-0-` (varia entre projetos — não chutar),
porta 5432, usuário `postgres.<project-ref>`. Postgres de produção: **15.8**.

A §9.43 foi comprovada empiricamente na mesma sessão, com DNS ao vivo:

| Host | IPv4 | IPv6 |
|---|---|---|
| `aws-0-sa-east-1.pooler.supabase.com` (Session pooler) | `15.229.150.166`, `54.94.90.106` | mapeados de IPv4 |
| `db.bybkhnxxtbdcggfuatxc.supabase.co` (conexão direta) | **nenhum** | `2600:1f1e:…` |

É essa ausência de registro A que produz o `ENOTFOUND` na função da Vercel. Porta 5432 do pooler
verificada aberta.

**Estado do banco de produção em 2026-07-27** (lido via `supabase db query --linked`, que usa a
Management API e dispensa a senha): 4 migrations aplicadas, a do M13 **não**; nenhuma das 3 tabelas
novas existe; nenhuma das 3 colunas novas existe; o enum `TipoCandidatoSimilaridade` tem só 2
valores. Há **142 linhas** em `resultados_similaridade`, 11 processos e 2 usuários — banco com dados
reais. Isso confirma que a regressão do `promoverFonte` (§9.46) era real, não hipotética.

O projeto Supabase se chama **"Atendimento Whats"**: nome herdado de um uso anterior, reaproveitado
para esta aplicação. Confirmado com o usuário — não é apontamento para o projeto errado.

Aplicar a migration continua sendo ação do usuário, por decisão dele (§8 exige autorização explícita
para DDL em produção).

**Ausentes para o M13:** `PERPLEXITY_API_KEY`, `OPENAI_ASSISTENTE_MODEL` (esta é opcional).
**Ausente e conhecida:** `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, pendência do M11.
**`ORGAO_CNPJ`** não está definida: o código cai no CNPJ padrão da Câmara, que é o correto aqui, mas
emite aviso a cada busca.

### Capacidade nova: suíte E2E executável

Com banco e navegador disponíveis, `pnpm test:e2e` roda neste ambiente pela primeira vez: 14 testes
cobrindo login real, fluxo principal e acessibilidade de 5 páginas. É a verificação que a §9.30
exige — um caminho que atravessa o banco de verdade, em vez de um `GET` de página pública.
Requer o Chromium do Playwright (`pnpm exec playwright install chromium`) e o Postgres local no ar.
