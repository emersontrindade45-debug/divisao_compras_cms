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
