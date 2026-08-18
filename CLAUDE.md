# CLAUDE.md — Plataforma de Pesquisa de Preços (Divisão de Compras / CMS)

Briefing operacional do projeto para o Claude Code. Leia antes de qualquer tarefa.

Fonte de verdade do escopo: [PRD-Claude_divisão_compras.md](PRD-Claude_divisão_compras.md) — visão
condensada de arquitetura e requisitos.
Especificação detalhada do produto: [PRD_divisao_compras.md](PRD_divisao_compras.md) — os 8 módulos
com regras de negócio, fluxo operacional alvo e métricas. Consulte-o ao desenhar funcionalidade
nova: há requisito ali que ainda não virou código (ex.: o Módulo 8, repositório de inteligência de
mercado, do qual só existe a semente no campo `ResultadoSimilaridade.termoBuscaUsado`).

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
| IA | **OpenAI** | Extração do TR, ranking de similaridade e assistente; Perplexity opcional para busca web |
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
│   │   │   ├── cotacoes/      # Registro e controle de cotações (SLA) — o envio é externo (§9.3)
│   │   │   ├── relatorios/    # Relatório resumido/completo + memória de cálculo
│   │   │   └── assistente/    # Instruções de pesquisa configuráveis (M13)
│   │   ├── api/               # Route handlers (integrações, webhooks, exportações)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                # shadcn/ui (gerado)
│   │   └── <feature>/         # Componentes específicos de cada módulo
│   ├── lib/
│   │   ├── domain/            # Regras de negócio + estatística de preços (testado)
│   │   ├── actions/           # Server actions (mutações)
│   │   ├── similaridade/      # Motor de ranqueamento de contratações similares
│   │   ├── assistente/        # Ferramentas, prompt e laço do assistente (M13)
│   │   ├── ia/                # Provedores de IA (OpenAI) e tipos
│   │   ├── integracoes/       # PNCP, Perplexity, Painel de Preços
│   │   ├── relatorios/        # Memória de cálculo (PDF) e série de preços (Excel)
│   │   ├── sheets/            # Planilha Google como registro mestre
│   │   ├── migrations/        # Runner das migrations de produção
│   │   ├── db.ts             # Cliente Prisma (conexão preguiçosa — ver §9.54)
│   │   ├── auth/              # Sessão + RBAC + auditoria
│   │   ├── storage/           # Abstração de upload de arquivos
│   │   └── validations/       # Schemas Zod compartilhados
│   ├── hooks/
│   └── types/
├── public/
├── CLAUDE.md
└── PRD-Claude_divisão_compras.md
```

> Esta estrutura **existe e está em produção** (M0 a M13 concluídos — ver [docs/PLAN.md](docs/PLAN.md)).
> Siga o layout ao acrescentar código; não invente pastas paralelas. Leia o que já existe antes de
> criar: quase toda necessidade nova já tem um módulo vizinho com a convenção estabelecida.

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

**Fora (não priorizar):** Kanban, multiempresa, planos premium, chat/mensagens **entre pessoas**,
calendário, landing page comercial. O valor está na **inteligência operacional da pesquisa**, não em
recursos sociais ou comerciais.

> **Ressalva — o assistente de IA (M13) não é o "chat/mensagens" excluído acima.** A exclusão vale
> para comunicação entre usuários (recurso social). O assistente de pesquisa é ferramenta de
> pesquisa: interface conversacional sobre PNCP + web + base interna, porque a busca por
> similaridade é iterativa e o pipeline de passada única do M10 não sabe refinar o termo quando o
> resultado sai fraco. Decidido com o usuário em 2026-07-27. **Não remover este módulo alegando
> que "chat está fora do PRD"** — é exatamente o modo de falha da §9.33.

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
18. **Copiar arquivos para o bundle ≠ torná-los resolvíveis: com pnpm, dependência transitiva
    exige `NODE_PATH`, não só `outputFileTracingIncludes`.** O pnpm só cria symlink em
    `node_modules/<pkg>` para dependências **diretas**; transitivas vivem apenas em
    `.pnpm/<pkg>@<versão>[_hash]/node_modules`. `@prisma/engines` é dependência do pacote `prisma`,
    não do `package.json` daqui — logo `./node_modules/@prisma/engines/**` não casa com nada e o
    glob falha em silêncio. Mas **corrigir só o glob não resolve**: o CLI faz
    `require("@prisma/engines")` (resolução por nome, que sobe a árvore de `node_modules`) e o
    bundle da Vercel não recria os symlinks — os arquivos chegam num caminho que o Node nunca
    consulta. A rota `/api/admin/migrate` resolve exportando `NODE_PATH` com os diretórios
    `.pnpm/@prisma+*/node_modules` para o subprocesso, descobertos em runtime via `readdirSync`
    (o sufixo de hash de peer-deps no nome do diretório não é previsível — não hardcodar).
    Regra geral: ao empacotar um binário/CLI, perguntar **onde o require vai procurar**, não só
    se o arquivo foi copiado; e validar a resolução localmente com `spawnSync` + `cwd` fora do
    projeto antes de gastar um ciclo de deploy.
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
    commit. Ao pedir que o usuário edite um arquivo de ambiente, **nomear o caminho exato** —
    `.env` e `.env.example` são confundidos com facilidade, e a edição no arquivo errado coloca
    segredo no repositório (aconteceu duas vezes na mesma sessão).
21. **Estado de deploy vem de `get_deployment`, nunca de `list_deployments` nem de HTTP.**
    `list_deployments` serve cache e reporta `QUEUED` para builds que já terminaram;
    `get_deployment` dá o `readyState` real. Pior é inferir por HTTP: a proteção de deployment da
    Vercel responde `302` numa URL de preview, o domínio de produção responde `200` servindo o
    **deploy anterior**, e nenhum dos dois diz nada sobre o build novo. Confirmar deploy pelo campo
    `alias` conter o domínio de produção **e** `readyState: "READY"`. O sinal definitivo de que um
    fix chegou é **exercitar a funcionalidade corrigida**, não o build ficar verde.
22. **Monitor cujo filtro não casa com nenhum estado terminal fica 15 minutos em silêncio e não
    informa nada.** Antes de armar, perguntar: "se isto falhar agora, meu filtro emite alguma
    coisa?". Um monitor que só reconhece sucesso é indistinguível de um travado. Cobrir sucesso,
    falha esperada e o estado intermediário — e não usar código HTTP como proxy de estado quando
    existe API que responde diretamente.
23. **Verificação local não substitui verificação no ambiente real quando o defeito é do
    empacotamento.** `pnpm build` verde prova que o código compila, não que
    `outputFileTracingIncludes` copiou o que precisava nem que o require vai resolver em
    `/var/task`. Para bugs de bundling/runtime serverless, ou se reproduz o isolamento localmente
    (`spawnSync` com `cwd` fora do projeto, container limpo) ou se declara explicitamente que a
    correção é **hipótese não verificada** até o deploy exercitar o caminho. Nunca apresentar
    "build passou" como evidência de que o bug foi corrigido.
24. **Diagnóstico incompleto gera correção que passa em todos os testes e não corrige nada.**
    O erro `Cannot find module` foi lido como "o arquivo não foi copiado" quando era "o arquivo não
    é encontrável" — duas causas diferentes, e a primeira correção tratou a errada, custando um
    ciclo de deploy. Antes de corrigir, reproduzir o mecanismo exato da falha (qual chamada, qual
    caminho de busca, qual resolução) em vez de agir na primeira hipótese plausível. Se a segunda
    tentativa falhar pela mesma razão, **parar e investigar** em vez de tentar uma terceira
    variação do mesmo palpite.
25. **Quando o usuário escolhe uma ordem de execução, seguir essa ordem — inclusive as etapas que
    dependem dele.** Nesta sessão o usuário escolheu "criar variáveis na Vercel → depois push"; o
    push foi feito antes da confirmação de que as variáveis existiam. Não deu problema por acaso
    (nenhuma era lida em build time), mas a decisão de sequência era dele. Se uma etapa depende de
    ação do usuário e ela não foi confirmada, **perguntar** — não assumir que o passo já ocorreu
    nem tratar ausência de resposta como aprovação.
26. **Glob de tracing é cirúrgico, nunca genérico — `@prisma+*` estoura o limite da função.**
    Ampliar o padrão para pegar "tudo do escopo" arrasta `@prisma/client` (85 MB), `studio-core`
    (38 MB) e `@prisma/dev` (15 MB): 228 MB numa função só, e o deploy falha **depois** do
    `Build Completed`, na fase `Deploying outputs...`. Listar explicitamente os pacotes que o
    comando alvo carrega (para `migrate deploy/status`: `engines`, `engines-version`,
    `get-platform`, `fetch-engine`, `debug`, `config` — 85 MB) e medir com
    `du -csh` antes de commitar. Sintoma diagnóstico: `lambdaRuntimeStats` sobe (3 → 5 lambdas) e
    o log de build termina sem erro em "Deploying outputs...".
27. **`state: "ERROR"` com `Build Completed` no log significa falha no empacotamento, não na
    compilação.** `errorsOnly: true` nos logs não mostra nada porque o build em si passou — é
    preciso ler o `tail` do log e observar em que fase ele para. Compilação verde não é deploy
    verde; as fases seguintes (tracing, upload das funções) falham por motivos próprios,
    tipicamente tamanho.
28. **Lista explícita de pacotes no tracing precisa incluir a árvore transitiva, não só o primeiro
    nível.** Ao estreitar o glob para caber no limite (item 26), foram listados os 6 pacotes que o
    CLI carrega diretamente — mas `@prisma/config` depende de `effect`, que ficou de fora, e a rota
    passou de `Cannot find module '@prisma/engines'` para `Cannot find module 'effect'`. Restringir
    por tamanho e enumerar por completude são objetivos em tensão: cortar demais quebra a
    resolução, incluir demais estoura a função. A verificação local precisa espelhar **o conjunto
    exato** que o glob copia — não basta testar `require("@prisma/config")` com o `node_modules`
    completo da máquina, porque ali as transitivas existem e o teste passa em falso. Derivar a
    lista com `pnpm list --depth=N` ou percorrer os `dependencies` dos `package.json` envolvidos,
    em vez de enumerar de memória.
29. **Erro que muda de mensagem é progresso, não fracasso — mas cada iteração de tracing custa um
    deploy.** `@prisma/engines` → `effect` prova que o `NODE_PATH` funcionou e que a causa raiz
    estava certa. Ainda assim, três ciclos foram gastos porque cada correção foi validada só
    parcialmente. Para dependência de binário/CLI em serverless, o teste local tem de reproduzir o
    isolamento real (copiar apenas os caminhos do glob para um diretório limpo e rodar o comando
    de lá), ou a alternativa arquitetural — executar o SQL das migrations via `pg`, sem subprocesso
    nem CLI empacotado — passa a ser mais barata que continuar iterando.
30. **"Deploy verde" não significa "aplicação funcionando" — exercitar o fluxo real é a única
    prova.** Durante horas esta sessão tratou a produção como saudável porque o build estava
    `READY` e `/login` respondia `200`. Ambos eram verdade e ambos eram irrelevantes: a
    `DATABASE_URL` de produção apontava para `localhost:5432`, e **toda** query falhava com P1001
    (`Can't reach database server`). A página de login renderiza sem tocar no banco — só o `POST`
    do formulário revela o erro. Antes de declarar um deploy saudável, exercitar pelo menos um
    caminho que atravesse o banco (login real, uma listagem autenticada), não só um `GET` de página
    pública. `get_runtime_errors` da Vercel expõe isso em segundos e deveria ser consultado ao
    primeiro sinal de problema em produção, não depois de esgotar hipóteses.
31. **Migration aplicada com sucesso não prova que a app tem o banco certo — são caminhos
    independentes.** `prisma migrate deploy` roda da máquina do dev com `DIRECT_URL`; a aplicação
    usa `DATABASE_URL` dentro da função serverless. Nesta sessão o `Database schema is up to date!`
    convivia com uma app que não alcançava banco nenhum, porque as duas variáveis apontavam para
    lugares diferentes (Supabase vs. localhost). Ao configurar um ambiente novo, conferir as duas
    **e** validar cada uma pelo seu próprio caminho: migration pelo CLI, `DATABASE_URL` por uma
    query real vinda da aplicação publicada.
32. **Na Vercel, `DATABASE_URL` de app serverless usa o Transaction pooler (porta 6543), não a
    conexão direta (5432).** Funções abrem e fecham conexão a cada invocação; sem pooler o Postgres
    esgota o limite. A conexão direta fica reservada para `DIRECT_URL` (CLI de migrations, que
    precisa de DDL e sessão estável). Variável de ambiente nova ou editada **só passa a valer após
    redeploy** — editar no painel não afeta funções já publicadas, e o campo aparecer vazio ao
    reabrir é comportamento normal de variável marcada como Sensitive, não perda do valor.
    **Ressalva descoberta em 2026-07-25 (ver §9.43): "conexão direta para migrations" vale para o
    CLI rodando da máquina do dev, NÃO para código dentro de função serverless** — de lá o host
    direto do Supabase é inalcançável, e o alvo correto é o Session pooler.
33. **Lição documentada aqui não é lição implementada — conferir no código antes de confiar.**
    As regras §9.8 (formato da URL do PNCP) e §9.9 (excluir o CNPJ do próprio órgão) estavam
    escritas neste arquivo há meses enquanto o código em produção não as aplicava: ficaram num
    branch de agente (`d781a16`, PR #9) que foi deployado como preview e **nunca mesclado**. Em
    produção, toda evidência de contratação similar apontava para link inválido e o contrato em
    renovação podia servir de referência de preço para si mesmo. Ao invocar uma lição do §9 como
    garantia, verificar que ela existe no código (`grep` pela constante/variável que ela cita);
    ao fechar uma tarefa em branch, confirmar o merge em `main`, não só que o preview subiu.
34. **Estado em nível de módulo (flag de "avisar uma vez") exige `vi.resetModules()` + import
    dinâmico no teste — não um reset exportado.** Módulo com `import "server-only"` não deve expor
    função só para teste: prefixo `__` e JSDoc são convenção, não barreira, e nada impede um
    chamador futuro de silenciar um aviso de conformidade em produção. `vi.resetModules()` seguido
    de `await import(...)` cria instância nova com a flag zerada, o que já isola os casos; testes
    que importam o módulo estaticamente não interferem nessa instância. Antes de adicionar
    escapatória de teste ao código de produção, **remover e rodar a suíte** — se continuar verde,
    a escapatória não protegia nada.
35. **Justificativa de design precisa de evidência, não de plausibilidade.** Um helper foi mantido
    com a teoria de que testes pré-existentes consumiriam o aviso antes dos novos; a teoria era
    plausível e estava errada, e bastou remover o helper e rodar a suíte para descobrir. Vale para
    agente e para revisor: ao afirmar que algo é necessário, dizer **qual experimento** confirma —
    mutação (quebrar a regra e ver o teste falhar), remoção (tirar o código e ver o que quebra) ou
    execução isolada. Teste que passa não prova que protege; só a mutação prova.
36. **`pnpm add`/`install` que aborta no meio deixa `node_modules` em cirurgia — a correção é
    refazer a árvore, não reparar link por link.** O pnpm renomeia pacotes para
    `node_modules/.ignored_<pkg>` durante o install e os restaura no fim; se o processo morre antes,
    eles **ficam** lá e somem do topo. Foi assim que `vitest` e `next` desapareceram de
    `node_modules/.bin` e `pnpm test`/`build`/`typecheck` pararam de rodar — some justamente a
    capacidade de verificar o trabalho já feito. Rodar `pnpm install` de novo **não conserta**: ele
    tropeça em reparse points órfãos (`mode la---`, 0 bytes, alvo inexistente), quase sempre
    binários de outra plataforma (`lightningcss-linux-x64-gnu`, `@img/sharp-libvips-linux-x64`), e
    remover um só revela o próximo. Correção: `Remove-Item node_modules -Recurse -Force` +
    `pnpm install` + **`pnpm prisma generate`** (o client gerado vive em `node_modules`; sem ele
    2 suítes falham com `Cannot find module '.prisma/client/default'`, o que parece bug de código
    e não é). Seguro porque `node_modules` é gitignored e derivável do lockfile — confirmar com
    `git ls-files node_modules` (0) antes. Corolário mantido: com o ambiente quebrado, **não
    commitar** trabalho pendente — sem suíte executável não há verificação (§9.23); registrar o
    estado no `docs/PLAN.md` e parar.
37. **Testar a capacidade, não um proxy dela — `whoami /priv` dá falso negativo neste PC.**
    A §9.36 mandava, antes de instalar, rodar
    `whoami /priv | Select-String SeCreateSymbolicLink` e, se viesse vazio, **reiniciar o
    computador**. O teste está errado e o remédio era desnecessário: a conta é administradora mas o
    processo roda **sem elevação**, e o UAC marca `BUILTIN\Administradores` como *"Grupo usado
    apenas para negar"* — como `SeCreateSymbolicLink` é concedido por esse grupo, ele **nunca**
    aparece no token, por mais reboots que se dê (em 2026-07-25 a máquina foi reiniciada e o output
    seguiu vazio). Enquanto isso symlinks funcionavam normalmente, porque o **Modo de
    Desenvolvedor** os libera pela flag `SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE`, que não
    passa pelo privilégio. Diagnóstico correto é criar um symlink de teste em `$env:TEMP` e ver se
    dá certo. Regra geral: quando existir uma forma de **exercitar** a capacidade, exercitá-la — um
    indicador indireto pode estar ausente com o sistema perfeitamente saudável, e tratar isso como
    falha custa um reboot e uma sessão inteira de diagnóstico na direção errada.
    **Reincidiu em 2026-07-30, com o mesmo formato:** `powershell.exe` foi procurado pelo nome, deu
    `command not found`, e daí concluí que o interop do WSL estava indisponível e que a suíte era
    inexecutável — cheguei a pedir ao usuário que rodasse os testes por conta própria. `cmd.exe` e
    `powershell.exe` simplesmente **não estão no PATH do WSL**; pelo caminho completo
    (`/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`) o interop funciona, e por ele
    rodaram os 602 testes e o `next build`. Antes de declarar uma capacidade ausente, tentar o
    caminho absoluto e conferir `/proc/sys/fs/binfmt_misc/WSLInterop`. Ausência no PATH nunca é
    prova de ausência da ferramenta.
38. **Pacote com `exports` condicional tem APIs diferentes por runtime — conferir no entry point
    que o app realmente usa, não em `node -e`.** Ao integrar `@sentry/nextjs`, um teste rápido em
    CJS mostrou `captureException` como função; o mesmo import via `tsx` (ESM) devolveu
    `undefined`, e o pacote expunha só 30 exports. Nenhum dos dois era o ambiente real: o
    `exports["."]` do pacote ramifica em `browser`, `node`, `edge` e `import`, e o caminho `edge` —
    escolhido pelo `tsx` por ser runtime genérico — de fato não exporta `captureException`, mas os
    entry points `index.client.js` e `index.server.js`, que o Next usa, exportam. Ler o mapa
    `exports` do `package.json` e carregar o arquivo concreto de cada condição antes de concluir
    que uma API "não existe". Corolário: `pnpm build` verde **não** teria pego uma chamada
    inexistente em código de client — bundler resolve pela condição `browser`, e o erro só
    apareceria no navegador (§9.23, §9.30).
39. **Teste que passa pode estar passando pelo motivo errado — a mutação é que diz qual.** O teste
    de rollback das migrations (2026-07-25) verificava que nada era confirmado quando o SQL falhava,
    e passava; mas a falha era programada no **primeiro** comando da transação, então não havia
    nada encenado para vazar — desativar o ROLLBACK inteiro não quebrava o teste. Só um caso que
    falha em um comando **posterior** (o `INSERT`, com o DDL já executado) exercita de fato a
    garantia. Ao testar atomicidade/rollback/cleanup, colocar a falha **no meio** da sequência,
    nunca no primeiro passo, e confirmar por mutação que o teste detecta a garantia removida.
40. **Botão sem handler é pior que botão ausente — e a UI não pode prometer o que a regra proíbe.**
    `CotacoesTableReal` teve por meses os botões "Lembrar" e "Ver" sem `onClick`: o usuário clicava
    e nada acontecia. Pior, "Lembrar" sugeria um envio de e-mail que a §9.3 proíbe o sistema de
    fazer. O mesmo padrão apareceu em três lugares: o onboarding marcava as duas primeiras etapas
    como concluídas com check verde derivado de `idx < 2` (progresso fictício), a aba "Memória de
    cálculo" só expunha `processosComSerie[0]` (os demais inacessíveis, sem nada indicar isso) e a
    descrição da página de Cotações dizia "disparo de e-mails". Ao construir tela, perguntar de
    cada elemento interativo: **o que acontece quando clico?** Se a resposta é "nada" ou "algo que
    a regra de negócio proíbe", o elemento vira indicador informativo ou sai — nunca fica como
    placeholder à espera de implementação.
41. **`setState` dentro de `useEffect` para espelhar um valor derivado é sinal de estado
    redundante — derive na renderização.** Ao sincronizar a aba ativa do stepper com `?etapa=`, a
    primeira versão usou `useEffect` + `setState`, e o ESLint (`react-hooks`) barrou com "Calling
    setState synchronously within an effect can trigger cascading renders". A correção não é
    silenciar a regra: é reconhecer que a URL já é a fonte de verdade e calcular
    `ativa = escolhaLocal ?? valorDaUrl ?? padrão` no corpo do componente. Cuidado com a
    armadilha seguinte: guardar só a escolha local faz um clique manual congelar a aba e ignorar
    deep-links posteriores — é preciso guardar **também o valor da URL no momento do clique** e
    devolver a precedência à URL quando ela mudar. Ambas as pontas exigem teste; a precedência do
    deep-link foi confirmada por mutação.
42. **Dependência de teste também é dependência: `@testing-library/user-event` não está instalado.**
    Escrever `import userEvent from "@testing-library/user-event"` quebra a suíte inteira com erro
    de resolução do Vite, não com uma falha de asserção legível. O projeto usa `fireEvent` +
    `waitFor` do `@testing-library/react`. Instalar exigiria autorização do usuário (§8) — antes de
    importar qualquer pacote num teste, conferir se ele já está em `package.json`, valendo a mesma
    regra do código de produção.
43. **A conexão direta do Supabase (`db.<ref>.supabase.co`) é IPv6-only e é inalcançável de dentro
    de uma função serverless da Vercel.** O `GET /api/admin/migrate` autenticou, executou e falhou
    com `getaddrinfo ENOTFOUND db.<ref>.supabase.co`. O hostname **resolve** — mas só para AAAA
    (`2600:1f1e:…`), sem nenhum registro A; funções da Vercel não têm IPv6, então para elas o host
    simplesmente não existe. `ENOTFOUND` aqui significa "sem endereço utilizável", não "host
    inexistente" — diagnosticar com `nslookup` e olhar **qual família** de endereço volta, em vez
    de ler a mensagem como erro de digitação no hostname.
    Consequência para a §9.32: "migrations usam a conexão direta" vale para o **CLI rodando da
    máquina do dev** (que tem IPv6), e **não** para código dentro de função serverless. Da Vercel,
    DDL precisa ir pelo **Session pooler** (`aws-0-<região>.pooler.supabase.com:5432`, IPv4, sessão
    estável — suporta DDL), nunca pelo Transaction pooler da 6543, que não serve para migration.
    Regra geral: antes de escolher um host para código que roda em serverless, perguntar **de onde
    a conexão parte**, não só o que o banco aceita. Ver também §9.31 — `DATABASE_URL` e `DIRECT_URL`
    são caminhos independentes, e um funcionar não diz nada sobre o outro: aqui a app servia
    páginas com dados reais pelo pooler enquanto a rota de migrations não alcançava banco nenhum.
44. **Ao inserir imports com script (`awk`/`sed`), imports multilinha quebram silenciosamente.**
    Inserir uma linha após "o último `import`" partiu ao meio um `import type { A, B } from …` em
    `fornecedores/page.tsx`, produzindo um arquivo sintaticamente inválido. O typecheck pegou, mas
    o modo de falha é traiçoeiro em arquivo grande. Para edição estrutural de código, usar a
    ferramenta de edição com contexto (que casa o bloco inteiro), não manipulação por número de
    linha — ou, no mínimo, rodar `typecheck` imediatamente após qualquer script que reescreva
    arquivos em lote.
45. **Guarda de autenticação nunca pode depender de a configuração existir — `if (segredo && ...)`
    é fail-open.** `/api/jobs/lembretes` checava
    `if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return 401`. Com `CRON_SECRET`
    ausente do ambiente, a condição curto-circuita para `false` e a rota fica **pública**. Não era
    teórico: em 2026-07-27 `GET https://divisao-compras-cms.vercel.app/api/jobs/lembretes` respondia
    **200 sem cabeçalho nenhum**, executando query no banco a cada requisição anônima e devolvendo
    razão social de fornecedor, número de processo e prazos sempre que houvesse cotação vencendo.
    A variável nunca havia sido criada na Vercel — e a ausência dela, que deveria fechar a porta,
    era justamente o que a abria. O padrão correto já existia dois diretórios ao lado, em
    `/api/admin/migrate`: `if (!secret) return false`. Ao escrever qualquer guarda, perguntar
    **"o que acontece se esta variável não existir?"** — a resposta tem de ser "nega", nunca
    "libera". Corolário: variável de ambiente lida pelo código mas ausente do painel de deploy é um
    achado por si só; conferir a lista real (`vercel env ls`) contra o que o código lê, porque
    `.env.example` documenta a intenção, não o que está de fato configurado em produção.
46. **Adicionar coluna ao schema torna `include`/consulta-sem-`select` uma bomba-relógio até a
    migration rodar.** Ao subir o M13 (2026-07-27), `promoverFonte.ts` usava
    `findUnique({ where, include: { item: ... } })`. Sem `select`, o Prisma pede **todas** as colunas
    escalares do model — e o M13 acrescentara `origem`, `conversaId` e `termoBuscaUsado` ao
    `ResultadoSimilaridade`. Como código e migration sobem em tempos diferentes (§9.19), o deploy
    levou o client novo para um banco que ainda não tinha as colunas: promover candidato a fonte
    passou a falhar em runtime com `column does not exist`, num caminho que nenhum teste pegava
    porque todos mockam o Prisma. A regra: **ao acrescentar coluna a um model já usado, varrer os
    `findUnique`/`findFirst`/`findMany` daquele model e garantir `select` explícito** — assim a
    action funciona antes e depois da migration, que é o padrão expand/contract. O teste que protege
    isso não olha o resultado, olha o **argumento** passado ao Prisma: `include` ausente, `select`
    presente e sem as colunas novas. Corolário mais amplo: suíte 100% verde com Prisma mockado não
    diz nada sobre compatibilidade de schema — essa classe de defeito só aparece exercitando o banco
    real, e o banco de produção é o único que fica atrás do código.
    **Corrigir a ocorrência que estourou não é corrigir a classe.** Depois de consertar
    `promoverFonte`, o mesmo defeito seguiu vivo em produção por horas em
    `preencherCotacao.ts` — `include: { resultadosSimilaridade: … }` sem `select`, num caminho sem
    teste nenhum. Ao acrescentar coluna a um model, a varredura é `grep` por **todas** as consultas
    daquele model e das relações que apontam para ele, não só a que apareceu no erro. Atenção à
    relação aninhada: `select` no nível de cima não protege o de baixo — sem `select` próprio
    dentro de `resultadosSimilaridade`, o Prisma volta a pedir todos os escalares do model
    relacionado.
47. **Teste de rota que devolve `ReadableStream` precisa drenar o stream antes de asserir — senão
    testa uma corrida.** O corpo do `start()` de um `ReadableStream` roda **depois** que o handler
    já retornou a `Response`. Ao testar a rota SSE do assistente (2026-07-27), dois casos que
    verificavam gravação de mensagem e auditoria passavam sem consumir o stream: passavam por sorte
    de ordenação de microtask, e o teste vizinho — idêntico na estrutura — falhava com "Number of
    calls: 0". Nenhum dos dois provava coisa alguma. A correção é um helper que faz
    `await res.clone().text()` antes das asserções. Regra geral: quando o efeito que se quer
    observar acontece **fora** da função que se chamou (stream, `queueMicrotask`, `after()`,
    promessa não aguardada), o teste precisa de um ponto de sincronização explícito; "passou" sem
    ele é indistinguível de "correu antes". Sintoma diagnóstico: dois testes com a mesma forma e
    resultados diferentes.
48. **Exit code do PowerShell não é exit code do comando quando se usa `2>&1`.** `next build`
    rodado via interop com `2>&1 | Out-String` sai com código 1 mesmo compilando: o aviso de
    deprecação do `middleware` vai para stderr, o PowerShell o converte em `NativeCommandError` e
    contamina o status. Ler o exit code aqui e reportar "build falhou" seria falso — a evidência
    real está no log (`✓ Compiled successfully` seguido da tabela de rotas). Vale a recíproca: em
    ambiente com interop, confirmar sucesso/falha pelo **conteúdo** do log, e reservar o exit code
    para comandos rodados sem redirecionamento de stderr.
49. **Não definir `CI=1` para rodar o Playwright local — isso desliga o `reuseExistingServer` e
    trava a suíte em silêncio.** O `playwright.config.ts` usa
    `webServer.reuseExistingServer: true`, mas o Playwright ignora essa opção quando `process.env.CI`
    está definido: ele tenta subir um dev server novo, encontra a porta 3000 ocupada pelo anterior e
    fica esperando o timeout sem imprimir nada. Custou dois ciclos de ~10 minutos nesta sessão, com
    o arquivo de saída vazio e nenhuma mensagem de erro — o modo de falha da §9.22, agora em
    ferramenta local. Ao ver a suíte passar de ~30s para minutos sem output, checar **quem está na
    porta** (`Get-NetTCPConnection -LocalPort 3000 -State Listen`) antes de investigar os testes.
    Corolário de captura: redirecionar a saída do PowerShell com `>` grava em **UTF-16LE**; ler com
    `cat` produz texto com bytes nulos entre os caracteres. Usar `iconv -f UTF-16LE`, ou preferir
    `--reporter=list` para arquivo e decodificar na leitura.
50. **Segredo em comando que pode ecoar a entrada: mascarar a saída SEMPRE, não só quando falha —
    e `Out-File -Encoding utf8` no PowerShell 5.1 grava BOM.** Ao criar o papel `migrator` no
    Supabase (2026-07-27), o SQL foi gravado com `Out-File -Encoding utf8`, que no Windows
    PowerShell 5.1 (não no 7+) escreve **BOM**; o Postgres rejeitou com
    `syntax error at or near "﻿create"`, e a mensagem de erro da CLI devolveu a **linha
    inteira** — com a senha em texto claro no log. Os dois erros compõem: o BOM causou a falha, e a
    falha foi o caminho pelo qual o segredo vazou. Regras: gravar SQL com
    `[System.IO.File]::WriteAllText($p, $texto, (New-Object System.Text.UTF8Encoding($false)))`;
    e, ao rodar qualquer comando que receba segredo em arquivo ou argumento, capturar a saída e
    aplicar `-replace [regex]::Escape($segredo), '<MASCARADO>'` **antes** de imprimir, em vez de
    contar com o caminho feliz. Mitigação que salvou o caso: o papel não chegou a ser criado, então
    a senha vazada nunca existiu no banco — mas isso foi sorte, não desenho.
51. **`$LASTEXITCODE` da CLI do Supabase não é sinal de sucesso — verificar no banco.** A CLI
    devolve exit 1 só por escrever "A new version is available" em stderr, mesmo quando o comando
    funcionou. Combinado com `$ErrorActionPreference = 'Stop'`, qualquer aviso em stderr vira erro
    terminante e aborta o script antes da parte útil. Para confirmar que um `CREATE ROLE`/DDL pegou,
    consultar `pg_roles`/`information_schema` — é a §9.37 de novo: exercitar a capacidade, não ler
    um indicador indireto.
52. **Crase dentro de template literal fecha a string — não usar Markdown com crase em prompt de
    sistema.** O prompt do assistente é um template literal (`` `...` ``), e marcar nomes de
    ferramenta como `` `buscar_pncp` `` no texto novo encerrou a string no meio: 5 erros `TS1005`
    e um `Parsing error` do ESLint, todos apontando para uma linha que parecia texto comum. O
    modo de falha engana porque o arquivo *já* usava crases em outros trechos — elas estavam
    balanceadas por acaso. Em texto dentro de template literal, marcar nome de identificador com
    aspas ou negrito; e ao editar um arquivo de prompt, rodar `typecheck` antes de qualquer outra
    verificação, porque o erro não se parece com erro de código.
53. **Teste escrito antes da implementação pode passar pelo motivo errado desde o início.** Os
    testes que provam que `rascunhar_justificativa` não persiste nada passaram na primeira rodada
    de TDD — quando a ferramenta **ainda não existia**: `expect(db.x.update).not.toHaveBeenCalled()`
    é trivialmente verdadeiro quando nada roda. Um teste de ausência ("não grava", "não chama",
    "não vaza") é sempre verde contra código inexistente, então a fase vermelha do TDD não o
    valida como valida um teste de presença. A prova é a mutação **inversa**: acrescentar a
    escrita que o teste deveria barrar e confirmar que ele cai. Vale para toda asserção negativa —
    ela só vira garantia depois que alguém demonstrou o que a derruba (§9.35, §9.39).
54. **Cliente de banco criado na avaliação do módulo quebra o build, não só o runtime.**
    `export const db = createPrismaClient()` conectava ao **importar** `lib/db.ts`. Bastava o Next
    importar uma rota para coletar metadados durante o build e o `throw` de `DATABASE_URL` ausente
    derrubava tudo com `Failed to collect page data for /api/jobs/lembretes` — antes de qualquer
    handler rodar. **`export const dynamic = "force-dynamic"` não resolve**: ele impede a execução
    do handler, não a importação do módulo (comprovado — a declaração foi acrescentada primeiro e
    o build continuou quebrando). A correção é conexão preguiçosa: o client nasce no primeiro
    acesso a um model, então em build time ninguém acessa. Ao inicializar recurso externo em escopo
    de módulo, perguntar **"o que acontece se isto for importado sem a variável de ambiente?"** —
    em Next, importar não é usar, e o build importa tudo.
55. **Ambiente que ninguém exercita esconde defeito por tempo indefinido — Preview é um deles.**
    O defeito da §9.54 existia desde sempre e **nenhum deploy de preview deste projeto jamais
    buildou**. Só apareceu quando o primeiro PR foi aberto, porque o M13 vinha sendo feito direto
    em `main`, onde o build usa as variáveis de Production. Duas consequências: (a) `vercel env ls`
    mostra o *target* de cada variável, e variável que existe só em Production significa que
    Preview nunca funcionou — conferir isso ao abrir o primeiro PR de um projeto; (b) trabalhar
    sempre em `main` não é só questão de processo, **suprime um ambiente inteiro de verificação**.
    Reproduzir localmente é possível e barato: `env DATABASE_URL= next build` mostrou a falha exata
    do preview em 15 segundos, sem gastar ciclo de deploy (§9.23, §9.29).
56. **Teste de ausência que enumera nomes proibidos à mão sempre deixa uma porta aberta.** Os
    testes de "não persiste nada" listavam `update`, `updateMany` e `createMany` e esqueceram
    `create` — então a ferramenta podia criar `Fonte`, `Evidencia` e `PrecoConsolidado` com a suíte
    100% verde, justamente as escritas que o comentário do arquivo declarava proibidas. A garantia
    documentada era a que estava sem teste. Corrigir acrescentando os nomes que faltam repete o
    erro na próxima adição ao schema: a asserção correta varre a **superfície inteira** (todo
    método de escrita × todo model) e reporta o nome exato do que escreveu. Regra geral: quando o
    teste afirma "nunca faz X", ele precisa observar todas as formas de fazer X, não uma lista de
    formas lembradas na hora de escrever.
57. **`sslmode=require` não desliga a verificação de certificado no `pg` — o valor correto é
    `sslmode=no-verify`.** O mesmo nome significa coisas diferentes no libpq e no node-postgres, e
    é por isso que copiar a string do `psql`/painel do Supabase falha. Em
    `pg-connection-string@2.13.0`, fora do modo `useLibpqCompat` (que é o padrão, e o que tanto
    `new Client({ connectionString })` quanto `PrismaPg({ connectionString })` usam), o `case
    'require'` **não** seta `rejectUnauthorized: false`; sobra o padrão do Node, `true`, que valida
    contra a trust store dele. O pooler do Supabase apresenta certificado de CA própria, que o Node
    não traz embutida — resultado: `self-signed certificate in certificate chain`. Só
    `case 'no-verify'` seta `rejectUnauthorized = false`. A conexão segue criptografada nos dois
    casos; o que muda é a validação da cadeia. Em 2026-07-30 este erro derrubou a aplicação inteira,
    porque a mesma string errada foi para `DATABASE_URL`, `DIRECT_URL` e `MIGRATE_URL` de uma vez.
    O comentário do `.env.example` dizia `sslmode=require` e foi a origem do erro — **documentação
    interna também precisa ser verificada contra a lib instalada** (§9.4), não copiada por inércia.
58. **Nome de usuário sem o project-ref na mensagem de erro do Supavisor não significa ref
    ausente.** A §9.43 desta lista havia registrado a heurística "`password authentication failed
    for user "postgres"` = falta o `.<project-ref>`". Ela está **errada** e custou uma rodada de
    diagnóstico na direção errada: o Supavisor usa o ref apenas para rotear o tenant e autentica o
    usuário real (`postgres`) no banco, então a mensagem nomeia o usuário sem o ref mesmo quando o
    ref está presente e correto. Ref ausente produz outro erro — **`Tenant or user not found`**.
    Logo: `password authentication failed` ⇒ ref ok, senha errada. Regra mais ampla: heurística
    registrada a partir de **uma** observação é hipótese, não regra; ao anotar uma, escrever qual
    experimento a confirmaria (§9.35).
59. **O Supabase nunca reexibe a senha do banco — campo vazio ao reabrir é o comportamento
    esperado, não falha de salvamento.** A senha é write-only: depois do reset, o painel mostra
    para sempre o literal `[YOUR-PASSWORD]` nas connection strings, e o campo aparece em branco.
    Em 2026-07-30 isso foi lido como "não está salvando" e levou a resets repetidos. Mesmo padrão
    das variáveis Sensitive da Vercel (§9.32). Consequências: (a) guardar a senha **no momento** em
    que é definida, porque é irrecuperável — foi a perda dela que forçou a criação do papel
    `migrator` em julho; (b) resetar a senha do banco troca a do papel `postgres` e **não** toca em
    papéis criados à parte, então não conserta uma `MIGRATE_URL` que use `migrator`; (c) o reset
    invalida **todas** as variáveis que carregam aquela senha — `DATABASE_URL` inclusive, o que
    derruba a aplicação. Ao propor um reset de senha, enumerar antes tudo que vai quebrar junto.
60. **Credencial de banco se valida localmente com o mesmo cliente da produção, antes de gastar
    ciclo de deploy.** O WSL tem IPv4 e alcança o Session/Transaction pooler
    (`aws-0-<região>.pooler.supabase.com`), então um script CJS de ~40 linhas com o `pg` do próprio
    `node_modules` responde em segundos o que a rota serverless levava um redeploy para dizer — e
    responde **mais**: além de autenticar, lê `_prisma_migrations` e `information_schema` direto.
    Nesta sessão quatro ciclos de deploy foram gastos numa cadeia de erros
    (`ENOTFOUND` → `password authentication failed` → `self-signed certificate`) que um único teste
    local teria resolvido. Detalhes que custam tempo: `NODE_PATH` **só vale para `require()` do
    CJS**, não para `import` ESM — script fora do projeto precisa ser `.cjs`; e a máscara da senha
    na saída é obrigatória desde a primeira execução, não só no caminho de erro (§9.50). Corolário
    da §9.23: verificação local não substitui a real quando o defeito é de empacotamento, **mas
    substitui muito bem quando o defeito é de credencial ou de string de conexão**.
61. **No PNCP, preço de referência é o HOMOLOGADO, e `/itens` pagina de 10 em 10 por padrão.** Duas
    armadilhas independentes do mesmo endpoint, ambas medidas contra a API real em 2026-07-30.
    (a) `/itens` devolve apenas `valorUnitarioEstimado` — o orçamento feito **antes** do certame.
    O preço efetivamente contratado está em
    `/itens/{numeroItem}/resultados` → `valorUnitarioHomologado`, com `quantidadeHomologada` e
    `dataResultado` junto. Na compra `83021857000115/2024/207` a média estimada era R$ 150,97
    contra R$ 74,00 homologada: **51% de inflação** na série de preços. Usar estimado como
    referência de preço praticado é erro de conformidade, não só de precisão. Descartar resultado
    com `dataCancelamento`, e em item de SRP com vários fornecedores classificados vale o primeiro
    por `ordemClassificacaoSrp`.
    (b) O tamanho de página padrão de `/itens` é **10**, e isso não está documentado — a resposta
    vem como array simples, sem envelope nem contador, então o truncamento é **silencioso**. Uma
    compra de 418 itens devolvia 10. Sempre paginar com `tamanhoPagina=500` (o teto) até a página
    vir incompleta. Regra geral para API que devolve lista nua: **nunca assumir que o array é a
    coleção inteira** — confirmar contra um caso grande conhecido antes de confiar, porque sem
    envelope não há como distinguir "acabou" de "cortou". A descrição do item vem com HTML e
    entidades numéricas embutidos e precisa de limpeza antes de tokenizar ou exibir.
62. **`import "server-only"` quebra qualquer módulo chamado por um script `tsx`/Node puro — não é
    proteção gratuita.** O pacote resolve, via `exports` condicional do `package.json`, para
    `index.js` (que lança exceção ao ser importado) a não ser que o resolvedor declare a condição
    `react-server` — é assim que o bundler do Next marca "isto está dentro do bundle de servidor".
    `tsx` e `node` puro nunca declaram essa condição (confirmado isolando o import num arquivo à
    parte e comparando a mensagem de erro com/sem `--conditions=react-server`), então qualquer
    módulo de `lib/` que precise ser chamado tanto por Server Action/rota quanto por um script
    administrativo (`scripts/`, mesmo padrão de `set-admin-password.mjs`) não pode ter
    `import "server-only"` no topo. Antes de copiar esse import "por hábito" de um arquivo vizinho
    (`runner.ts`, `comprasGov.ts`, ...), perguntar se o módulo precisa ser importável fora do
    bundler do Next; se precisar, documentar a ausência do marcador como decisão deliberada (não
    esquecimento) e confirmar que o módulo não é alcançável a partir de `components/` — que é o
    risco real que o marcador existe para prevenir.
63. **Spike que confirma o envelope da resposta não confirma o payload da requisição nem todo
    campo do item — cada um se verifica separadamente, e "não capturado pelo spike" precisa ser
    resolvido antes do merge, não carregado como dívida.** O cliente do `modulo-contratacoes`
    (M16) foi mergeado com `dataInicial`/`dataFinal` como nomes de parâmetro de data — nunca
    confirmados contra a API, o próprio comentário do arquivo dizia isso — e com `descricaoItem`/
    `orgaoEntidadeRazaoSocial`/`dataCancelamentoPncp`, nenhum dos quais existe na resposta real.
    Passou por `dev`, `code-reviewer` e `verifier` porque nenhum dos três fez uma chamada HTTP real
    a esse endpoint específico: os testes usavam um fixture que replicava os mesmos nomes
    inventados do código, então bateram certo por construção, não por verificação (mesmo modo de
    falha do §9.39 — "teste que passa pelo motivo errado" — só que no nível do fixture, não da
    asserção). A correção só apareceu ao retomar o trabalho seguinte (wiring no registry) e tentar
    montar uma chamada real: `curl` devolveu `400`/nomes ausentes, e o OpenAPI do backend
    (`/v3/api-docs`) confirmou os nomes corretos. Regra: quando o código sinalizar uma premissa
    como "não verificada contra a API ao vivo", isso é bloqueante para considerar o componente
    pronto — resolver antes do merge (uma chamada real basta) ou, se adiado por decisão explícita,
    o merge não pode carregar checkbox `[x]` para as partes que dependem dela.
64. **Stream fechado sem evento de término é sucesso silencioso para o leitor — todo consumidor de
    SSE precisa de um final explícito.** O assistente ficava com o passo "Buscando contratações no
    PNCP" girando para sempre. A causa não estava no PNCP nem no laço: `lerStreamSSE` faz
    `if (done) break` e **resolve normalmente**, porque fim de stream é indistinguível de fim de
    conteúdo. Quando a Vercel matava a função por `maxDuration = 60`, o corpo fechava sem `fim` nem
    `erro`, o `catch` do cliente não rodava, e nada apagava o `emAndamento` — que só era limpo pelos
    handlers desses dois eventos. Pior que o spinner: os candidatos já exibidos ficavam
    inaprováveis, porque o `mensagemId` que autoriza a aprovação só chega no `fim`, e a mensagem do
    assistente só é gravada depois do turno inteiro. Regra: ao consumir stream, o cliente rastreia
    se viu um final legítimo e trata a ausência como falha explícita; nunca deduzir sucesso de "a
    leitura terminou sem exceção". Vale para SSE, WebSocket e resposta em chunks.
    **Corolário sobre o orçamento de tempo:** rota com `maxDuration` que chama API externa em
    fan-out precisa de teto de tempo próprio, e o teto tem de existir em três níveis, porque cada um
    cobre um modo de falha diferente — por requisição (`AbortSignal.timeout`; sem ele o `fetch` do
    Node herda os **300s** do undici, não algum padrão razoável), por integração (custo agregado:
    uma `buscar_pncp` gastou 11s e **82 requisições HTTP** medidas contra a API real, e isso com 7
    dos 20 editais possíveis) e por turno (`ORCAMENTO_TEMPO_TURNO_MS`, conferido antes de cada
    ferramenta). Nenhum deles substitui os outros: timeout por requisição não vê o agregado, e teto
    por turno não interrompe ferramenta já em curso. Cuidado com o padrão do SDK: o cliente da
    OpenAI vem com **10 minutos** de timeout e 2 retries — inofensivo num script, fatal numa função
    serverless de 60s.
    **E cuidado com o custo escondido no termo de busca:** o filtro de relevância do PNCP mantém o
    item que compartilhe **qualquer** token com o termo, então frase longa em linguagem natural
    aumenta o custo e piora o resultado ao mesmo tempo. Em "lavagem fachada predio novo pastilhas
    pele de vidro", o token `novo` sozinho respondeu por 125 dos matches, trazendo argamassa e
    abraçadeira de nylon como candidatos a referência de preço.
    **Ressalva medida em 2026-08-11 (ver §9.67): o tamanho do termo NÃO prevê o custo.** Em 16
    buscas reais, 6 tokens custaram 8,2s e 3 tokens custaram 15,6s; a busca de 26s tinha 4 tokens.
    O custo vem de quantos editais a busca textual devolve e de quantos itens cada um tem — a
    correção que funciona é teto no número de requisições, não no tamanho do termo.
65. **Teto de tempo verificado só entre lotes é conselho, não prazo — e API pública devolve
    data-sentinela em vez de nulo.** Dois defeitos achados auditando o uso real do assistente em
    2026-08-11, ambos em `pncp.ts`.
    (a) O teto de 20s era testado **entre** lotes de editais; um lote iniciado aos 19,9s rodava até
    o fim e a busca levava **27,7s**, consumindo sozinha o orçamento de 35s do turno e derrubando a
    função no `maxDuration` — sem gravar mensagem nem `AuditLog` (2 turnos por dia morriam assim).
    Prazo real precisa das três pontas: `AbortSignal` composto com o timeout por requisição, para
    abortar o que está em voo; checagem antes de **cada** requisição, não só entre lotes; e reserva
    mínima para começar um lote, senão paga-se um lote inteiro que será descartado. A garantia que
    motivou o desenho original (nunca devolver subconjunto arbitrário dos itens de uma compra)
    continua valendo por outro caminho: compra interrompida é descartada **inteira**.
    (b) O PNCP devolve `0001-01-01`, `1858-11-17` (epoch do MJD) e `1900-01-01` (epoch do Excel)
    como data de resultado — 5 em 264 candidatos. Sem janela de plausibilidade, `new Date(...)`
    aceita todas: o preço entraria na memória de cálculo com data falsa, e o filtro de recência de
    365 dias o descartaria **em silêncio**. Toda data vinda de fonte externa passa por janela fixa
    (não comparar com `Date.now()`, que acopla a regra ao relógio e quebra sob clock mockado).
66. **Ao auditar o banco por script, o valor lido pode estar deslocado ou significar outra coisa —
    conferir o fuso e o caminho de escrita antes de interpretar.** Duas leituras erradas na mesma
    sessão, ambas corrigidas antes de virarem conclusão.
    (a) O Prisma mapeia `DateTime` para `timestamp(3)` **sem fuso**, e o `node-pg` interpreta esse
    tipo no fuso do **cliente**. Rodando do WSL em `America/Sao_Paulo`, todo `createdAt` saiu 3h
    adiantado no `toISOString()`, enquanto `now()` (que é `timestamptz`) veio correto — a
    contradição "registro no futuro" foi o que denunciou. Formatar no banco (`to_char`) ou fixar
    `TZ=UTC` no script; e desconfiar quando timestamps de tabelas diferentes não se ordenam.
    (b) `scoreFinal = 0` em 119 de 161 candidatos foi lido como falha do ranqueamento; é o
    **registro de descarte** que `descartarCandidato` grava (linha-lápide com score zero e
    justificativa fixa). Antes de tratar um agregado como sintoma, achar quem escreve aquela
    coluna. Corolário: agregado que mistura lápide com dado real mente sobre média e dispersão.
67. **Correção proposta a partir de correlação plausível, sem medir, ataca o alvo errado — medir
    custa uma consulta.** Nesta sessão recomendei "limitar o termo a 3–4 tokens" como uma das três
    correções, por parecer óbvio que termo longo encarece a busca (a §9.64 registrava o mecanismo).
    Bastou cruzar duração × contagem de tokens das 16 buscas gravadas para derrubar a hipótese: não
    há correlação, e a busca de 26s tinha 4 tokens — o limite não teria evitado nada. O mecanismo
    da §9.64 era real e mesmo assim não era o gargalo; **mecanismo plausível não é causa
    dominante**. Quando os dados para testar a hipótese já estão no banco (duração por ferramenta
    vive em `MensagemAssistente.ferramentasUsadas`), medir antes de propor é mais barato que
    implementar e descobrir depois. Vale também para o que já foi prometido ao usuário: dizer que a
    hipótese caiu e trocar a correção é melhor que entregar o que foi combinado sabendo que é
    inócuo (§9.24, §9.35).

68. **O campo `url`/`uri` do PNCP vem com a porta interna (`:43660`) e não conecta — reconstruir
    sempre.** Medido em 2026-08-11 no endpoint de anexos
    (`/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos`): o JSON devolve
    `https://pncp.gov.br:43660/...`, cujo TCP dá timeout, enquanto **o mesmo caminho na 443
    responde `200` com o PDF em 0,77s**. É proxy reverso vazando porta interna por não setar
    `X-Forwarded-Port`. Gravado como veio, todo link de evidência de edital nasce morto — a §9.8
    ("validar abrindo a URL real gerada") aplicada a um campo que *parecia* confiável por vir
    pronto da API. Regra geral: URL montada pelo servidor de origem é dado a validar, não verdade
    a propagar; derivar a URL a partir dos identificadores (CNPJ/ano/sequencial) em vez de aceitar
    a que veio.
69. **Afirmar propriedade de um dado sem medir custa a proposta inteira construída em cima dela.**
    Nesta sessão isso aconteceu três vezes, com o mesmo formato. (a) Analisei 2 dos 17 actors de
    PNCP da Apify e generalizei "nenhum devolve homologado por item" para o conjunto — havia um
    que devolvia, e a correção só apareceu porque o usuário mandou olhar a lista inteira.
    (b) Justifiquei extrair o PDF do edital dizendo que a `descricao` da API era "curta e suja" e
    que a especificação real só estaria no anexo; a medição mostrou o contrário — itens com código
    CATMAT trazem 265 a 472 caracteres de especificação estruturada em pares `chave: valor`, e o
    PDF não acrescentava nada. A proposta foi retirada. (c) Escrevi um desempate explícito no
    `sort` com um comentário afirmando que a determinística dependia dele; a mutação mostrou que
    nenhum teste o distinguia, porque `Array.prototype.sort` é estável por especificação desde a
    ES2019. Nos três casos a verificação custava minutos e a afirmação errada custava uma
    implementação inteira. **Antes de justificar desenho com uma propriedade do dado ("o campo é
    pobre", "a API não expõe", "a lista toda é assim"), medir a propriedade** — amostrar o campo,
    chamar o endpoint, rodar a mutação. Corolário da §9.35 e da §9.68: vale igualmente para a
    amostra de uma vitrine de terceiros, onde ler duas fichas e concluir sobre dezessete é o mesmo
    erro em escala maior.
70. **`Number("15.000")` é 15 — parser de dinheiro em pt-BR precisa distinguir milhar de decimal, e
    a distinção é por formato, não por intuição.** Ao criar o campo de ajuste de valor do candidato
    (M20, 2026-08-12), o caminho óbvio era reusar `parseNumberBR` de `lib/sheets/parsePlanilha.ts`.
    O docstring dele promete converter `"1.000"`, mas o código só trata ponto-como-milhar quando há
    **também** vírgula: com ponto sozinho ele cai em `Number(s)`, e "15.000" vira 15 — quinze mil
    reais entrando na série de preços como quinze, sem nenhum sinal na tela. A regra que funciona é
    testar o formato: `/^-?\d{1,3}(\.\d{3})+$/` é milhar; qualquer outro ponto é decimal (para
    aceitar "1.5" e "997.36"). Duas consequências: (a) todo parser novo de valor monetário precisa
    de caso de teste para `"15.000"` **e** `"1.5"`, porque acertar um e errar o outro é o modo de
    falha natural; (b) **docstring não é especificação** — o comentário do `parseNumberBR` descreve
    um comportamento que a função não tem, e confiar nele teria propagado o defeito. Este
    descompasso segue aberto em `parsePlanilha.ts` (a planilha da Câmara pode trazer "1.000" como
    texto), e foi deixado intocado de propósito: mexer ali muda ingestão em produção e é tarefa
    própria, não efeito colateral.
71. **`break-words`/`whitespace-normal` num filho não desfaz `whitespace-nowrap` herdado de um
    ancestral — são propriedades CSS diferentes, e a primeira correção tratou a errada.** O
    `TableCell` (`ui/table.tsx`) aplica `whitespace-nowrap` por padrão em todo `<td>`; a célula
    expandida do roteiro de cálculo (`colSpan={8}`) passava só `className="p-2"`, sem sobrescrever
    isso, então o `<p>` da memória de cálculo — mesmo com `break-words` — herdava `nowrap` do `<td>`
    e ficava preso numa linha só, cortada por overflow. A primeira tentativa de correção (envolver o
    conteúdo em `grid grid-cols-1` para impedir que o texto sem largura definida inflasse a tabela
    inteira) resolvia um sintoma real — mas diferente do que o usuário via — e o problema persistiu
    idêntico depois do deploy. Diagnóstico correto: ler o componente de UI de terceiros usado
    (`TableCell`) antes de mexer no chamador, porque a classe padrão de um componente compartilhado é
    tão candidata a causa quanto o código que acabou de mudar. Verificado com repro isolado via
    Playwright (`boundingBox().height`: 18px numa linha só vs. 54px em 3 linhas após
    `whitespace-normal`) antes de reportar como corrigido — não só por leitura do CSS.
72. **`createMany({ skipDuplicates: true })` nunca atualiza linha existente — ela é ignorada, não
    sobrescrita.** Correto para carga inicial de tabela vazia; qualquer resync/reingestão periódica
    construído em cima disso adiciona só itens novos e nunca reflete mudança em item já gravado — o
    mesmo defeito da §9.40 (botão sem handler: a feature promete "atualizar" e o código só insere).
    Descoberto ao planejar o cron de `ItemCatalogoReferencia` (M23, 2026-08-18): a função de
    escrita do M16 usava `skipDuplicates` e um resync automático em cima dela teria sido
    inofensivo-parecendo e sistematicamente incorreto desde o primeiro dia. Ao construir
    reingestão/sincronização periódica sobre uma função de escrita já existente, checar **como ela
    grava**, não só se ela já é chamada em algum lugar — `createMany`/`skipDuplicates`,
    `upsert` (Prisma, 1 round-trip por item — mede ~35s para 19 páginas/9 mil itens mesmo contra
    Postgres **local**, sem latência de rede) e `INSERT ... ON CONFLICT DO UPDATE` em lote (1
    round-trip por página, ~igual ao `createMany`) têm custo e semântica diferentes; a escolha entre
    eles se mede, não se presume (§9.69).
