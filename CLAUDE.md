# CLAUDE.md — Plataforma de Pesquisa de Preços (Divisão de Compras / CMS)

Briefing operacional do projeto para o Claude Code. Leia antes de qualquer tarefa.
Fonte de verdade do escopo: [PRD-Claude_divisão_compras.md](PRD-Claude_divisão_compras.md).

---

## 1. O que é

Plataforma web **interna** de orquestração da pesquisa de preços para a Divisão de Compras
da Câmara Municipal de Santos. Não é um software de procurement genérico — é uma ferramenta
especializada para a fase mais crítica da cotação pública: **descobrir, qualificar, registrar
e consolidar preços** com rapidez e rastreabilidade, em conformidade com a **IN SEGES/ME 65/2021**.

O sistema orienta a melhor rota de pesquisa por tipo de objeto e centraliza três fontes:
1. **Contratações públicas similares** (fonte prioritária pela IN 65/2021).
2. **Sites eletrônicos admissíveis** (com bloqueio de marketplaces).
3. **Fornecedores diretos** consultados por e-mail.

Saída final de cada processo: **série de preços tratada + memória de cálculo** pronta para
instrução processual.

### Princípios de conformidade (regras de negócio que o código deve respeitar)
- **Priorizar fontes públicas**; exigir justificativa registrada quando não for possível usá-las.
- **Nenhum preço entra na estimativa sem vínculo a fonte, data e evidência armazenada.**
- Pesquisa direta exige **registro de ≥3 fornecedores consultados** (e dos que não responderam),
  salvo exceção justificada e aprovada.
- Captura **obrigatória de data/hora de acesso** em evidências de sites.
- Exigir **análise crítica** quando houver grande dispersão de preços.
- Toda ação deve ser **rastreável por usuário** (auditoria).

---

## 2. Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | **Next.js (App Router)** | Rotas, painéis, server actions, route handlers |
| UI | **React + TypeScript** | `strict: true` no tsconfig |
| Estilo | **Tailwind CSS** | Utilitário; tokens centralizados (ver §5) |
| Componentes | **shadcn/ui** | Tabelas, formulários, modais, filtros, dashboards |
| Backend | **Node.js** (runtime do Next) | Server actions + route handlers; serviços isolados |
| Banco | **PostgreSQL** | Processos, fontes, fornecedores, respostas, logs |
| ORM | **Prisma** | Schema único em `prisma/schema.prisma`; migrations versionadas |
| E-mail | **Resend** | Disparo de cotações e lembretes (SLA) |
| Deploy | **Vercel** | Padrão; manter compatível com hospedagem própria (Node) |

**Decisões fixadas** (o PRD deixava em aberto):
- **Auth:** implementar com solução própria sobre Postgres/Prisma (sessão + RBAC). Não usar
  Supabase nesta fase — Postgres + Prisma já atendem. Reavaliar só se o time pedir.
- **Storage de uploads:** abstrair atrás de uma interface (`lib/storage`) — começar com
  armazenamento local/Blob da Vercel, trocável depois sem mexer no domínio.
- Gerenciador de pacotes: **pnpm**.

Não confirme versões de bibliotecas de memória — verifique `package.json` antes de afirmar.

---

## 3. Convenções

### Geral
- **TypeScript estrito** em todo o código. Sem `any` implícito; tipar fronteiras de dados.
- Idioma: **código e identificadores em inglês**; **UI, mensagens ao usuário e domínio em
  português (pt-BR)**. Termos de domínio podem ficar em pt-BR quando mais claros
  (ex.: `aderencia`, `memoriaDeCalculo`) — seja consistente dentro de um módulo.
- **Server Components por padrão**; `"use client"` só quando há interatividade/estado.
- **Mutações via Server Actions**; leitura pesada/integrações externas via route handlers.
- Validação de entrada com **Zod** em toda fronteira (forms, actions, API).
- **Nunca** montar a estimativa sem fonte + data + evidência (validar no domínio, não só na UI).

### Nomenclatura de arquivos
- Componentes React: `PascalCase.tsx` (`PriceSeriesTable.tsx`).
- Utilitários/hooks/serviços: `camelCase.ts` (`useSupplierScore.ts`, `priceStats.ts`).
- Rotas (App Router): pastas em `kebab-case`; arquivos especiais do Next (`page.tsx`,
  `layout.tsx`, `route.ts`) conforme a convenção do framework.
- Tabelas/colunas Prisma: modelos em `PascalCase`, campos em `camelCase`.

### Qualidade
- **ESLint + Prettier** obrigatórios; rodar antes de concluir tarefa.
- Lógica de domínio (estatística de preços, regras da IN 65, score de fornecedor) vive em
  `src/lib/domain/` e é **testada com unidade** — é onde mora o risco de conformidade.
- Componentes pequenos e com responsabilidade única; arquivo grande é sinal de que faz coisas demais.
- Mensagens de commit em pt-BR, no imperativo.

---

## 4. Estrutura de pastas

```
.
├── prisma/
│   ├── schema.prisma          # Modelo de dados (Processo, Item, Fonte, Fornecedor, ...)
│   └── migrations/
├── src/
│   ├── app/                   # App Router
│   │   ├── (auth)/            # Login / autenticação
│   │   ├── (app)/             # Área autenticada
│   │   │   ├── dashboard/     # Visão geral, gargalos, taxas de resposta
│   │   │   ├── processos/     # Cadastro de objeto + orquestração da pesquisa
│   │   │   │   └── [id]/      # Detalhe: fontes, evidências, série de preços
│   │   │   ├── contratacoes/  # Módulo de contratações públicas similares
│   │   │   ├── sites/         # Validador de sites admissíveis (listas branca/cinza/vermelha)
│   │   │   ├── fornecedores/  # Cadastro vivo + score + histórico
│   │   │   ├── cotacoes/      # Disparo e controle de e-mails (SLA, lembretes)
│   │   │   └── relatorios/    # Relatório resumido/completo + memória de cálculo
│   │   ├── api/               # Route handlers (integrações, webhooks, exportações)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui (gerado)
│   │   └── <feature>/         # Componentes específicos de cada módulo
│   ├── lib/
│   │   ├── domain/            # Regras de negócio + estatística de preços (testado)
│   │   ├── db.ts             # Cliente Prisma (singleton)
│   │   ├── auth/              # Sessão + RBAC
│   │   ├── email/             # Templates + integração Resend
│   │   ├── storage/           # Abstração de upload de arquivos
│   │   └── validations/       # Schemas Zod compartilhados
│   ├── hooks/
│   └── types/
├── public/
├── CLAUDE.md
└── PRD-Claude_divisão_compras.md
```

> A estrutura acima é o alvo. Ela ainda **não existe** — o projeto está só com os documentos.
> Ao iniciar a implementação, scaffold seguindo este layout; não invente pastas paralelas.

### Modelos de domínio centrais (orientação para o schema Prisma)
`User` · `Processo` · `Item` (objeto cadastrado) · `Fonte` (pública/site/fornecedor) ·
`Evidencia` (arquivo + data/hora + URL) · `Fornecedor` · `Cotacao` (e-mail + SLA + status) ·
`Proposta` (com checklist de validade) · `SeriePreco` / `PrecoConsolidado` · `AuditLog`.

---

## 5. Identidade visual

Cara de **sistema administrativo moderno**: limpo, funcional, sóbrio, denso em dados.
Inspiração: **Linear, Notion, Vercel Dashboard, Retool**. Funcionalmente, espelha a lógica
de filtros/relatórios do **Painel de Preços / Compras.gov**. **Não** parecer "startup colorida".

### Princípios
- Ênfase em **tabelas fortes, filtros evidentes, painéis compactos e status destacados**.
- Leitura rápida, pouco ruído visual, alta densidade informacional.
- Hierarquia clara entre: **processo → fonte → evidência → resposta do fornecedor → resultado final**.

### Tokens (centralizar em Tailwind/CSS variables; ajustar na implementação)
- **Paleta:** base neutra (cinzas/`zinc`/`slate`) + **uma** cor primária discreta
  (azul institucional sóbrio). Cor usada para ação/estado, não para decoração.
- **Status semânticos** (consistentes em todo o app):
  - `aderente` / válido → verde discreto
  - `parcial` / com ressalva → âmbar
  - `não aderente` / inválido / marketplace bloqueado → vermelho
  - `pendente` / aguardando resposta → cinza/azul neutro
- **Tipografia:** sans-serif legível (Inter ou similar); números tabulares em colunas de preço.
- **Densidade:** espaçamento compacto em tabelas; respiro maior em formulários.
- **Modo escuro:** desejável, via tokens (não hardcodar cores).

### Componentes-chave a padronizar cedo
DataTable com filtros/ordenação/paginação · Badge de status · Painel de evidência (arquivo +
metadados de data/hora) · Comparador lado a lado de fontes · Checklist de validade da proposta ·
Card de métrica do dashboard.

---

## 6. Escopo desta versão

**Dentro:** cadastro de objeto, motor de estratégia de busca, contratações públicas similares,
validador de sites, cadastro de fornecedores, disparo/controle de e-mails de cotação, checklist
de propostas, consolidação da série de preços, dashboards, auth/RBAC, busca/filtros, relatórios.

**Fora (não priorizar):** Kanban, multiempresa, planos premium, chat/mensagens, calendário,
landing page comercial. O valor está na **inteligência operacional da pesquisa**, não em
recursos sociais ou comerciais.

## 7. Processo de trabalho
- Quebrar o build em **milestones entregáveis**; core primeiro, iterar depois.
- Testar cada milestone antes de avançar.
- Lógica de conformidade (IN 65/2021) é a parte de maior risco — priorizar testes nela.
- Antes de finalizar qualquer tarefa, responder à pergunta **"Como você confirma que isso está correto?"**:
  - Descrever como a verificação será feita (ex.: rodar testes, lint, build, checar UI no navegador,
    validar regra de negócio específica da IN 65/2021).
  - Executar essa verificação automaticamente antes de reportar a tarefa como concluída.
  - Só reportar sucesso após a verificação ter sido executada e ter passado; se não for possível
    verificar (ex.: mudança de UI sem acesso ao navegador), declarar isso explicitamente em vez de
    presumir sucesso.
- **Sempre que o Claude cometer um erro, adicionar uma nova regra a este arquivo** para impedir que
  o mesmo erro se repita. Este CLAUDE.md concentra o aprendizado acumulado do projeto — cada
  correção vira uma regra permanente na seção 9, não só uma explicação isolada no commit. Ao
  corrigir algo, perguntar: "que regra eu escreveria aqui para nunca cometer esse erro de novo?"

---

## 8. Permissões do agente

Em vez de liberar o Claude para executar qualquer ação sem confirmação, as ações são divididas em
três grupos. Esta seção define o padrão do projeto; ela não substitui os limites de segurança
padrão do Claude Code, apenas os torna explícitos para o contexto deste repositório.

### Permitidas automaticamente (sem pedir confirmação)
- Leitura, busca e exploração do repositório.
- Criar/editar arquivos de código em `src/`, `prisma/schema.prisma`, `docs/`, testes.
- Rodar lint, typecheck, testes e build localmente.
- Rodar `prisma migrate dev` contra banco **local/dev**.
- Criar commits locais (sem `push`).

### Exigem autorização explícita do usuário antes de executar
- `git push` (principalmente para `main`); abrir/fechar PRs; comentar em PRs/issues.
- `prisma migrate deploy` ou qualquer migration contra banco de **produção**.
- Deploy manual na Vercel; alterar variáveis de ambiente de produção.
- Qualquer envio real de e-mail (Resend ou outro provedor), mesmo em teste — ver item 3 da seção 9.
- Instalar, remover ou alterar versão de dependências (`package.json`).
- Alterar configuração de CI/CD, hooks de Git, ESLint/Prettier, `tsconfig.json`.
- Excluir dados já persistidos de `Processo`, `Fonte`, `Evidencia`, `Fornecedor` ou `Cotacao`.

### Totalmente bloqueadas (nunca executar, mesmo se solicitado)
- `git push --force` para `main`/`master`; `git reset --hard`; `git clean -f` sem confirmação explícita.
- Migrations destrutivas (`DROP TABLE`, `TRUNCATE`) contra o banco de produção.
- Qualquer bypass das regras de conformidade da IN 65/2021 (ex.: permitir preço sem
  fonte+data+evidência "temporariamente" ou "só para teste").
- Remover ou desabilitar o `AuditLog` / trilha de auditoria.
- Commitar segredos/credenciais (`.env`, chaves de API) no repositório.
- Pular hooks de commit (`--no-verify`) ou desabilitar lint/typecheck para "destravar" um build.

---

## 9. Lições aprendidas (regras anti-regressão)

Regras nascidas de erros reais já cometidos neste projeto. Cada uma existe para que o mesmo erro
não se repita — não remover uma entrada aqui sem entender por que ela foi escrita.

1. **Milestones de UI mock não herdam o checklist de milestones de backend.** `[UI (mock)]` e
   integração real são fases distintas no `docs/PLAN.md`; não sobrescrever o objetivo/entregas de
   um milestone com as de outro só porque parecem relacionados.
2. **`lib/domain/` não importa de `components/`.** Domínio é puro e testável isoladamente; tipos
   compartilhados moram em `lib/domain`, componentes reexportam — nunca o inverso.
3. **Disparo de e-mail (cotação, lembrete) não é responsabilidade do sistema.** A Câmara envia
   externamente; o sistema só registra. Nunca implementar envio real via Resend ou outro provedor
   para o fluxo de cotação; jobs de lembrete geram apenas relatório.
4. **Verificar a API real da lib de UI instalada antes de aplicar padrões de outra lib** (ex.:
   `asChild` é do Radix/shadcn, não existe na Base UI). Checar `package.json` e a versão instalada
   antes de assumir uma prop ou padrão.
5. **Tokens de design (CSS variables) não podem se auto-referenciar.** Verificar no DOM/browser que
   o valor resolvido é o esperado antes de considerar um token "conectado".
6. **Enums do Prisma e valores de domínio/UI usam a mesma convenção de string** (hífen vs.
   underscore etc.). Ao criar um enum novo, checar todos os pontos de comparação (`StatusBadge`,
   filtros, testes) usam o mesmo formato.
7. **Nunca adicionar `prisma migrate deploy` ao build command da Vercel** — trava o build por
   conexão de DB bloqueada. Migrations de produção rodam sob demanda via rota administrativa
   protegida (`/api/admin/migrate`), nunca durante o build.
8. **Links de evidência para portais públicos (PNCP, Painel de Preços) são validados abrindo a URL
   real gerada**, não só verificando que a request original teve sucesso — formato de URL errado
   invalida a evidência.
9. **Buscas de contratações/preços similares sempre excluem o CNPJ do próprio órgão
   (`ORGAO_CNPJ`).** Um contrato não pode ser referência de preço para sua própria renovação.
10. **Parsers de planilha toleram variação de nome de coluna e linhas com estatística zerada**
    (pesquisa de preço ainda não feita). Nunca exigir nome exato de coluna ou valor > 0 como
    pré-condição de linha válida.
11. **Chamadas externas por item, em loop, rodam com concorrência limitada — nunca sequencial
    puro.** Timeouts de função serverless somam retries/backoff por item; processamento serial
    estoura o limite em produção.
12. **Toda resposta de IA usada para decisão de negócio é validada com Zod antes de uso.** Nunca
    confiar em JSON de modelo de IA sem parsing defensivo.
13. **Ao expor uma entidade nova na UI, confirmar que a página lê do Prisma, não de fixtures
    mock**, antes de considerar o módulo pronto. Migrar o backend não migra automaticamente as
    telas que ainda importam fixtures.
14. **Guardas de idempotência/unicidade em server actions são atômicas** — update condicional
    dentro da transação (`updateMany` com o estado esperado no `where`, abortando se `count === 0`)
    e/ou constraint `@unique` no schema, nunca check-antes-de-escrever fora da transação. Duas
    requisições concorrentes que leem o mesmo estado antes de gravar duplicam registros — ex.:
    promover o mesmo candidato de similaridade duas vezes duplicava `Fonte`/`PrecoConsolidado` e
    distorcia a série de preços. Constraint nova acopla código + migration: só vale em produção
    após aplicar via `/api/admin/migrate` (ver item 7), senão a gravação quebra em runtime.
15. **Configuração do Prisma 7 mora em `prisma.config.ts`, não no `schema.prisma`.** A propriedade
    `directUrl` no bloco `datasource` foi **removida** no Prisma 7 (erro P1012). O split
    pooled/direct funciona assim: `datasource.url` em `prisma.config.ts` vale **só para o CLI**
    (`migrate deploy`/`status`) e aponta para `DIRECT_URL`; a app usa `DATABASE_URL` (pooled)
    passado ao `PrismaPg` adapter em `src/lib/db.ts`. Os dois são independentes — não existe campo
    `directUrl` em lugar nenhum no Prisma 7. Sempre conferir os tipos reais em
    `node_modules/.pnpm/@prisma+config@*/.../dist/*.d.ts` antes de assumir um campo de config.
16. **Nunca usar `require.resolve()` para localizar binários/CLIs em route handlers.** O Turbopack
    faz análise estática de `require.resolve()` — mesmo dentro de `createRequire` — e segue os
    requires internos do pacote alvo, quebrando o build em dependências opcionais com assets
    exóticos (no caso do CLI do Prisma: `@prisma/dev` com `.wasm`/`.tar.gz`).
    `serverExternalPackages` **não** evita isso (vercel/next.js#65828). Usar
    `path.join(process.cwd(), "node_modules", ...)` + `existsSync`, que escapa do tracer.
17. **Erros de build/lint em `.claude/worktrees/` são ruído de worktrees órfãos, não do código.**
    Worktrees de agentes antigos ficam com `.next`/`node_modules` stale e entram na varredura de
    ferramentas. Cada ferramenta precisa do ignore próprio (vitest e eslint são configs separados);
    ao ver erro apontando para um caminho sob `.claude/worktrees/`, adicionar o ignore em vez de
    investigar o código.
18. **Globs de `outputFileTracingIncludes` apontam para `node_modules/.pnpm/`, não para
    `node_modules/<pkg>`, quando a dependência é transitiva.** O pnpm só cria symlink no topo para
    dependências diretas do projeto; transitivas ficam isoladas no store. `@prisma/engines` é
    dependência do pacote `prisma` (não do `package.json` daqui), então
    `./node_modules/@prisma/engines/**` **não casa com nada** — o glob falha em silêncio, o build
    passa e a função serverless quebra só em runtime com `Cannot find module '@prisma/engines'`.
    Antes de confiar num glob de tracing, rodar `ls` no caminho exato: se não existir localmente,
    não vai existir no bundle. Usar `./node_modules/.pnpm/@prisma+engines@*/node_modules/...`.
19. **Migration nova só está "pronta" depois de aplicada em produção, não depois do merge.**
    Código e migration sobem em tempos diferentes: o deploy leva o código, mas o banco só muda por
    ação explícita (`/api/admin/migrate` ou `migrate deploy` — ver itens 7 e 14). Um schema com
    coluna nova em produção sem a migration aplicada quebra a gravação em runtime, silenciosamente,
    até alguém exercitar o fluxo. Ao terminar uma tarefa que inclui migration, rodar
    `migrate status` contra produção e confirmar `Database schema is up to date!` antes de dar a
    entrega por concluída.
20. **Credencial de produção nunca entra em arquivo versionado, nem "só para testar".**
    `prisma.config.ts` e `.env.example` vão para o git — o valor real mora só no `.env` (coberto
    por `.gitignore`) e no painel da Vercel. `process.env["NOME_DA_VAR"]` recebe o **nome** da
    variável, nunca a connection string. Se uma senha chegar a um arquivo rastreado, removê-la não
    basta: verificar `git log --all -S "<segredo>"` e rotacionar a credencial se houver qualquer
    commit.
