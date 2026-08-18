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
  > failed for user "postgres"`.
  >
  > ⚠️ **A leitura registrada aqui estava ERRADA — ver CLAUDE.md §9.58.** O texto original dizia
  > que a mensagem nomear o usuário sem o ref (`"postgres"`) indicaria ref faltando, e que com o
  > ref presente ela viria como `"postgres.bybkh…"`. Não é assim: o Supavisor usa o ref só para
  > rotear o tenant e autentica o usuário real no banco, então a mensagem **sempre** nomeia
  > `postgres`, com ou sem ref na string. Ref ausente produz `Tenant or user not found`, que é
  > outro erro. Logo `password authentication failed` ⇒ ref correto, **senha errada** — foi
  > exatamente esse o caso, e a heurística mandou procurar no lugar errado em 2026-07-30.
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
- ~~**Worktrees não herdam `.env`**, então `pnpm build` falha neles em "collecting page data" com
  `DATABASE_URL environment variable is not set`.~~ **RESOLVIDA (2026-07-27).** Era o mesmo defeito
  que quebrava o deploy de preview, visto de outro ângulo: `lib/db.ts` conectava ao avaliar o
  módulo, então qualquer build sem a variável caía. Com a conexão preguiçosa (§9.54), o build passa
  sem `DATABASE_URL` — verificado com `env DATABASE_URL= next build`. A pergunta que a pendência
  deixava em aberto ("o build deve ser resiliente a isso?") foi respondida na prática: sim, e não
  por conveniência de worktree, mas porque **Preview nunca teve a variável** e nenhum preview do
  projeto jamais buildou (§9.55).

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

## M13 — Assistente de pesquisa (OpenAI + Perplexity) — FASES 13.0 a 13.3 CONCLUÍDAS

> As quatro fases de código estão fechadas. O que resta é ambiente, não implementação:
> `PERPLEXITY_API_KEY` na Vercel (sem ela a busca web da Perplexity se auto-desabilita e o
> assistente segue com PNCP + web search da OpenAI) e o deploy da fase 13.3.

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

### Fase 13.3 — CONCLUÍDA (2026-07-27)
- [x] `rascunhar_justificativa` no registry, com os três tipos: `aderencia_fonte`,
      `metodologia_serie`, `rota_fornecedores`.

**Decisão de escopo, com o usuário: a ferramenta é de LEITURA e não persiste nada.** Ela reúne os
números reais do processo e o modelo redige o texto no chat; o servidor revisa e leva aos autos.
Dois motivos concretos, e o primeiro é de conformidade:

1. Justificativa é peça de instrução processual. Gravar texto de IA num campo que hoje só recebe
   texto humano apagaria a distinção entre os dois para quem ler os autos depois — e nenhum dos
   três destinos tem coluna marcando origem.
2. Dos três, **só `ContratacaoPublica.justificativaAderencia` existe no schema**. Metodologia (em
   `SeriePreco`) e rota (em `Processo`) exigiriam migration, e o M13 já quebrou duas vezes por
   código subir antes da migration (§9.46). Esta fase entrega **sem tocar no banco**.

Achado durante a exploração: `conformidade.ts` já reconhecia a lacuna — na avaliação do R-07 ele
passa `undefined` fixo para `validarFontePublica`, com o comentário "justificativa por processo
ainda não é modelada". A justificativa de rota é exatamente o texto que preenche essa lacuna, hoje
pela mão do servidor.

Reuso em vez de duplicação: o corte de análise crítica usa `CV_ANALISE_CRITICA` de `priceStats` e o
mínimo de fornecedores usa `MIN_FONTES_SUFICIENCIA` de `conformidade` — o modelo não recebe nenhum
limite hardcodado, e mudar a regra no domínio muda o que o assistente diz.

`select` explícito na consulta, nunca `include` (§9.46).

**Verificação — 14 testes novos, 4 mutações com mapeamento 1:1:**

| Guarda desligada | Teste que caiu |
|---|---|
| `analiseCriticaObrigatoria` fixado em `false` | "sinaliza análise crítica obrigatória quando o CV passa de 30%" |
| Escopo de processo (`if (false)`) | "recusa rascunhar para outro processo numa conversa presa a um processo" |
| **Escrita acrescentada à ferramenta** (`updateMany` na justificativa) | "não grava ao rascunhar aderencia_fonte" |
| `usouFontePublica` fixado em `true` | "informa se houve fonte pública, que é o que o R-07 cobra" |

A terceira é a que mais importa: os testes de não-persistência **passavam com a ferramenta ainda
inexistente**, então não provavam nada até a mutação mostrar que detectam uma escrita introduzida
depois. É a §9.35 — teste que passa não prova que protege; só a mutação prova.

Armadilha encontrada: o prompt de sistema é um template literal, e usar crase para marcar nome de
ferramenta dentro dele **fecha a string** — 5 erros de sintaxe no `tsc` e um "Parsing error" no
ESLint, ambos apontando para uma linha que parecia texto comum.

`tsc --noEmit` exit 0 · `eslint` 0 erros (2 warnings pré-existentes) · **538 testes em 66 arquivos**
(eram 473 em 60) · `next build` compilou e listou `/api/assistente/chat`.

### Revisão do PR #10 — dois achados aplicados

O `code-reviewer` encontrou um buraco real, reproduzido antes de aceitar:

**Os testes de não-persistência enumeravam métodos proibidos à mão** (`update`, `updateMany`,
`createMany`) e deixavam `create` de fora. Resultado: a ferramenta podia criar `Fonte`,
`Evidencia` e `PrecoConsolidado` — as escritas que o comentário de `ferramentas.ts` declara
proibidas — com os 14 testes verdes. A garantia documentada era justamente a que estava sem teste.
Corrigido varrendo a **superfície inteira** (8 métodos de escrita × 13 models), que reporta o nome
exato do que escreveu; enumerar mais nomes repetiria o erro na próxima adição ao schema. Virou a
§9.56.

**`MIN_FONTES_SUFICIENCIA` media fornecedores.** A constante é documentada como mínimo de *fontes*
com evidência (OP-ADH-04) e estava contando *cotações* (R-03), aqui e em `conformidade.ts`. Sem bug
hoje — ambas valem 3 —, mas mudar a suficiência de fontes mudaria a regra de fornecedores em
silêncio. Criada `MIN_FORNECEDORES_PESQUISA_DIRETA` em `in65Rules.ts`, onde a regra mora,
substituindo também o `>= 3` que estava hardcodado lá.

### Bug de infraestrutura encontrado pelo PR: preview nunca buildou

O deploy de preview do PR #10 falhou com `Failed to collect page data for /api/jobs/lembretes`.
Investigado até a causa raiz, não corrigido na primeira hipótese:

`DATABASE_URL` existe **só em Production** (`vercel env ls` confirma o target), então **nenhum
deploy de preview deste projeto jamais buildou**. Só apareceu agora porque este é o primeiro PR
desde que o M13 passou a ser feito direto em `main`.

Mas a variável ausente é o gatilho, não a causa: `export const db = createPrismaClient()` conectava
ao **avaliar o módulo**, então bastava o Next importar a rota para coletar metadados e o `throw`
derrubava o build inteiro. **`force-dynamic` não resolve** — foi a primeira tentativa, e o build
continuou quebrando: a diretiva impede a execução do handler, não a importação do módulo. A
correção é conexão preguiçosa via `Proxy`, com o client nascendo no primeiro acesso a um model.

Verificado na condição real (§9.23): `env DATABASE_URL= next build` reproduzia a falha exata do
preview em 15 segundos e agora passa, sem gastar ciclo de deploy. Lições §9.54 e §9.55.

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
   modificados. ~~`text=auto` preserva a detecção de binário do git, o que protege
   `docs/ATO2017_2023.md` (UTF-8 com 834 bytes NUL).~~ **Os 834 NUL eram corrupção de extração, não
   conteúdo: substituíam as ligaduras "ti" e "fí", quebrando 288 palavras e — pior — tornando o
   arquivo inteiro binário para o `grep`. Reparados em 2026-07-28, e o arquivo renomeado para
   `docs/ato-mesa-17-2023-cms.md`.** Regra explícita para
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

   ~~**Continua aberto:** aplicar em **produção**. Depende da correção da `MIGRATE_URL` na Vercel
   (porta 6543 → 5432, usuário `postgres.projeto` → `postgres.bybkhnxxtbdcggfuatxc`), que é ação
   do usuário no painel (§8). Só então vale a §9.19.~~
   **RESOLVIDO (2026-07-30).** `MIGRATE_URL` corrigida e `GET /api/admin/migrate` responde
   `200` com `pendentes: []`. As **6 migrations estão aplicadas** em produção, incluindo
   `20260727104500_add_assistente_pesquisa` (M13) e `20260729161500_add_tr_contexto_to_processo`.
   Confirmado por dois caminhos independentes: a rota, e conexão direta pelo Session pooler lendo
   `_prisma_migrations` e `information_schema`. Ver o registro de 2026-07-30 no fim deste arquivo.

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

**Migration do M13 — APLICADA EM PRODUÇÃO (2026-07-27).** Executada com `psql` pela credencial
`migrator`, em uma única transação, a partir do SQL gerado do próprio
`prisma/migrations/20260727104500_add_assistente_pesquisa/migration.sql` (DDL conferido byte a byte
contra o repositório antes de rodar). Verificação pós-commit:

| | |
|---|---|
| migrations registradas | 5 (era 4) |
| checksum gravado == SHA-256 do arquivo | **true** — o banco segue intercambiável com `prisma migrate deploy` |
| tabelas novas / colunas novas | 3 / 3 |
| enum `TipoCandidatoSimilaridade` | `contratacao_publica, painel_precos, site_eletronico` |
| `site_eletronico` usável pós-commit | sim (a restrição do `ADD VALUE` vale só dentro da transação) |
| linhas em `resultados_similaridade` | 142, preservadas |

Efeito colateral que importa: a quebra do `preencherCotacao` (§9.46) **morreu sem deploy** — ela
existia porque o código pedia colunas inexistentes, e agora elas existem.

Armadilha de verificação encontrada aqui: as colunas novas são `origem`, `conversaId` e
`termoBuscaUsado` — **camelCase**, como todo o schema deste projeto. Consultar
`information_schema.columns` com `conversa_id`/`termo_busca_usado` devolve 0 mesmo com a migration
aplicada, o que se lê como "não aplicou". Conferir a convenção de nome antes de tratar um zero
como diagnóstico.

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

~~Aplicar a migration continua sendo ação do usuário, por decisão dele (§8 exige autorização
explícita para DDL em produção).~~

**Estado do banco de produção em 2026-07-30 — SUPERA o levantamento de 27/07 acima.** As migrations
foram aplicadas em algum ponto entre as duas datas, durante o trabalho feito na nuvem. Lido por dois
caminhos independentes (a rota `/api/admin/migrate` e conexão direta pelo Session pooler):

```
[ok] 20260614155015_init
[ok] 20260616003933_add_resultado_similaridade
[ok] 20260617134642_add_planilha_origem_url
[ok] 20260724115912_add_fonte_resultado_similaridade_unique
[ok] 20260727104500_add_assistente_pesquisa       ← M13
[ok] 20260729161500_add_tr_contexto_to_processo   ← veio da nuvem em 29/07
```

`pendentes: []`, `orfas: []`, 6 de 6. Colunas confirmadas presentes: `processos.trContexto`,
`resultados_similaridade.origem`/`conversaId`/`termoBuscaUsado`, `mensagens_assistente.conversaId`.
**A regressão do §9.46 não está viva em produção.** PostgreSQL 15.8, 52 tabelas (a maioria da
aplicação anterior que divide este projeto Supabase), **4 processos** — contra os 11 de 27/07, queda
provavelmente explicada pela funcionalidade de exclusão de processo que veio da nuvem (`5741fb7`),
não confirmada individualmente.

Incidente do mesmo dia, resolvido: o reset da senha do banco invalidou `DATABASE_URL`, `DIRECT_URL`
e `MIGRATE_URL` de uma vez e **derrubou a aplicação**; a correção passou ainda por um erro de TLS
(`sslmode=require` → `no-verify`). Lições em CLAUDE.md §9.57 a §9.60. Aplicação verificada de volta
ao ar exercitando o dashboard com dados reais, não por build verde (§9.30).

**~~Ausentes para o M13:~~** `PERPLEXITY_API_KEY` **criada em Production em 2026-07-27** e ativa
desde o deploy do merge do PR #10. Validada contra a API real antes de subir (HTTP 200, modelo
`sonar`, 11 citações) — formato correto não prova chave ativa (§9.37). `OPENAI_ASSISTENTE_MODEL`
segue ausente e é opcional (padrão `gpt-5.4-mini`).
**Ausente e conhecida:** `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, pendência do M11.
**`ORGAO_CNPJ`** não está definida: o código cai no CNPJ padrão da Câmara, que é o correto aqui, mas
emite aviso a cada busca.

### Capacidade nova: suíte E2E executável

Com banco e navegador disponíveis, `pnpm test:e2e` roda neste ambiente pela primeira vez: 14 testes
cobrindo login real, fluxo principal e acessibilidade de 5 páginas. É a verificação que a §9.30
exige — um caminho que atravessa o banco de verdade, em vez de um `GET` de página pública.
Requer o Chromium do Playwright (`pnpm exec playwright install chromium`) e o Postgres local no ar.

---

## Estado ao fim da sessão de 2026-07-27

**M13 fechado e em produção.** `main` = `origin/main` = `03f151b` (merge do PR #10), árvore limpa,
deploy `dpl_7KfmdDA` `READY` com `target: production`. As quatro fases (13.0 a 13.3) estão no ar.

Verificado em produção após o deploy: `/login` 200 · `/api/jobs/lembretes` sem cabeçalho **401**
(o fail-closed da §9.45 confirmado no ar) · `/api/busca` sem sessão 401 · `/dashboard` 307 ·
`get_runtime_errors` **sem nenhum erro** nas 2h seguintes.

**Ressalva honesta:** nenhum caminho autenticado foi exercitado de ponta a ponta nesta sessão —
isso exigiria credencial de usuário real. A ausência de erro de runtime é forte (foi assim que a
§9.30 apareceu), mas não substitui um login de verdade. O teste que fecharia a lacuna: entrar na
aplicação, abrir um processo e o painel do assistente, e confirmar que a busca web da Perplexity
aparece no rastro de ferramentas.

### O que continua aberto (tudo depende de ação do usuário)

1. **`DATABASE_URL` e `AUTH_SECRET` não existem em Preview.** Depois da §9.54 os previews
   *buildam*, mas não servem nenhuma página que toque o banco — revisar um PR abrindo o preview
   ainda não funciona de verdade. Criar as duas nesse target resolve.
2. **`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`** — pendência herdada do M11.
3. **`ORGAO_CNPJ`** não definida: o código cai no CNPJ padrão da Câmara, que é o correto, mas emite
   aviso a cada busca.
4. **`GEMINI_API_KEY`** é credencial ativa sem uso desde o M11. A variável foi mantida por decisão
   do usuário (risco de automação externa depender dela), mas vale **revogar a chave no Google**.
5. **Dois worktrees órfãos** em `.claude/worktrees/` (`agent-a3d112dc66d2bf3df`,
   `agent-a6a6060fd0c4eac2f`). Verificado: ambos são **ancestrais de `main`**, já mesclados em
   25/07, sem trabalho não commitado — não há nada a recuperar. A remoção foi bloqueada pelo
   classificador de permissões do agente; o diretório já está no `.gitignore`, então não fazem mal.
   Para limpar: `git worktree remove --force <caminho>` nos dois, depois `git branch -D` nas
   branches homônimas.
6. **13 branches remotas** de milestones antigas nunca podadas (o `--prune` desta sessão removeu 3
   já apagadas no servidor; as demais continuam vivas no remoto).

### PR #9 — analisado e fechado em 2026-07-30

O branch `cursor/planilha-sync-fields-in-processo-tabs-dab4` (8 commits de 20/07, PR #9 em draft) é
o mesmo citado na §9.33 do CLAUDE.md. Ficou 108 commits atrás da `main` e foi **fechado sem
mesclar**, por análise commit a commit:

| Commit | Estado na `main` |
|---|---|
| `d781a16` links PNCP + exclui CNPJ do órgão | já reimplementado (`lib/domain/orgaoProprio.ts`, `lib/integracoes/pncp.ts`) — a lacuna da §9.33 está fechada |
| `b247b3e` rota `/api/admin/migrate` | já existe, em versão melhor (via `pg`, sem CLI do Prisma — §9.18/26/28/29) |
| `1690076` parser flexível de colunas | já na `main` (§9.10) |
| `ed16d05` parser aceita mediana zero | já na `main` (`000a083`) |
| `aee1fc9` fix Server Component / migration pendente | já na `main` (`b87009a`, §9.46) |
| `b24a3a7` campos de planilha | superado por **design diferente**: o PR criava `planilhaCotacaoUrl` (planilha separada de destino); a `main` consolidou em `planilhaOrigemUrl` e `preencherCotacao` escreve de volta na própria planilha de origem |

Merge direto produzia **11 conflitos** e ressuscitaria `src/lib/ia/geminiProvider.ts`, apagado da
`main` na migração para OpenAI — regressão do provedor de IA. Rebasear custava mais que reescrever.

**Três itens do PR ainda têm valor e não existem na `main`** — candidatos a tarefa nova:

1. **Editor de palavras-chave por item** (`PalavrasChaveItemForm.tsx` + `salvarPalavrasChaveItem.ts`).
   Hoje a `main` só **exibe** as palavras-chave, read-only, em `ProcessoTabs.tsx:115`. O campo
   existe no schema e o usuário não tem como corrigi-lo quando a extração erra.
2. **Sub-scores e justificativa** em `FontesSimilaridadeList`. A `main` mostra só o `scoreFinal`
   como número solto, sem dizer **por quê** — fraco para uma ferramenta cuja regra de negócio
   (IN 65/2021) exige análise crítica registrada.
3. **`error.tsx`** em `processos/[id]` — error boundary que a `main` não tem.

Descartados por superação: `expandirTermosBusca.ts` e o "score mínimo 85" (a `main` usa 70 em
`rankearCandidatos.ts:20`). O M13 refina termos iterativamente pelo assistente, que era exatamente
o problema que essa expansão heurística tentava resolver.

### M14.0 — Valor homologado do PNCP e paginação dos itens ✅ MESCLADO em 2026-07-30 (PR #17)

Primeira melhoria nascida de uso real: o usuário notou que os valores trazidos do PNCP não batiam
com o que era efetivamente contratado. Dois defeitos independentes, ambos medidos contra a API real
(não deduzidos). Detalhes e regra anti-regressão em CLAUDE.md §9.61.

**Defeito 1 — preço estimado em vez de homologado.** `/itens` só devolve `valorUnitarioEstimado`,
que é o orçamento feito **antes** do certame. O preço contratado vive em
`/itens/{numeroItem}/resultados` → `valorUnitarioHomologado`. Na compra do exemplo do usuário
(`83021857000115/2024/207`), a média estimada era R$ 150,97 contra R$ 74,00 homologada: **51% de
inflação** na série de preços.

**Defeito 2 — só os 10 primeiros itens.** O tamanho de página padrão de `/itens` é 10, não
documentado, e a resposta é um array nu (sem envelope nem contador) — o truncamento era
**silencioso**. Medido em 16 contratações: uma de 418 itens devolvia 10.

Decisões tomadas com o usuário nesta sessão:

| Decisão | Escolha | Consequência aceita |
|---|---|---|
| Item sem valor homologado | **descartar** | editais ainda não julgados somem dos candidatos; série menor e mais limpa |
| Volume de requisições | **filtrar por relevância antes** de consultar o resultado | teto de 40 itens/contratação; risco baixo de perder item com descrição atípica |

Também limpa HTML e entidades numéricas da descrição, que entravam cruas na tokenização e na
evidência exibida.

Verificação: typecheck limpo, ESLint 0 erros, **602 testes / 70 arquivos** (30 novos neste módulo),
`next build` compilando, e a lógica validada ponta a ponta contra a API real. Produção exercitada
após o deploy (`/api/admin/migrate` → 200, atravessando o banco).

> **EM ABERTO — verificação funcional pelo usuário.** Falta abrir um processo em produção, rodar a
> pesquisa por similaridade num item e confirmar que (a) os valores exibidos são os homologados,
> conferindo contra o edital pelo link da evidência; (b) a redução no número de candidatos é a
> esperada, e não sintoma de filtro agressivo demais. Se o teto de 40 itens/contratação cortar
> contratação relevante, é só um número em `pncp.ts`. Rollback, se preciso: `git revert 08f4cf7` —
> não há migration nem mudança de schema envolvida.

### Pendência de processo — não há ambiente de teste antes de produção

O 500 no preview do PR #17 expôs isso: **nenhum deploy de preview deste projeto alcança o banco**,
porque `DATABASE_URL` e as demais variáveis existem só no target Production (§9.55). O preview
builda e serve páginas estáticas, mas qualquer Server Component que leia do Postgres falha com
`digest`. Consequência prática: todo PR daqui pra frente só pode ser validado depois do merge.

Não foi confirmado por teste comparativo (abrir o preview de um PR só-documentação e ver se falha
igual) — o usuário optou por mesclar e testar em produção. A hipótese do ambiente ficou mais forte
depois do merge, já que o mesmo código roda são em produção.

Correção, quando o usuário autorizar: criar `DATABASE_URL` (Transaction pooler, 6543),
`DIRECT_URL`/`MIGRATE_URL` (Session pooler, 5432) e as chaves de API no target **Preview**, todas
com `?sslmode=no-verify` (§9.57).

### Fase seguinte

Não há milestone pendente no plano: M0 a M13 estão concluídos. Próximo trabalho é decisão do
usuário — usar o sistema em processos reais e deixar o uso apontar o que falta é o caminho mais
provável de render um M14 útil. Os três itens do PR #9 acima são o candidato mais concreto a M14.

### M14.1 — Prazo real da busca no PNCP e validação da data de referência (2026-08-11)

Nasceu de auditoria do uso real do assistente, não de plano prévio: o usuário relatou que o
assistente estava travando. A leitura do banco de produção (somente-leitura, via Session pooler)
mostrou **8 turnos sem nenhuma resposta** em dois dias — 2 de 4 em 11/08 e 6 de 14 em 10/08 —
contra zero nos dias anteriores a 30/07.

**Causa medida.** As duas `buscar_pncp` de 11/08 levaram 27.760ms e 26.462ms, contra média de
5.552ms nas 99 chamadas registradas. O teto de `TEMPO_MAX_BUSCA_MS` era verificado apenas entre
lotes de editais, então um lote iniciado aos 19,9s rodava até o fim. Uma busca de 27s sozinha
estourava o orçamento de 35s do turno; passando de 60s, a Vercel matava a função sem gravar
mensagem nem `AuditLog` — daí os turnos que somem por completo.

**Hipótese descartada.** A primeira recomendação foi limitar o termo a 3–4 tokens (§9.64). Cruzar
duração × tokens das 16 buscas gravadas refutou: 6 tokens custaram 8,2s, 3 tokens custaram 15,6s, e
a busca de 26s tinha 4 tokens. O custo vem do número de requisições, não do termo. Regra em §9.67.

| Mudança | Antes | Depois |
|---|---|---|
| Teto de tempo da busca | 20s, checado entre lotes | 12s como prazo real (`AbortSignal` composto + checagem por requisição + reserva de 2s por lote) |
| Consultas a `/resultados` por compra | 40 | 10 |
| Consultas a `/resultados` por busca | sem teto (até ~800) | 120 |
| Data de referência | `new Date(...)` sem checagem | janela fixa 2000–2100; candidato sem data plausível é descartado |

A garantia original ("nunca devolver subconjunto arbitrário dos itens de uma compra") foi
preservada por outro caminho: compra interrompida pelo prazo é descartada **inteira**, e a
paginação truncada é abandonada antes de gastar as consultas de resultado.

**Achado de dados.** 5 dos 264 candidatos tinham data-sentinela do PNCP (`0001-01-01` ×3,
`1858-11-17`, `1900-01-01`). Todos eram linhas de descarte, então **nenhuma série de preços foi
contaminada** — mas se tivessem sido adicionados, entrariam na memória de cálculo com data falsa e
o filtro de recência os eliminaria em silêncio.

Verificação: typecheck limpo, ESLint 0 erros, **808 testes / 92 arquivos** (10 novos), `next build`
compilando. As 6 garantias novas foram confirmadas **por mutação**, uma a uma — a primeira rodada
mostrou que o descarte de paginação truncada não tinha teste (a mutação sobreviveu), e o teste foi
escrito sobre a garantia que ele realmente dá: não gastar requisição numa compra que será
descartada.

> **EM ABERTO — verificação funcional pelo usuário.** Falta usar o assistente em produção depois do
> deploy e confirmar que (a) os turnos deixam de morrer sem resposta e (b) 2 buscas cabem num turno,
> em vez de 1. Se 12s cortar edital relevante demais, é um número em `pncp.ts`. Sem migration:
> rollback é `git revert` do commit.

### Pendência de conformidade levantada na mesma auditoria (decisão do usuário)

Os argumentos gravados mostram `buscar_pncp` sendo chamada com faixas de valor que vêm do valor
esperado pelo próprio analista (`valorMinimo: 70000, valorMaximo: 90000`; depois `1` a `5`). Filtrar
valor tem uso legítimo — cortar disparate, e há bastante (CV de 969% no pipeline automático, com um
candidato de R$ 831.040,00). Mas selecionar contrato porque ele cai na faixa já esperada inverte a
lógica da pesquisa de preços e é frágil sob questionamento da IN 65/2021. Não há mudança de código
proposta: é decisão de processo do usuário.

### M14.2 — Busca textual em duas páginas paralelas + teto de resultados ampliado (2026-08-11)

Duas melhorias nascidas da análise dos itens pendentes do M14.1, ambas implementadas no mesmo PR:

**Item 1 — Defeito latente no teste `painelPrecos`.**
O teste levava 2,8–3,2s (confirmado por medição) e emitia
`[ComprasGov] ItemCatalogoReferencia vazia para "catser" — usando fallback por request"` durante a
execução. O mock de `@/lib/db` simulava banco vazio, mas não impedia o fallback
`baixarCatalogoServicosPorRequest`, que fazia fetch real para `dadosabertos.compras.gov.br` sem
timeout configurado. Corrigido adicionando `vi.spyOn(global, "fetch")` no `beforeEach` para simular
API vazia — o teste passa em 3ms, sem dependência de rede.

**Item 2 — Pool de editais dobrado sem custo extra de tempo.**
A busca textual do PNCP buscava apenas a página 1 (20 editais). Implementação em `buscarPorTexto`
com parâmetro `pagina` e `Promise.all([buscarPorTexto(1), buscarPorTexto(2)])` em
`buscarContratosPNCP`: ambas as páginas correm em paralelo (~2,5s wall time, igual a antes). Pool
cresce de 20 para 40 editais. O ranqueador por IDF então escolhe os melhores de 40 em vez de 20.
Deduplicação por `numero_controle_pncp` é defensiva (a API não repete, mas o check é barato).

`MAX_RESULTADOS_POR_BUSCA` elevado de 120 para 150 (15 editais vs. 12 antes): alinha o orçamento
de resultados com o que o orçamento de tempo permite (~7,5s efetivos / 1,9s por lote × 5 editais).

| Parâmetro | Antes | Depois |
|---|---|---|
| Páginas da busca textual | 1 (20 editais) | 2 em paralelo (até 40 editais) |
| `MAX_RESULTADOS_POR_BUSCA` | 120 (12 editais) | 150 (15 editais) |
| Custo de tempo extra | — | 0ms (paralelo) |

Verificação: typecheck limpo, ESLint 0 erros, **816 testes / 92 arquivos** (3 novos + 5 existentes
atualizados para refletir 2 requests de busca textual). Os 3 testes novos provam: (a) ambas as
páginas são pedidas, (b) candidatos exclusivos da página 2 chegam ao resultado, (c) edital em ambas
as páginas não vira candidato duplicado.

> **EM ABERTO — verificação funcional pelo usuário.** Falta usar o assistente em produção e
> confirmar que os candidatos retornados são mais aderentes ao termo do que antes. Se 12s cortar
> edital relevante demais, `TEMPO_MAX_BUSCA_MS` e `MAX_RESULTADOS_POR_BUSCA` são os dois números.
> Sem migration: rollback é `git revert`.

---

### M20 — Ajuste manual do valor do candidato e teto de 10 contratos por item (2026-08-12)

Origem: uso real. Na aba de similaridade do processo, (a) itens com mais candidatos aprovados só
exibiam parte deles e (b) o MPPR aparecia com "R$ 15.000,00 unitário" — que é o valor CHEIO do
contrato por 150 m², ou seja R$ 100,00/m². Promovido assim, o preço entraria na série inflado em
150x.

**Entregas**

1. **Teto por item de 5 → 10** (`obterFontesSimilaridade`). Cortar abaixo do que o analista reuniu
   esconde preço já pesquisado.
2. **Candidato descartado volta a ser adicionável.** `adicionarCandidatoSugerido` tratava a lápide
   do descarte (mesma URL, score 0) como duplicata e respondia "já está na lista" — o analista
   ficava sem saída e o contrato não aparecia em lugar nenhum. Agora a lápide é revivida
   (mesmo id, `descartado: false`).
3. **Ajuste manual do valor** (`domain/ajusteValorCandidato.ts` + `actions/ajustarValorCandidato.ts`
   + `AjusteValorCandidatoForm`): `valorBase (÷ × +) quantidade = valor unitário`, mais unidade de
   medida (m², m, serviço…), vigência documental (mensal/anual/12–60 meses) e projeção
   `unitário × quantidade do TR`. O unitário é o que entra na série; a projeção é demonstrativa.
   Decidido com o usuário em 2026-08-12: a periodicidade **não** normaliza valor.
4. **Propagação para a estimativa.** Promoção passa a usar o valor efetivo (ajustado quando
   existe) e registra o ajuste na descrição da `Evidencia`. Ajustar candidato já promovido
   atualiza `Fonte` e `PrecoConsolidado` na mesma transação — vínculo novo
   `PrecoConsolidado.resultadoSimilaridadeId`, com backfill no SQL da migration para as promoções
   anteriores. Reconsolidar a série continua sendo passo explícito do analista.

**Migration** `20260812120000_m20_ajuste_valor_candidato` — 2 enums, 7 colunas em
`resultados_similaridade`, 1 coluna + índice + FK em `precos_consolidados`, mais o backfill.
Aplicada e confirmada no banco **local** (`Database schema is up to date!`). **Produção pendente**
(§9.19): como `promoverFonte` e `obterFontesSimilaridade` passam a pedir as colunas novas no
`select`, a migration precisa rodar em produção junto com o deploy — senão a aba de similaridade
quebra em runtime.

Verificação: typecheck limpo, ESLint 0 erros (1 warning pré-existente em `DataTable`),
**875 testes / 96 arquivos**, `next build` compilado. Duas mutações confirmaram que os testes
protegem o que dizem proteger: promover o valor cru derruba "promove o valor ajustado"; propagar
sem checar `promovidoParaFonte` derruba "não toca em Fonte nem na série".

**Adendo do mesmo dia — a base do valor virou escolha do analista.** Uso real mostrou que fixar o
unitário como o que entra na mediana estava errado para contrato publicado por preço de
sub-unidade: `R$ 6,95 × 4500 m² = R$ 31.275,00` é o custo do escopo do contrato, e o comparável
para a Câmara é isso × a quantidade do TR. Agora o painel mostra os dois números lado a lado, como
cartões selecionáveis, e a escolha fica em `ajusteBaseSerie`; `valorConsiderado` guarda o número
que vale na série, separado de `valorUnitarioAjustado` (resultado do cálculo) para a memória de
cálculo exibir os dois. Como misturar bases no mesmo item produz mediana entre grandezas
diferentes, o card avisa (`basesDivergentes`) sem bloquear. Migration
`20260812140000_m20_base_valor_serie`, com backfill marcando os ajustes existentes como
`unitario` — sem backfill eles voltariam silenciosamente a valer pelo valor cru da fonte.
Aplicada em local e em produção; os 2 ajustes que já existiam mantiveram o mesmo valor.
Verificação: 888 testes, build compilado, e a mutação "ignorar a base escolhida" derruba o teste
do caso relatado.

---

### M21 — Roteiro de cálculo por passos (2026-08-12)

Origem: uso real revelou que a conta de padronização de um contrato de referência ao objeto do TR
raramente é uma operação só. Serviço contínuo com contrato de valor global exige três passos
(`÷ medida do contrato · × medida do TR · × execuções no período`); bem de consumo pode não
precisar de nenhum. O M20 (uma operação + escolha unitário/projetado) não cobria os dois extremos.

**Modelo novo — `RoteiroCalculo`:** cadeia de até 8 passos, cada um com `operação` (×, ÷, +, −,
+%, −%) e `origem` do operando. Três origens (`medida_tr`, `quantidade_tr`, `execucoes_periodo`)
**não carregam número** — são resolvidas a partir de parâmetros do **item**, não do candidato:
`Item.trMedida/trMedidaUnidade` (medida física do objeto) e `Item.trFrequencia/trVigenciaMeses`
(frequência de execução × vigência pretendida = execuções no período). Ficam no item porque valem
para todos os candidatos daquele item — corrigir a metragem recalcula os dez contratos de uma vez,
em vez de reeditar candidato a candidato.

**Duas vigências, propositalmente separadas:** a do contrato de referência (`ajustePeriodicidade`,
documental, herdada do M20) e a do TR (`Item.trVigenciaMeses`, que multiplica). Confundir as duas
inflaria ou reduziria a estimativa silenciosamente.

**Grandeza do resultado** (`classificarGrandeza`) é derivada da cadeia, não digitada:
`unitario_contrato` / `escopo_tr` / `escopo_tr_periodo`. `grandezasDivergentes` avisa (sem
bloquear) quando candidatos do mesmo item terminam em grandezas diferentes — mediana entre
R$/m² e R$ pelo escopo em 24 meses não significa nada.

**Memória de cálculo redigida automaticamente** (`domain/memoriaCalculoCandidato.ts`): cada passo
vira uma frase ("pela medida do objeto no TR (940 m²), resulta em..."), com botão de copiar na
tela — para colar direto na cota do processo, cumprindo a exigência de justificativa da IN 65/2021.

**Modelos prontos** na UI (`RoteiroCalculoEditor`): 5 sequências que se repetem
(contínuo/valor global, contínuo/unitário, consumo/×qtd TR, consumo/direto, obra+BDI) — aplicar um
preenche a estrutura, resta digitar os números do contrato específico.

**Segurança:** a server action `salvarRoteiroCalculo` **reexecuta o roteiro no servidor** com os
parâmetros do item lidos do banco — o valor final nunca é aceito do cliente. Coluna `Json`
validada com Zod na entrada e na leitura (`lerRoteiro` devolve `null` em vez de lançar, para JSON
antigo/corrompido não derrubar a tela).

**Migration** `20260812160000_m21_roteiro_calculo`: `Item.trMedida/trMedidaUnidade/trFrequencia/
trVigenciaMeses`, `ResultadoSimilaridade.roteiroCalculo` (Json), enum `FrequenciaExecucao`, valor
`meses_30` acrescentado a `PeriodicidadeContrato` (faltava na lista do M20). Backfill converte os
ajustes do M20 em roteiros de 1-2 passos. **Verificado por dry-run contra produção antes de
aplicar**: reproduzindo a expressão SQL do backfill como `SELECT` (sem escrever), os 5 ajustes
reais em produção resultaram em roteiros cujo produto bate exatamente com `valorConsiderado` já
gravado (conferido à mão: 6,89 × 4500 × 6 = 186.030,00 ✓, e os outros 4 igual).

**M20 mantido como legado read-only:** `ajusteValorBase/Operacao/Quantidade/QuantidadeTR/
BaseSerie` continuam no schema (histórico), mas o código de escrita (`ajustarValorCandidato.ts`,
`AjusteValorCandidatoForm.tsx`) foi removido — `roteiroCalculo.ts` é a única fonte de verdade
para valor considerado a partir de agora.

Verificação: typecheck limpo, ESLint 0 erros (1 warning pré-existente), **893 testes** (60 novos),
build compilado, migration aplicada em local. Duas mutações confirmaram a garantia central: gravar
`valorInicial` no lugar do resultado recalculado derruba o teste de reexecução no servidor; tratar
candidato sem roteiro como grandeza distinta (em vez de unitária) derruba o teste de
`grandezasDivergentes`.

> **Pendente de decisão do usuário (registrada na conversa, 2026-08-12):** a mediana passa a
> comparar valores de ESCOPO (R$ pelo objeto do TR no período), não só preços unitários, quando o
> analista escolhe um roteiro com passos de TR. A instrução processual precisa declarar isso —
> a memória de cálculo redigida automaticamente já inclui essa frase ("valor do escopo do TR no
> período"). Produção pendente: aplicar `/api/admin/migrate` após o deploy (CLAUDE.md §9.19).

## M22 — Régua de avaliação da busca PNCP e demoção de candidatos já descartados (2026-08-14)

Origem: sessão anterior deixou uma pergunta em aberto — a busca `buscar_pncp` do assistente tem
"lacunas de inteligência" reais, ou é impressão? Até aqui não havia número, só a sensação de que o
analista via muito ruído. CLAUDE.md §7 exige responder "como você confirma que isso está correto?"
antes de mexer — então a primeira entrega não foi código, foi instrumento de medição.

**`scripts/avaliar-busca-pncp.ts` (novo, commitado agora — ficou pronto numa sessão anterior sem
commit).** Reexecuta a busca real do PNCP para cada termo já usado em produção e mede recall contra
o gabarito que o próprio analista já gerou clicando: `promovidoParaFonte` = positivo forte,
`descartado` = negativo, nem um nem outro = positivo fraco. Métrica principal: `positivosVisiveis`
(candidato bom aparece no corte de 25 que o assistente exibe). Sem isso, mudança de ranqueamento é
injulgável — `pnpm test` passa igual antes e depois.

**Baseline medida em 2026-08-14 (223 rótulos, 46 termos):** positivos visíveis 83%, mas
**negativos visíveis 76%** — mais de 3 em cada 4 candidatos que o analista já descartou reaparecem
no topo de uma busca nova. Medido (não suposto) por que: 49-51% dos negativos batem só 1 token
discriminante do termo com a descrição do item, e o resultado final de `buscarContratosPNCP` é a
concatenação simples dos editais na ordem que a busca textual do PNCP devolveu — sem
reranqueamento cruzando editais, o IDF de `ranquearPorRelevancia` só ordena dentro de cada edital.

**Primeira tentativa, revertida por dano medido.** Reordenar todos os candidatos (de todos os
editais) por contagem de tokens discriminantes casados parecia a correção óbvia. Antes de
implementar, medir a hipótese contra o gabarito real (CLAUDE.md §9.67) já mostrava risco: 20% dos
candidatos que viraram FONTE de preço (o sinal mais forte que existe) também batem só 1 token —
variação morfológica que o stemmer simples não cobre ("telha" vs "telhado"). Implementado, testado
(63/63, mutação confirmada) e **medido de novo contra a régua**: negativos visíveis caíram, mas os
3 candidatos-fonte de match fraco ficaram **todos invisíveis** (0/3) — o filtro léxico não distingue
"pouco texto em comum porque é ruído" de "pouco texto em comum porque é sinônimo". Revertido
inteiro (código e teste) antes de virar commit.

**Fix que ficou: demoção por histórico de descarte, não por texto.** Em vez de inferir relevância do
texto, usa a única fonte que não engana — decisão humana já registrada. `demoverJaDescartados`
(`lib/assistente/ferramentas.ts`) busca as URLs que o analista já descartou **neste processo** e
empurra esses candidatos para o fim da lista, preservando a ordem relativa dos dois grupos. Não
exclui nada (mantém a correção do M20/commit `eb9cf46`: o analista pode mudar de ideia, o card
ainda aparece) e por construção **não pode** atingir um candidato-fonte ou mantido — nenhum dos
dois tem `descartado: true` no banco, então o conjunto demovido nunca os contém. Ao contrário do
primeiro fix, a segurança aqui não depende de calibrar um limiar: é estrutural.

**Verificação.** Unitário com mutação (removendo a chamada, 2 dos 3 testes novos caem — o terceiro,
"não consulta na conversa global", corretamente não depende da chamada). Como a régua chama
`buscarContratosPNCP` direto — sem o wrapper de `ferramentas.ts`, que é quem tem o `processoId` —
ela não exercita este fix; a validação real foi uma simulação determinística sobre os dados
rotulados da baseline: reproduzir o particionamento exato de `demoverJaDescartados` (não-descartados
mantêm posição relativa, descartados vão para o fim) sobre a posição registrada de cada candidato
rotulado. Resultado: **negativos visíveis 81% → 9%**; **positivos visíveis 88% → 88%, sem nenhum
piorar de posição** (a garantia estrutural, confirmada nos dados, não só no código). 925/925 testes
da suíte, typecheck e lint limpos.

**Pendência.** A régua real (não a simulação) não cobre este fix — para isso ela precisaria
conhecer o `processoId` de origem de cada termo e reproduzir a demoção, não só chamar
`buscarContratosPNCP`. Fica registrado como lacuna do instrumento, não do fix.

## M23 — Carga inicial e resync automático do catálogo CATMAT/CATSER (2026-08-18)

Origem: a página `/ingestoes` mostrava as duas seções vazias em produção. Não era bug — confirmado
lendo direto o banco de produção (`PROD_READ_URL`): as 4 tabelas do M15/M16 existiam (migrations
aplicadas) mas com 0 linhas, porque a ingestão real nunca tinha rodado lá (§9.19, "migration pronta
≠ dado carregado"). Carga inicial disparada manualmente contra produção via
`/api/admin/ingerir-catalogo`, com autorização do usuário: **CATSER 2.964 itens, CATMAT 328.880
itens, 0 rejeitados.**

**Pergunta seguinte do usuário: essas atualizações são automáticas?** Não havia — o único cron do
projeto é `/api/jobs/lembretes`. Pedido: adicionar resync automático "no período adequado",
respeitando a periodicidade real do Compras.gov.

**Medição antes de decidir cadência (CLAUDE.md §9.69 — não adivinhar).** Não existe periodicidade
oficial publicada para CATMAT/CATSER (ao contrário do SINAPI, mensal documentado). Medido contra a
API real: amostra de 21 páginas do CATMAT espalhadas pelas 688 (10.380 itens) — ~2,3% tinham
`dataHoraAtualizacao` nos últimos 30 dias, com o item mais recente atualizado ~3-4 semanas antes.
Evidência de manutenção contínua (via pedidos de catalogação), não de um calendário de release.

**Decisão final de cadência, com o usuário.** Perguntado se o cron diário calibrado ficava ou saía
(dada a incerteza sobre o Hobby aceitar um 2º cron), o usuário respondeu que vai rodar a carga
completa manualmente todo dia 1º do mês — e pediu para manter o cron automático rodando **toda
segunda-feira**, como reforço entre uma rodada manual e outra. Isso muda o orçamento de tempo por
execução (semanal precisa cobrir mais páginas por rodada que diário para não ficar bimestral/anual)
— ver recalibração abaixo.

**Achado que quase invalidou a entrega: `gravarPagina` nunca atualizava linha existente.**
`createMany` + `skipDuplicates: true` (usado na carga inicial) ignora silenciosamente qualquer
`codigo` já presente — um cron de "resync" construído em cima disso adicionaria só itens novos e
nunca refletiria uma descrição/classe/status alterado num item já ingerido, o mesmo padrão de botão
sem handler da §9.40 (a feature prometeria algo que o código não faz). Corrigido antes de expor o
cron: `ModoEscritaCatalogo` (`"inserir"` default / `"upsert"`) em `catalogoComprasGov.ts`.

**Por que SQL bruto em vez de `db.upsert()` por item.** Primeira versão fazia um `upsert` Prisma por
item, com `processarComConcorrencia`; mediu ~35s **localmente** (Postgres sem latência de rede) para
19 páginas — perto demais do teto de 60s do plano Hobby somando a latência real do pooler em
produção. Trocado para um único `INSERT ... ON CONFLICT ("fonteChave", "codigo") DO UPDATE` por
página (parametrizado via `Prisma.sql`/`Prisma.join`, sem concatenar dado de item na string): as
mesmas 7 páginas do CATSER + 23 do CATMAT (11.500 itens) caem para ~22s localmente. `id` novo gerado
por `gen_random_uuid()` no próprio SQL (builtin do Postgres desde a v13, confirmado na v18 do
projeto) — não foi adicionada dependência nova só para replicar o `cuid()` que o Prisma gera
client-side em `create`/`upsert` normais.

**Por que não uma execução mensal única.** Uma ingestão completa do CATMAT mede ~13 min (688
páginas, medido nesta mesma sessão ao popular produção) — muito acima do teto de 60s do Hobby
(decisão já registrada em `scripts/ingerir-catalogo-compras-gov.ts` desde o M16). A rota nova,
`/api/jobs/atualizar-catalogo-compras-gov`, roda **semanalmente, às segundas** (`vercel.json`,
`0 4 * * 1`) e processa só uma fatia por execução: CATSER inteiro (7 páginas, barato) + N páginas do
CATMAT a partir de um cursor lido do último `LoteIngestao` (`urlArquivo` grava
`pagina=<inicial>-<final>`, mesmo formato da rota administrativa). Dá a volta para a página 1 dentro
da mesma execução quando o cursor passa do fim, em vez de desperdiçar uma semana produzindo um lote
vazio. A rota também serve de ferramenta manual: chamá-la repetidas vezes (sempre retoma do cursor
salvo) equivale à carga completa que o usuário roda por conta própria todo dia 1º.

**Recalibração para cadência semanal — achado: o gargalo é rede, não banco.** A calibração inicial
(23 páginas/execução, ~22s, `CONCORRENCIA_PADRAO=5` de `catalogoComprasGov.ts`) tinha sido pensada
para cron diário; com cron semanal, 23 páginas/semana levaria ~30 semanas (~7 meses) por volta
completa — longe demais do "mensal" original. Testado **contra a API real + Postgres local**, não
suposto:

| páginas CATMAT | concorrência de página | tempo total medido |
|---:|---:|---:|
| 23 | 5 (padrão) | ~22s |
| 60 | 5 (padrão) | ~69s — estoura os 60s do Hobby |
| 60 | 10 | ~22s |
| 90 | 10 | ~27s |
| 120 | 20 | ~57s — sem folga, descartado |

Aumentar só o lote sem aumentar a concorrência de página piora proporcionalmente (padrão
`60→69s`); aumentar a concorrência de 5→10 dobra o throughput para o mesmo lote (`60 páginas`:
69s→22s), confirmando que o gargalo é a latência de rede até o Compras.gov por página buscada, não a
escrita no banco (já rápida, upsert em lote — ver acima). Fixado em **90 páginas, concorrência 10**:
~27s medido, folga de mais da metade do teto de 60s mesmo sem contar a latência adicional que
produção terá e o teste local não captura. 688/90 ≈ 7,6 semanas ≈ ~1,9 meses por volta completa.

**Verificação.** Calibração medida contra a API real do Compras.gov + Postgres **local** (não mock —
`next dev` local, mesmo padrão do fechamento do SINAPI em 2026-08-08), tabela acima. Suíte: 23 testes
novos/alterados (`catalogoComprasGov.test.ts` cobre os dois modos de escrita por mutação —
`createMany` não chamado em modo upsert e vice-versa —, `atualizar-catalogo-compras-gov/route.test.ts`
cobre fail-closed, cursor a partir do banco e o wraparound de fim de catálogo), 99 arquivos / 959
testes da suíte inteira, typecheck e lint limpos.

**Pendências.** (1) O primeiro deploy com o cron novo precisa confirmar que o plano Hobby aceita um
segundo cron job (hoje só existe `/api/jobs/lembretes`) — o usuário já tem um plano B (carga manual
todo dia 1º) caso não aceite, então isto deixou de ser bloqueante, só não foi verificado ainda.
(2) `CRON_SECRET` já existe em produção (usado por
`/api/jobs/lembretes`) e é reaproveitado aqui — não foi criada variável nova. (3) SINAPI segue sem
dado em produção — exige upload manual do `.xlsx` (WAF da Caixa bloqueia download automatizado, ver
M17), fora do escopo desta entrada.
