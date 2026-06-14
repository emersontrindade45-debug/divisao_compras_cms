# M5 — Banco de Dados & Camada de Dados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar PostgreSQL via Docker, modelar o domínio completo em Prisma, criar migration inicial, singleton do cliente Prisma, seed com dados equivalentes às fixtures de UI, e schemas Zod compartilhados alinhados ao banco.

**Architecture:** Docker Compose sobe Postgres localmente; `prisma/schema.prisma` define todos os modelos do domínio (User, Processo, Item, Fonte, Evidencia, Fornecedor, Cotacao, Proposta, SeriePreco, PrecoConsolidado, AuditLog); seed script popula dados equivalentes aos fixtures de UI existentes em `src/lib/fixtures/`. Nenhuma tela muda neste milestone — o mock continua funcionando; o banco é preparado como camada separada para M6/M7.

**Tech Stack:** PostgreSQL 16 (Docker), Prisma ORM, Zod 3, pnpm, TypeScript strict, Vitest (testes do schema/seed).

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `docker-compose.yml` | Criar | Postgres 16 local |
| `.env` | Criar | DATABASE_URL local (gitignored) |
| `.env.example` | Atualizar | Documentar a DATABASE_URL |
| `prisma/schema.prisma` | Criar | Todos os modelos de domínio |
| `src/lib/db.ts` | Criar | Singleton Prisma client |
| `prisma/seed.ts` | Criar | Seed com dados equivalentes aos fixtures |
| `src/lib/validations/processo.ts` | Criar | Schemas Zod para Processo/Item |
| `src/lib/validations/fornecedor.ts` | Criar | Schemas Zod para Fornecedor |
| `src/lib/validations/cotacao.ts` | Criar | Schemas Zod para Cotacao/Proposta |
| `src/lib/validations/preco.ts` | Criar | Schemas Zod para SeriePreco/Preco |
| `src/lib/validations/index.ts` | Criar | Re-export de todos os schemas |
| `package.json` | Atualizar | Adicionar @prisma/client, prisma; script seed |
| `src/lib/validations/__tests__/schemas.test.ts` | Criar | Testes unitários dos schemas Zod |

---

## Task 1: Criar branch feat/db-prisma

**Files:**
- Git branch

- [ ] **Step 1: Criar a branch a partir de main**

```bash
git checkout main
git pull
git checkout -b feat/db-prisma
```

Expected: branch `feat/db-prisma` ativa.

- [ ] **Step 2: Verificar branch ativa**

```bash
git branch --show-current
```

Expected output: `feat/db-prisma`

---

## Task 2: Docker Compose — Postgres local

**Files:**
- Create: `docker-compose.yml`
- Create: `.env`

- [ ] **Step 1: Criar `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: divisao_compras_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: divisao_compras
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Criar `.env` com DATABASE_URL**

Crie o arquivo `.env` na raiz do projeto (ele já está no `.gitignore`):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/divisao_compras?schema=public"
AUTH_SECRET="dev-secret-change-in-production"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- [ ] **Step 3: Subir o container**

```bash
docker compose up -d
```

Expected: container `divisao_compras_db` running.

- [ ] **Step 4: Verificar que o Postgres está acessível**

```bash
docker compose ps
```

Expected: `divisao_compras_db` com status `running` na porta `5432`.

---

## Task 3: Instalar Prisma e gerar cliente

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar dependências Prisma**

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

- [ ] **Step 2: Inicializar Prisma**

```bash
pnpm exec prisma init --datasource-provider postgresql
```

Expected: cria `prisma/schema.prisma` e adiciona `DATABASE_URL` ao `.env` (já existe — pode sobrescrever com o mesmo valor).

- [ ] **Step 3: Verificar que `prisma/schema.prisma` foi criado**

```bash
cat prisma/schema.prisma
```

Expected: arquivo com `datasource db` e `generator client`.

---

## Task 4: Escrever o schema Prisma completo

**Files:**
- Modify: `prisma/schema.prisma`

O schema mapeia todos os modelos de domínio descritos no CLAUDE.md. Enums são definidos antes dos modelos que os usam.

- [ ] **Step 1: Substituir `prisma/schema.prisma` pelo schema completo**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ───────────────────────────────────────────────────────────────────

enum Role {
  pesquisa
  revisao
  aprovacao
}

enum StatusProcesso {
  aderente
  parcial
  nao_aderente
  pendente
}

enum ClassificacaoItem {
  comum
  especifico
}

enum TipoFonte {
  contratacao_publica
  site_eletronico
  fornecedor_direto
}

enum AderenciaFonte {
  aderente
  parcial
  nao_aderente
}

enum ListaSite {
  branca
  cinza
  vermelha
}

enum StatusCotacao {
  positiva
  negativa
  incompleta
  silenciosa
}

enum StatusChecklist {
  valido
  ressalva
  invalido
}

enum StatusGeral {
  valida
  com_ressalva
  invalida
}

enum MetodoConsolidacao {
  media
  mediana
  menor_valor
}

enum StatusPreco {
  incluido
  excluido
}

enum StatusFornecedor {
  ativo
  inativo
}

enum StatusResposta {
  respondido
  nao_respondido
  recusado
}

// ─── Models ──────────────────────────────────────────────────────────────────

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  name         String
  passwordHash String
  role         Role       @default(pesquisa)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  auditLogs    AuditLog[]

  @@map("users")
}

model Processo {
  id                     String             @id @default(cuid())
  numero                 String             @unique
  objeto                 String
  unidade                String
  quantidade             Int
  caracteristicasTecnicas String
  palavrasChave          String[]
  classificacao          ClassificacaoItem
  responsavel            String
  status                 StatusProcesso     @default(pendente)
  dataAbertura           DateTime
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  itens       Item[]
  contratacoes ContratacaoPublica[]
  capturas    CapturaEvidencia[]
  cotacoes    Cotacao[]
  auditLogs   AuditLog[]

  @@map("processos")
}

model Item {
  id                     String            @id @default(cuid())
  processoId             String
  descricao              String
  unidade                String
  quantidade             Int
  classificacao          ClassificacaoItem
  caracteristicasTecnicas String?
  palavrasChave          String[]
  createdAt              DateTime          @default(now())
  updatedAt              DateTime          @updatedAt

  processo    Processo     @relation(fields: [processoId], references: [id], onDelete: Cascade)
  fontes      Fonte[]
  seriePrecos SeriePreco[]

  @@map("itens")
}

model Fonte {
  id          String     @id @default(cuid())
  itemId      String
  tipo        TipoFonte
  descricao   String
  orgaoOuFornecedor String
  dataReferencia   DateTime
  valorUnitario    Decimal  @db.Decimal(12, 2)
  status      StatusPreco @default(incluido)
  motivoExclusao  String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  item        Item        @relation(fields: [itemId], references: [id], onDelete: Cascade)
  evidencias  Evidencia[]

  @@map("fontes")
}

model Evidencia {
  id            String   @id @default(cuid())
  fonteId       String
  arquivo       String?
  url           String?
  dataHoraAcesso DateTime
  descricao     String?
  createdAt     DateTime @default(now())

  fonte         Fonte    @relation(fields: [fonteId], references: [id], onDelete: Cascade)

  @@map("evidencias")
}

model ContratacaoPublica {
  id                   String         @id @default(cuid())
  processoId           String
  numero               String
  orgao                String
  objeto               String
  modalidade           String
  valorUnitario        Decimal        @db.Decimal(12, 2)
  quantidade           Int
  unidade              String
  dataContratacao      DateTime
  fonteUrl             String?
  aderencia            AderenciaFonte
  justificativaAderencia String?
  palavrasChave        String[]
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  processo             Processo       @relation(fields: [processoId], references: [id], onDelete: Cascade)

  @@map("contratacoes_publicas")
}

model Site {
  id           String    @id @default(cuid())
  url          String    @unique
  nome         String
  lista        ListaSite
  motivo       String?
  categoria    String
  isMarketplace Boolean  @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  capturas     CapturaEvidencia[]

  @@map("sites")
}

model CapturaEvidencia {
  id              String   @id @default(cuid())
  siteId          String
  processoId      String
  url             String
  produto         String
  valorUnitario   Decimal  @db.Decimal(12, 2)
  dataHoraAcesso  DateTime
  evidencia       String?
  createdAt       DateTime @default(now())

  site            Site     @relation(fields: [siteId], references: [id])
  processo        Processo @relation(fields: [processoId], references: [id], onDelete: Cascade)

  @@map("capturas_evidencias")
}

model Fornecedor {
  id                 String           @id @default(cuid())
  cnpj               String           @unique
  razaoSocial        String
  nomeFantasia       String?
  categoria          String[]
  cidade             String
  estado             String
  responsavelContato String
  email              String
  telefone           String?
  score              Int              @default(0)
  totalCotacoes      Int              @default(0)
  totalRespostas     Int              @default(0)
  taxaResposta       Decimal          @db.Decimal(5, 2) @default(0)
  ultimaResposta     DateTime?
  status             StatusFornecedor @default(ativo)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  cotacoes           Cotacao[]
  historicoCotacoes  HistoricoCotacao[]

  @@map("fornecedores")
}

model HistoricoCotacao {
  id              String         @id @default(cuid())
  fornecedorId    String
  processoNumero  String
  data            DateTime
  statusResposta  StatusResposta
  valorProposto   Decimal?       @db.Decimal(12, 2)
  createdAt       DateTime       @default(now())

  fornecedor      Fornecedor     @relation(fields: [fornecedorId], references: [id], onDelete: Cascade)

  @@map("historico_cotacoes")
}

model Cotacao {
  id                    String        @id @default(cuid())
  processoId            String
  fornecedorId          String
  dataEnvio             DateTime
  dataLimite            DateTime
  status                StatusCotacao @default(silenciosa)
  lembreteEnviado       Boolean       @default(false)
  valorProposto         Decimal?      @db.Decimal(12, 2)
  observacao            String?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  processo              Processo      @relation(fields: [processoId], references: [id], onDelete: Cascade)
  fornecedor            Fornecedor    @relation(fields: [fornecedorId], references: [id])
  proposta              Proposta?
  auditLogs             AuditLog[]

  @@map("cotacoes")
}

model Proposta {
  id                   String          @id @default(cuid())
  cotacaoId            String          @unique
  cnpjValido           StatusChecklist
  descricaoValida      StatusChecklist
  valorUnitarioValido  StatusChecklist
  valorTotalValido     StatusChecklist
  dataValida           StatusChecklist
  responsavelValido    StatusChecklist
  statusGeral          StatusGeral
  valorUnitario        Decimal?        @db.Decimal(12, 2)
  valorTotal           Decimal?        @db.Decimal(12, 2)
  dataProposta         DateTime?
  responsavel          String?
  observacoes          String?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  cotacao              Cotacao         @relation(fields: [cotacaoId], references: [id], onDelete: Cascade)

  @@map("propostas")
}

model SeriePreco {
  id                  String              @id @default(cuid())
  itemId              String
  metodo              MetodoConsolidacao
  valorEstimado       Decimal             @db.Decimal(12, 2)
  media               Decimal             @db.Decimal(12, 2)
  mediana             Decimal             @db.Decimal(12, 2)
  menorValor          Decimal             @db.Decimal(12, 2)
  coeficienteVariacao Decimal             @db.Decimal(6, 2)
  totalPrecos         Int
  precosIncluidos     Int
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  item                Item                @relation(fields: [itemId], references: [id], onDelete: Cascade)
  precos              PrecoConsolidado[]

  @@map("series_precos")
}

model PrecoConsolidado {
  id               String     @id @default(cuid())
  seriePrecoId     String
  fonte            TipoFonte
  descricaoFonte   String
  fornecedorOuOrgao String
  dataReferencia   DateTime
  valorUnitario    Decimal    @db.Decimal(12, 2)
  status           StatusPreco @default(incluido)
  motivoExclusao   String?
  createdAt        DateTime   @default(now())

  seriePreco       SeriePreco @relation(fields: [seriePrecoId], references: [id], onDelete: Cascade)

  @@map("precos_consolidados")
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  processoId String?
  cotacaoId  String?
  acao       String
  detalhes   Json?
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id])
  processo   Processo? @relation(fields: [processoId], references: [id])
  cotacao    Cotacao?  @relation(fields: [cotacaoId], references: [id])

  @@map("audit_logs")
}
```

- [ ] **Step 2: Verificar que o schema não tem erros de sintaxe**

```bash
pnpm exec prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid!`

---

## Task 5: Executar migration inicial

**Files:**
- Create: `prisma/migrations/` (gerenciado pelo Prisma)

- [ ] **Step 1: Rodar a migration**

```bash
pnpm exec prisma migrate dev --name init
```

Expected: migration aplicada com sucesso, pasta `prisma/migrations/` criada com a migration inicial.

- [ ] **Step 2: Verificar tabelas no banco via Prisma Studio (opcional, mas confirma visualmente)**

```bash
pnpm exec prisma studio
```

Acesse `http://localhost:5555` e confirme que todas as tabelas aparecem. Feche com Ctrl+C após verificar.

---

## Task 6: Criar singleton do Prisma client

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Criar `src/lib/db.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
pnpm typecheck
```

Expected: sem erros de tipo.

---

## Task 7: Atualizar package.json com script de seed

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Adicionar configuração do seed e script no `package.json`**

Adicione após a chave `"scripts"`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

E adicione o script no bloco `"scripts"`:

```json
"db:seed": "pnpm exec prisma db seed",
"db:studio": "pnpm exec prisma studio",
"db:migrate": "pnpm exec prisma migrate dev",
"db:reset": "pnpm exec prisma migrate reset"
```

- [ ] **Step 2: Instalar tsx para executar o seed em TypeScript**

```bash
pnpm add -D tsx
```

---

## Task 8: Criar script de seed

**Files:**
- Create: `prisma/seed.ts`

O seed deve ser idempotente — usa `upsert` para não duplicar dados em execuções repetidas. Os dados espelham os fixtures de UI em `src/lib/fixtures/`.

- [ ] **Step 1: Criar `prisma/seed.ts`**

```typescript
import { PrismaClient, StatusProcesso, ClassificacaoItem, AderenciaFonte, ListaSite, StatusCotacao, StatusChecklist, StatusGeral, MetodoConsolidacao, StatusPreco, StatusFornecedor, StatusResposta, TipoFonte, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ── Usuário padrão ──────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: "admin@cms.santos.sp.gov.br" },
    update: {},
    create: {
      email: "admin@cms.santos.sp.gov.br",
      name: "Administrador",
      passwordHash: "$2b$10$placeholder_hash_change_in_m6",
      role: Role.aprovacao,
    },
  });
  console.log("✓ Usuário criado:", user.email);

  // ── Sites ───────────────────────────────────────────────────────────────────
  const sites = await Promise.all([
    prisma.site.upsert({
      where: { url: "https://www.paineldeprecos.gov.br" },
      update: {},
      create: { url: "https://www.paineldeprecos.gov.br", nome: "Painel de Preços", lista: ListaSite.branca, categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.comprasnet.gov.br" },
      update: {},
      create: { url: "https://www.comprasnet.gov.br", nome: "Comprasnet", lista: ListaSite.branca, categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://licitacoes-e.com.br" },
      update: {},
      create: { url: "https://licitacoes-e.com.br", nome: "Licitações-e (Banco do Brasil)", lista: ListaSite.branca, categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.compras.gov.br" },
      update: {},
      create: { url: "https://www.compras.gov.br", nome: "Compras.gov.br", lista: ListaSite.branca, categoria: "Portal governamental", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.bec.sp.gov.br" },
      update: {},
      create: { url: "https://www.bec.sp.gov.br", nome: "BEC/SP - Bolsa Eletrônica de Compras", lista: ListaSite.branca, categoria: "Portal estadual", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.buscaprecoapsp.com.br" },
      update: {},
      create: { url: "https://www.buscaprecoapsp.com.br", nome: "Buscapreço APSP", lista: ListaSite.cinza, motivo: "Fonte privada com dados dependentes de atualização voluntária; verificar data da última cotação.", categoria: "Agregador de preços", isMarketplace: false },
    }),
    prisma.site.upsert({
      where: { url: "https://www.mercadolivre.com.br" },
      update: {},
      create: { url: "https://www.mercadolivre.com.br", nome: "Mercado Livre", lista: ListaSite.vermelha, motivo: "Marketplace com preços de terceiros; não admissível como fonte para pesquisa de preços públicos.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.amazon.com.br" },
      update: {},
      create: { url: "https://www.amazon.com.br", nome: "Amazon Brasil", lista: ListaSite.vermelha, motivo: "Marketplace internacional; preços de terceiros sem rastreabilidade adequada.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.shopee.com.br" },
      update: {},
      create: { url: "https://www.shopee.com.br", nome: "Shopee", lista: ListaSite.vermelha, motivo: "Marketplace com vendedores variados; não admissível por ausência de CNPJ do fornecedor.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.magazineluiza.com.br" },
      update: {},
      create: { url: "https://www.magazineluiza.com.br", nome: "Magazine Luiza", lista: ListaSite.vermelha, motivo: "Varejista com marketplace integrado; não é possível distinguir oferta própria de terceiros.", categoria: "Marketplace", isMarketplace: true },
    }),
    prisma.site.upsert({
      where: { url: "https://www.americanas.com.br" },
      update: {},
      create: { url: "https://www.americanas.com.br", nome: "Americanas", lista: ListaSite.vermelha, motivo: "Plataforma de marketplace; preços e fornecedores não identificáveis individualmente.", categoria: "Marketplace", isMarketplace: true },
    }),
  ]);
  console.log("✓ Sites criados:", sites.length);

  // ── Fornecedores ────────────────────────────────────────────────────────────
  const forn001 = await prisma.fornecedor.upsert({
    where: { cnpj: "12.345.678/0001-90" },
    update: {},
    create: {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Móveis Corporativos Santista Ltda.",
      nomeFantasia: "Santos Office",
      categoria: ["Mobiliário", "Equipamentos de escritório"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "Roberto Ferreira",
      email: "roberto.ferreira@santosoffice.com.br",
      telefone: "(13) 3211-4500",
      score: 88,
      totalCotacoes: 12,
      totalRespostas: 11,
      taxaResposta: 91.7,
      ultimaResposta: new Date("2026-05-20"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn002 = await prisma.fornecedor.upsert({
    where: { cnpj: "23.456.789/0001-01" },
    update: {},
    create: {
      cnpj: "23.456.789/0001-01",
      razaoSocial: "Distribuidora Higiene & Limpeza do Brasil S.A.",
      nomeFantasia: "HigiePro",
      categoria: ["Material de limpeza", "Higienização"],
      cidade: "São Paulo",
      estado: "SP",
      responsavelContato: "Marta Oliveira",
      email: "marta.oliveira@higiepro.com.br",
      telefone: "(11) 2233-8800",
      score: 79,
      totalCotacoes: 8,
      totalRespostas: 7,
      taxaResposta: 87.5,
      ultimaResposta: new Date("2026-04-15"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn003 = await prisma.fornecedor.upsert({
    where: { cnpj: "34.567.890/0001-12" },
    update: {},
    create: {
      cnpj: "34.567.890/0001-12",
      razaoSocial: "TechSupply Informática Eireli",
      nomeFantasia: "TechSupply",
      categoria: ["Informática", "Notebooks", "Periféricos"],
      cidade: "Campinas",
      estado: "SP",
      responsavelContato: "Felipe Andrade",
      email: "felipe.andrade@techsupply.com.br",
      telefone: "(19) 3344-9900",
      score: 92,
      totalCotacoes: 15,
      totalRespostas: 14,
      taxaResposta: 93.3,
      ultimaResposta: new Date("2026-06-01"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn004 = await prisma.fornecedor.upsert({
    where: { cnpj: "45.678.901/0001-23" },
    update: {},
    create: {
      cnpj: "45.678.901/0001-23",
      razaoSocial: "Papelaria e Consumíveis União Ltda.",
      nomeFantasia: "Papelaria União",
      categoria: ["Material de consumo", "Papel", "Papelaria"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "Lucia Santos",
      email: "lucia.santos@papelariaUniao.com.br",
      score: 65,
      totalCotacoes: 6,
      totalRespostas: 4,
      taxaResposta: 66.7,
      ultimaResposta: new Date("2026-03-10"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn005 = await prisma.fornecedor.upsert({
    where: { cnpj: "56.789.012/0001-34" },
    update: {},
    create: {
      cnpj: "56.789.012/0001-34",
      razaoSocial: "Impressão Total Serviços Gráficos Ltda.",
      nomeFantasia: "Impressão Total",
      categoria: ["Impressoras", "Outsourcing de impressão"],
      cidade: "São Vicente",
      estado: "SP",
      responsavelContato: "Carlos Nascimento",
      email: "carlos.nascimento@impressaototal.com.br",
      telefone: "(13) 3555-2200",
      score: 58,
      totalCotacoes: 5,
      totalRespostas: 3,
      taxaResposta: 60.0,
      ultimaResposta: new Date("2026-02-28"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn006 = await prisma.fornecedor.upsert({
    where: { cnpj: "67.890.123/0001-45" },
    update: {},
    create: {
      cnpj: "67.890.123/0001-45",
      razaoSocial: "Construtora e Manutenção Predial Litoral S.A.",
      nomeFantasia: "LitoralMant",
      categoria: ["Manutenção predial", "Serviços gerais"],
      cidade: "Guarujá",
      estado: "SP",
      responsavelContato: "Sandra Moreira",
      email: "sandra.moreira@litoralmant.com.br",
      telefone: "(13) 3444-7700",
      score: 42,
      totalCotacoes: 4,
      totalRespostas: 2,
      taxaResposta: 50.0,
      ultimaResposta: new Date("2025-12-05"),
      status: StatusFornecedor.ativo,
    },
  });

  const forn007 = await prisma.fornecedor.upsert({
    where: { cnpj: "78.901.234/0001-56" },
    update: {},
    create: {
      cnpj: "78.901.234/0001-56",
      razaoSocial: "Software Solutions Consultoria em TI Eireli",
      nomeFantasia: "SoftSol",
      categoria: ["Software", "Consultoria em TI", "Segurança da informação"],
      cidade: "São Paulo",
      estado: "SP",
      responsavelContato: "Thiago Ramos",
      email: "thiago.ramos@softsol.com.br",
      score: 35,
      totalCotacoes: 3,
      totalRespostas: 1,
      taxaResposta: 33.3,
      status: StatusFornecedor.inativo,
    },
  });

  const forn008 = await prisma.fornecedor.upsert({
    where: { cnpj: "89.012.345/0001-67" },
    update: {},
    create: {
      cnpj: "89.012.345/0001-67",
      razaoSocial: "EcoSuprimentos Ltda.",
      nomeFantasia: "EcoSupri",
      categoria: ["Material de limpeza", "Produtos sustentáveis"],
      cidade: "Praia Grande",
      estado: "SP",
      responsavelContato: "Patrícia Costa",
      email: "patricia.costa@ecosupri.com.br",
      telefone: "(13) 3666-1100",
      score: 72,
      totalCotacoes: 7,
      totalRespostas: 6,
      taxaResposta: 85.7,
      ultimaResposta: new Date("2026-05-12"),
      status: StatusFornecedor.ativo,
    },
  });

  console.log("✓ Fornecedores criados: 8");

  // ── Histórico de cotações ───────────────────────────────────────────────────
  await prisma.historicoCotacao.createMany({
    data: [
      { fornecedorId: forn001.id, processoNumero: "2026/001", data: new Date("2026-03-10"), statusResposta: StatusResposta.respondido, valorProposto: 1250.0 },
      { fornecedorId: forn001.id, processoNumero: "2025/045", data: new Date("2025-09-22"), statusResposta: StatusResposta.respondido, valorProposto: 1180.0 },
      { fornecedorId: forn001.id, processoNumero: "2025/031", data: new Date("2025-06-14"), statusResposta: StatusResposta.nao_respondido },
      { fornecedorId: forn002.id, processoNumero: "2026/003", data: new Date("2026-02-18"), statusResposta: StatusResposta.respondido, valorProposto: 87.5 },
      { fornecedorId: forn002.id, processoNumero: "2025/062", data: new Date("2025-11-07"), statusResposta: StatusResposta.respondido, valorProposto: 92.0 },
      { fornecedorId: forn003.id, processoNumero: "2026/005", data: new Date("2026-05-02"), statusResposta: StatusResposta.respondido, valorProposto: 4750.0 },
      { fornecedorId: forn003.id, processoNumero: "2025/089", data: new Date("2025-12-10"), statusResposta: StatusResposta.respondido, valorProposto: 4600.0 },
      { fornecedorId: forn004.id, processoNumero: "2026/007", data: new Date("2026-03-25"), statusResposta: StatusResposta.respondido, valorProposto: 29.5 },
      { fornecedorId: forn005.id, processoNumero: "2026/008", data: new Date("2026-04-08"), statusResposta: StatusResposta.recusado },
      { fornecedorId: forn006.id, processoNumero: "2026/002", data: new Date("2026-01-30"), statusResposta: StatusResposta.nao_respondido },
      { fornecedorId: forn007.id, processoNumero: "2026/006", data: new Date("2026-02-05"), statusResposta: StatusResposta.nao_respondido },
      { fornecedorId: forn008.id, processoNumero: "2026/003", data: new Date("2026-02-20"), statusResposta: StatusResposta.respondido, valorProposto: 91.0 },
    ],
    skipDuplicates: true,
  });
  console.log("✓ Histórico de cotações criado");

  // ── Processos ───────────────────────────────────────────────────────────────
  const proc001 = await prisma.processo.upsert({
    where: { numero: "2026/001" },
    update: {},
    create: {
      numero: "2026/001",
      objeto: "Aquisição de cadeiras ergonômicas",
      unidade: "unidade",
      quantidade: 40,
      caracteristicasTecnicas: "Encosto regulável, apoio lombar, certificação NR-17.",
      palavrasChave: ["cadeira", "ergonômica", "mobiliário"],
      classificacao: ClassificacaoItem.comum,
      responsavel: "Ana Souza",
      status: StatusProcesso.aderente,
      dataAbertura: new Date("2026-02-10"),
    },
  });

  const proc002 = await prisma.processo.upsert({
    where: { numero: "2026/002" },
    update: {},
    create: {
      numero: "2026/002",
      objeto: "Serviço de manutenção predial preventiva",
      unidade: "serviço",
      quantidade: 1,
      caracteristicasTecnicas: "Contrato anual, atendimento mensal, equipe especializada.",
      palavrasChave: ["manutenção", "predial", "serviço"],
      classificacao: ClassificacaoItem.especifico,
      responsavel: "Bruno Lima",
      status: StatusProcesso.pendente,
      dataAbertura: new Date("2026-03-05"),
    },
  });

  const proc003 = await prisma.processo.upsert({
    where: { numero: "2026/003" },
    update: {},
    create: {
      numero: "2026/003",
      objeto: "Material de limpeza e higienização",
      unidade: "kit",
      quantidade: 120,
      caracteristicasTecnicas: "Kits com produtos biodegradáveis, registro ANVISA.",
      palavrasChave: ["limpeza", "higiene", "consumo"],
      classificacao: ClassificacaoItem.comum,
      responsavel: "Carla Dias",
      status: StatusProcesso.parcial,
      dataAbertura: new Date("2026-01-22"),
    },
  });

  const proc004 = await prisma.processo.upsert({
    where: { numero: "2026/004" },
    update: {},
    create: {
      numero: "2026/004",
      objeto: "Licença de software de gestão documental",
      unidade: "licença",
      quantidade: 25,
      caracteristicasTecnicas: "Licença anual, suporte técnico, conformidade LGPD.",
      palavrasChave: ["software", "licença", "gestão"],
      classificacao: ClassificacaoItem.especifico,
      responsavel: "Diego Alves",
      status: StatusProcesso.nao_aderente,
      dataAbertura: new Date("2025-11-30"),
    },
  });

  const proc005 = await prisma.processo.upsert({
    where: { numero: "2026/005" },
    update: {},
    create: {
      numero: "2026/005",
      objeto: "Aquisição de notebooks corporativos",
      unidade: "unidade",
      quantidade: 30,
      caracteristicasTecnicas: "16GB RAM, SSD 512GB, garantia on-site 36 meses.",
      palavrasChave: ["notebook", "informática", "equipamento"],
      classificacao: ClassificacaoItem.comum,
      responsavel: "Ana Souza",
      status: StatusProcesso.pendente,
      dataAbertura: new Date("2026-04-12"),
    },
  });

  await prisma.processo.upsert({
    where: { numero: "2026/006" },
    update: {},
    create: {
      numero: "2026/006",
      objeto: "Serviço de consultoria em segurança da informação",
      unidade: "serviço",
      quantidade: 1,
      caracteristicasTecnicas: "Diagnóstico, plano de ação e relatório de conformidade.",
      palavrasChave: ["consultoria", "segurança", "TI"],
      classificacao: ClassificacaoItem.especifico,
      responsavel: "Carla Dias",
      status: StatusProcesso.aderente,
      dataAbertura: new Date("2025-12-15"),
    },
  });

  const proc007 = await prisma.processo.upsert({
    where: { numero: "2026/007" },
    update: {},
    create: {
      numero: "2026/007",
      objeto: "Aquisição de papel A4 sustentável",
      unidade: "resma",
      quantidade: 500,
      caracteristicasTecnicas: "Certificação FSC, gramatura 75g/m², alvura 90%.",
      palavrasChave: ["papel", "consumo", "sustentável"],
      classificacao: ClassificacaoItem.comum,
      responsavel: "Bruno Lima",
      status: StatusProcesso.parcial,
      dataAbertura: new Date("2026-02-28"),
    },
  });

  await prisma.processo.upsert({
    where: { numero: "2026/008" },
    update: {},
    create: {
      numero: "2026/008",
      objeto: "Locação de impressoras multifuncionais",
      unidade: "serviço",
      quantidade: 12,
      caracteristicasTecnicas: "Outsourcing de impressão, franquia mensal, manutenção inclusa.",
      palavrasChave: ["impressora", "locação", "outsourcing"],
      classificacao: ClassificacaoItem.especifico,
      responsavel: "Diego Alves",
      status: StatusProcesso.nao_aderente,
      dataAbertura: new Date("2025-10-08"),
    },
  });

  console.log("✓ Processos criados: 8");

  // ── Contratações Públicas ───────────────────────────────────────────────────
  await prisma.contratacaoPublica.createMany({
    data: [
      { processoId: proc001.id, numero: "PE-2025/0142", orgao: "Câmara Municipal de Santos", objeto: "Aquisição de cadeiras ergonômicas com encosto regulável e apoio lombar", modalidade: "Pregão Eletrônico", valorUnitario: 1250.0, quantidade: 40, unidade: "unidade", dataContratacao: new Date("2025-08-15"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: AderenciaFonte.aderente, palavrasChave: ["cadeira", "ergonômica", "mobiliário"] },
      { processoId: proc001.id, numero: "PE-2025/0389", orgao: "Tribunal Regional Eleitoral de SP", objeto: "Fornecimento de cadeiras giratórias ergonômicas NR-17", modalidade: "Pregão Eletrônico", valorUnitario: 1180.0, quantidade: 60, unidade: "unidade", dataContratacao: new Date("2025-06-20"), fonteUrl: "https://comprasnet.gov.br", aderencia: AderenciaFonte.aderente, palavrasChave: ["cadeira", "ergonômica", "NR-17"] },
      { processoId: proc003.id, numero: "DL-2025/0071", orgao: "Ministério da Saúde", objeto: "Aquisição de kits de material de limpeza e higienização com registro ANVISA", modalidade: "Dispensa de Licitação", valorUnitario: 87.5, quantidade: 100, unidade: "kit", dataContratacao: new Date("2025-09-03"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: AderenciaFonte.aderente, palavrasChave: ["limpeza", "higiene", "ANVISA"] },
      { processoId: proc003.id, numero: "PE-2025/0501", orgao: "Prefeitura Municipal de Guarujá", objeto: "Fornecimento de material de limpeza biodegradável para uso institucional", modalidade: "Pregão Eletrônico", valorUnitario: 95.0, quantidade: 80, unidade: "kit", dataContratacao: new Date("2025-10-11"), fonteUrl: "https://comprasnet.gov.br", aderencia: AderenciaFonte.parcial, justificativaAderencia: "Especificação de biodegradabilidade atende, mas quantidade mínima por item diverge levemente.", palavrasChave: ["limpeza", "biodegradável"] },
      { processoId: proc005.id, numero: "CC-2025/0018", orgao: "Tribunal de Contas do Estado de SP", objeto: "Aquisição de notebooks corporativos com 16GB RAM e SSD 512GB", modalidade: "Concorrência", valorUnitario: 4850.0, quantidade: 25, unidade: "unidade", dataContratacao: new Date("2025-05-28"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: AderenciaFonte.aderente, palavrasChave: ["notebook", "informática", "equipamento"] },
      { processoId: proc005.id, numero: "PE-2024/0677", orgao: "Câmara dos Deputados", objeto: "Fornecimento de notebooks com processador Intel i5 e 8GB RAM", modalidade: "Pregão Eletrônico", valorUnitario: 3200.0, quantidade: 50, unidade: "unidade", dataContratacao: new Date("2024-11-14"), fonteUrl: "https://comprasnet.gov.br", aderencia: AderenciaFonte.parcial, justificativaAderencia: "Especificação de RAM (8GB) inferior à demanda (16GB); valor referencial pode estar desatualizado.", palavrasChave: ["notebook", "informática"] },
      { processoId: proc007.id, numero: "PE-2025/0233", orgao: "Universidade Federal de São Paulo", objeto: "Aquisição de papel A4 75g/m² com certificação FSC", modalidade: "Pregão Eletrônico", valorUnitario: 28.9, quantidade: 400, unidade: "resma", dataContratacao: new Date("2025-07-19"), fonteUrl: "https://paineldeprecos.gov.br", aderencia: AderenciaFonte.aderente, palavrasChave: ["papel", "consumo", "FSC"] },
    ],
    skipDuplicates: true,
  });
  console.log("✓ Contratações públicas criadas");

  // ── Cotações ────────────────────────────────────────────────────────────────
  const cot001 = await prisma.cotacao.create({
    data: {
      processoId: proc001.id,
      fornecedorId: forn001.id,
      dataEnvio: new Date("2026-05-20"),
      dataLimite: new Date("2026-06-03"),
      status: StatusCotacao.positiva,
      lembreteEnviado: false,
      valorProposto: 1250.0,
      observacao: "Proposta recebida dentro do prazo.",
    },
  });

  await prisma.cotacao.create({
    data: {
      processoId: proc001.id,
      fornecedorId: forn002.id,
      dataEnvio: new Date("2026-05-20"),
      dataLimite: new Date("2026-06-03"),
      status: StatusCotacao.silenciosa,
      lembreteEnviado: true,
      observacao: "Lembrete enviado em 31/05. Sem resposta.",
    },
  });

  const cot003 = await prisma.cotacao.create({
    data: {
      processoId: proc001.id,
      fornecedorId: forn004.id,
      dataEnvio: new Date("2026-05-20"),
      dataLimite: new Date("2026-06-03"),
      status: StatusCotacao.incompleta,
      lembreteEnviado: true,
      valorProposto: 980.0,
      observacao: "Proposta sem CNPJ do responsável.",
    },
  });

  const cot004 = await prisma.cotacao.create({
    data: {
      processoId: proc005.id,
      fornecedorId: forn003.id,
      dataEnvio: new Date("2026-06-01"),
      dataLimite: new Date("2026-06-20"),
      status: StatusCotacao.positiva,
      lembreteEnviado: false,
      valorProposto: 4750.0,
    },
  });

  await prisma.cotacao.create({
    data: {
      processoId: proc005.id,
      fornecedorId: forn007.id,
      dataEnvio: new Date("2026-06-01"),
      dataLimite: new Date("2026-06-20"),
      status: StatusCotacao.negativa,
      lembreteEnviado: false,
      observacao: "Fornecedor informou que não trabalha com esse segmento.",
    },
  });

  await prisma.cotacao.create({
    data: {
      processoId: proc005.id,
      fornecedorId: forn008.id,
      dataEnvio: new Date("2026-06-01"),
      dataLimite: new Date("2026-06-20"),
      status: StatusCotacao.silenciosa,
      lembreteEnviado: false,
    },
  });

  const cot007 = await prisma.cotacao.create({
    data: {
      processoId: proc003.id,
      fornecedorId: forn002.id,
      dataEnvio: new Date("2026-04-10"),
      dataLimite: new Date("2026-04-24"),
      status: StatusCotacao.positiva,
      lembreteEnviado: false,
      valorProposto: 87.5,
    },
  });

  await prisma.cotacao.create({
    data: {
      processoId: proc003.id,
      fornecedorId: forn008.id,
      dataEnvio: new Date("2026-04-10"),
      dataLimite: new Date("2026-04-24"),
      status: StatusCotacao.positiva,
      lembreteEnviado: false,
      valorProposto: 91.0,
    },
  });

  console.log("✓ Cotações criadas: 8");

  // ── Propostas ───────────────────────────────────────────────────────────────
  await prisma.proposta.createMany({
    data: [
      {
        cotacaoId: cot001.id,
        cnpjValido: StatusChecklist.valido,
        descricaoValida: StatusChecklist.valido,
        valorUnitarioValido: StatusChecklist.valido,
        valorTotalValido: StatusChecklist.valido,
        dataValida: StatusChecklist.valido,
        responsavelValido: StatusChecklist.valido,
        statusGeral: StatusGeral.valida,
        valorUnitario: 1250.0,
        valorTotal: 50000.0,
        dataProposta: new Date("2026-05-28"),
        responsavel: "Roberto Ferreira",
      },
      {
        cotacaoId: cot003.id,
        cnpjValido: StatusChecklist.invalido,
        descricaoValida: StatusChecklist.valido,
        valorUnitarioValido: StatusChecklist.valido,
        valorTotalValido: StatusChecklist.valido,
        dataValida: StatusChecklist.valido,
        responsavelValido: StatusChecklist.ressalva,
        statusGeral: StatusGeral.invalida,
        valorUnitario: 980.0,
        valorTotal: 39200.0,
        dataProposta: new Date("2026-05-30"),
        responsavel: "Desconhecido",
        observacoes: "CNPJ do fornecedor não confere com a razão social apresentada na proposta.",
      },
      {
        cotacaoId: cot004.id,
        cnpjValido: StatusChecklist.valido,
        descricaoValida: StatusChecklist.valido,
        valorUnitarioValido: StatusChecklist.valido,
        valorTotalValido: StatusChecklist.valido,
        dataValida: StatusChecklist.valido,
        responsavelValido: StatusChecklist.valido,
        statusGeral: StatusGeral.valida,
        valorUnitario: 4750.0,
        valorTotal: 142500.0,
        dataProposta: new Date("2026-06-08"),
        responsavel: "Felipe Andrade",
      },
      {
        cotacaoId: cot007.id,
        cnpjValido: StatusChecklist.valido,
        descricaoValida: StatusChecklist.ressalva,
        valorUnitarioValido: StatusChecklist.valido,
        valorTotalValido: StatusChecklist.valido,
        dataValida: StatusChecklist.valido,
        responsavelValido: StatusChecklist.valido,
        statusGeral: StatusGeral.com_ressalva,
        valorUnitario: 87.5,
        valorTotal: 10500.0,
        dataProposta: new Date("2026-04-18"),
        responsavel: "Marta Oliveira",
        observacoes: "Descrição do produto ligeiramente diferente do especificado no edital.",
      },
    ],
  });
  console.log("✓ Propostas criadas: 4");

  // ── Itens e Séries de Preços ─────────────────────────────────────────────────
  const item001 = await prisma.item.create({
    data: {
      processoId: proc001.id,
      descricao: "Cadeira ergonômica com encosto regulável e apoio lombar",
      unidade: "unidade",
      quantidade: 40,
      classificacao: ClassificacaoItem.comum,
      caracteristicasTecnicas: "Encosto regulável, apoio lombar, certificação NR-17.",
      palavrasChave: ["cadeira", "ergonômica", "mobiliário"],
    },
  });

  const item003 = await prisma.item.create({
    data: {
      processoId: proc003.id,
      descricao: "Kit de material de limpeza e higienização biodegradável",
      unidade: "kit",
      quantidade: 120,
      classificacao: ClassificacaoItem.comum,
      caracteristicasTecnicas: "Kits com produtos biodegradáveis, registro ANVISA.",
      palavrasChave: ["limpeza", "higiene", "consumo"],
    },
  });

  const item005 = await prisma.item.create({
    data: {
      processoId: proc005.id,
      descricao: "Notebook corporativo 16GB RAM SSD 512GB",
      unidade: "unidade",
      quantidade: 30,
      classificacao: ClassificacaoItem.comum,
      caracteristicasTecnicas: "16GB RAM, SSD 512GB, garantia on-site 36 meses.",
      palavrasChave: ["notebook", "informática", "equipamento"],
    },
  });

  // SeriePreco proc-001
  const serie001 = await prisma.seriePreco.create({
    data: {
      itemId: item001.id,
      metodo: MetodoConsolidacao.media,
      valorEstimado: 1250.0,
      media: 1250.0,
      mediana: 1250.0,
      menorValor: 1180.0,
      coeficienteVariacao: 5.6,
      totalPrecos: 5,
      precosIncluidos: 3,
    },
  });

  await prisma.precoConsolidado.createMany({
    data: [
      { seriePrecoId: serie001.id, fonte: TipoFonte.contratacao_publica, descricaoFonte: "Pregão 045/2025 — TRE-SP", fornecedorOuOrgao: "TRE-SP", dataReferencia: new Date("2025-11-10"), valorUnitario: 1180.0, status: StatusPreco.incluido },
      { seriePrecoId: serie001.id, fonte: TipoFonte.contratacao_publica, descricaoFonte: "Pregão 012/2025 — ALESP", fornecedorOuOrgao: "ALESP", dataReferencia: new Date("2025-08-22"), valorUnitario: 1320.0, status: StatusPreco.incluido },
      { seriePrecoId: serie001.id, fonte: TipoFonte.site_eletronico, descricaoFonte: "Consulta site da fabricante — Marelli", fornecedorOuOrgao: "Marelli S.A.", dataReferencia: new Date("2026-05-15"), valorUnitario: 1450.0, status: StatusPreco.excluido, motivoExclusao: "Valor discrepante (>20% acima da média): possível precificação desatualizada." },
      { seriePrecoId: serie001.id, fonte: TipoFonte.fornecedor_direto, descricaoFonte: "Proposta Móveis Corporativos Santista", fornecedorOuOrgao: "Santos Office", dataReferencia: new Date("2026-05-28"), valorUnitario: 1250.0, status: StatusPreco.incluido },
      { seriePrecoId: serie001.id, fonte: TipoFonte.fornecedor_direto, descricaoFonte: "Proposta Papelaria União (inválida)", fornecedorOuOrgao: "Papelaria União", dataReferencia: new Date("2026-05-30"), valorUnitario: 980.0, status: StatusPreco.excluido, motivoExclusao: "Proposta inválida: CNPJ não confere." },
    ],
  });

  // SeriePreco proc-005
  const serie005 = await prisma.seriePreco.create({
    data: {
      itemId: item005.id,
      metodo: MetodoConsolidacao.mediana,
      valorEstimado: 4750.0,
      media: 4723.33,
      mediana: 4750.0,
      menorValor: 4600.0,
      coeficienteVariacao: 2.4,
      totalPrecos: 3,
      precosIncluidos: 3,
    },
  });

  await prisma.precoConsolidado.createMany({
    data: [
      { seriePrecoId: serie005.id, fonte: TipoFonte.contratacao_publica, descricaoFonte: "Pregão 089/2025 — TCE-SP", fornecedorOuOrgao: "TCE-SP", dataReferencia: new Date("2025-12-10"), valorUnitario: 4600.0, status: StatusPreco.incluido },
      { seriePrecoId: serie005.id, fonte: TipoFonte.contratacao_publica, descricaoFonte: "Pregão 033/2026 — Prefeitura de Guarulhos", fornecedorOuOrgao: "Prefeitura de Guarulhos", dataReferencia: new Date("2026-03-18"), valorUnitario: 4820.0, status: StatusPreco.incluido },
      { seriePrecoId: serie005.id, fonte: TipoFonte.fornecedor_direto, descricaoFonte: "Proposta TechSupply Informática", fornecedorOuOrgao: "TechSupply", dataReferencia: new Date("2026-06-08"), valorUnitario: 4750.0, status: StatusPreco.incluido },
    ],
  });

  // SeriePreco proc-003
  const serie003 = await prisma.seriePreco.create({
    data: {
      itemId: item003.id,
      metodo: MetodoConsolidacao.media,
      valorEstimado: 90.17,
      media: 90.17,
      mediana: 91.0,
      menorValor: 87.5,
      coeficienteVariacao: 2.6,
      totalPrecos: 3,
      precosIncluidos: 3,
    },
  });

  await prisma.precoConsolidado.createMany({
    data: [
      { seriePrecoId: serie003.id, fonte: TipoFonte.contratacao_publica, descricaoFonte: "Pregão 062/2025 — SABESP", fornecedorOuOrgao: "SABESP", dataReferencia: new Date("2025-11-07"), valorUnitario: 92.0, status: StatusPreco.incluido },
      { seriePrecoId: serie003.id, fonte: TipoFonte.fornecedor_direto, descricaoFonte: "Proposta HigiePro", fornecedorOuOrgao: "HigiePro", dataReferencia: new Date("2026-04-18"), valorUnitario: 87.5, status: StatusPreco.incluido },
      { seriePrecoId: serie003.id, fonte: TipoFonte.fornecedor_direto, descricaoFonte: "Proposta EcoSupri", fornecedorOuOrgao: "EcoSupri", dataReferencia: new Date("2026-04-20"), valorUnitario: 91.0, status: StatusPreco.incluido },
    ],
  });

  console.log("✓ Séries de preços e preços criados");
  console.log("✅ Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Executar o seed**

```bash
pnpm exec prisma db seed
```

Expected: `✅ Seed concluído com sucesso!`

- [ ] **Step 3: Verificar dados via Prisma Studio**

```bash
pnpm exec prisma studio
```

Acesse `http://localhost:5555`. Verifique:
- `processos`: 8 registros
- `fornecedores`: 8 registros
- `cotacoes`: 8 registros
- `sites`: 11 registros
- `series_precos`: 3 registros

Feche com Ctrl+C.

---

## Task 9: Criar schemas Zod compartilhados

**Files:**
- Create: `src/lib/validations/processo.ts`
- Create: `src/lib/validations/fornecedor.ts`
- Create: `src/lib/validations/cotacao.ts`
- Create: `src/lib/validations/preco.ts`
- Create: `src/lib/validations/index.ts`

Os schemas Zod devem espelhar os tipos do Prisma para validação em server actions e route handlers. Instalar Zod se ainda não estiver disponível.

- [ ] **Step 1: Instalar Zod (verificar se já está no projeto)**

```bash
pnpm list zod
```

Se não aparecer, instalar:

```bash
pnpm add zod
```

(Zod já está nas dependências via shadcn/ui — verificar antes de instalar novamente.)

- [ ] **Step 2: Criar `src/lib/validations/processo.ts`**

```typescript
import { z } from "zod";

export const classificacaoItemSchema = z.enum(["comum", "especifico"]);

export const statusProcessoSchema = z.enum([
  "aderente",
  "parcial",
  "nao_aderente",
  "pendente",
]);

export const createProcessoSchema = z.object({
  numero: z.string().min(1, "Número do processo obrigatório"),
  objeto: z.string().min(3, "Objeto deve ter ao menos 3 caracteres"),
  unidade: z.string().min(1, "Unidade obrigatória"),
  quantidade: z.number().int().positive("Quantidade deve ser positiva"),
  caracteristicasTecnicas: z.string().min(1),
  palavrasChave: z.array(z.string()).min(1, "Informe ao menos uma palavra-chave"),
  classificacao: classificacaoItemSchema,
  responsavel: z.string().min(1, "Responsável obrigatório"),
  dataAbertura: z.coerce.date(),
});

export const updateProcessoSchema = createProcessoSchema.partial().extend({
  status: statusProcessoSchema.optional(),
});

export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;
export type UpdateProcessoInput = z.infer<typeof updateProcessoSchema>;

export const createItemSchema = z.object({
  processoId: z.string().cuid(),
  descricao: z.string().min(3),
  unidade: z.string().min(1),
  quantidade: z.number().int().positive(),
  classificacao: classificacaoItemSchema,
  caracteristicasTecnicas: z.string().optional(),
  palavrasChave: z.array(z.string()),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
```

- [ ] **Step 3: Criar `src/lib/validations/fornecedor.ts`**

```typescript
import { z } from "zod";

export const statusFornecedorSchema = z.enum(["ativo", "inativo"]);

const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

export const createFornecedorSchema = z.object({
  cnpj: z.string().regex(cnpjRegex, "CNPJ inválido (formato: XX.XXX.XXX/XXXX-XX)"),
  razaoSocial: z.string().min(3, "Razão social obrigatória"),
  nomeFantasia: z.string().optional(),
  categoria: z.array(z.string()).min(1, "Informe ao menos uma categoria"),
  cidade: z.string().min(1, "Cidade obrigatória"),
  estado: z.string().length(2, "Estado deve ter 2 letras (ex: SP)"),
  responsavelContato: z.string().min(2, "Responsável obrigatório"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().optional(),
});

export const updateFornecedorSchema = createFornecedorSchema.partial().extend({
  status: statusFornecedorSchema.optional(),
});

export type CreateFornecedorInput = z.infer<typeof createFornecedorSchema>;
export type UpdateFornecedorInput = z.infer<typeof updateFornecedorSchema>;
```

- [ ] **Step 4: Criar `src/lib/validations/cotacao.ts`**

```typescript
import { z } from "zod";

export const statusCotacaoSchema = z.enum([
  "positiva",
  "negativa",
  "incompleta",
  "silenciosa",
]);

export const statusChecklistSchema = z.enum(["valido", "ressalva", "invalido"]);

export const statusGeralSchema = z.enum(["valida", "com_ressalva", "invalida"]);

export const createCotacaoSchema = z.object({
  processoId: z.string().cuid(),
  fornecedorId: z.string().cuid(),
  dataEnvio: z.coerce.date(),
  dataLimite: z.coerce.date(),
  observacao: z.string().optional(),
});

export const updateCotacaoSchema = z.object({
  status: statusCotacaoSchema.optional(),
  lembreteEnviado: z.boolean().optional(),
  valorProposto: z.number().positive().optional(),
  observacao: z.string().optional(),
});

export const createPropostaSchema = z.object({
  cotacaoId: z.string().cuid(),
  cnpjValido: statusChecklistSchema,
  descricaoValida: statusChecklistSchema,
  valorUnitarioValido: statusChecklistSchema,
  valorTotalValido: statusChecklistSchema,
  dataValida: statusChecklistSchema,
  responsavelValido: statusChecklistSchema,
  statusGeral: statusGeralSchema,
  valorUnitario: z.number().positive().optional(),
  valorTotal: z.number().positive().optional(),
  dataProposta: z.coerce.date().optional(),
  responsavel: z.string().optional(),
  observacoes: z.string().optional(),
});

export type CreateCotacaoInput = z.infer<typeof createCotacaoSchema>;
export type UpdateCotacaoInput = z.infer<typeof updateCotacaoSchema>;
export type CreatePropostaInput = z.infer<typeof createPropostaSchema>;
```

- [ ] **Step 5: Criar `src/lib/validations/preco.ts`**

```typescript
import { z } from "zod";

export const tipoFonteSchema = z.enum([
  "contratacao_publica",
  "site_eletronico",
  "fornecedor_direto",
]);

export const metodoConsolidacaoSchema = z.enum([
  "media",
  "mediana",
  "menor_valor",
]);

export const statusPrecoSchema = z.enum(["incluido", "excluido"]);

export const createPrecoConsolidadoSchema = z.object({
  seriePrecoId: z.string().cuid(),
  fonte: tipoFonteSchema,
  descricaoFonte: z.string().min(1),
  fornecedorOuOrgao: z.string().min(1),
  dataReferencia: z.coerce.date(),
  valorUnitario: z.number().positive("Valor unitário deve ser positivo"),
  status: statusPrecoSchema.default("incluido"),
  motivoExclusao: z.string().optional(),
});

export const createSeriePrecoSchema = z.object({
  itemId: z.string().cuid(),
  metodo: metodoConsolidacaoSchema,
});

export type CreatePrecoConsolidadoInput = z.infer<typeof createPrecoConsolidadoSchema>;
export type CreateSeriePrecoInput = z.infer<typeof createSeriePrecoSchema>;
```

- [ ] **Step 6: Criar `src/lib/validations/index.ts`**

```typescript
export * from "./processo";
export * from "./fornecedor";
export * from "./cotacao";
export * from "./preco";
```

---

## Task 10: Escrever testes dos schemas Zod

**Files:**
- Create: `src/lib/validations/__tests__/schemas.test.ts`

- [ ] **Step 1: Criar `src/lib/validations/__tests__/schemas.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  createProcessoSchema,
  createFornecedorSchema,
  createCotacaoSchema,
  createPropostaSchema,
  createPrecoConsolidadoSchema,
} from "@/lib/validations";

describe("createProcessoSchema", () => {
  it("aceita processo válido", () => {
    const input = {
      numero: "2026/001",
      objeto: "Aquisição de cadeiras ergonômicas",
      unidade: "unidade",
      quantidade: 40,
      caracteristicasTecnicas: "Encosto regulável, apoio lombar.",
      palavrasChave: ["cadeira", "ergonômica"],
      classificacao: "comum" as const,
      responsavel: "Ana Souza",
      dataAbertura: new Date("2026-02-10"),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita quantidade zero", () => {
    const input = {
      numero: "2026/001",
      objeto: "Objeto qualquer",
      unidade: "unidade",
      quantidade: 0,
      caracteristicasTecnicas: "Algo",
      palavrasChave: ["teste"],
      classificacao: "comum" as const,
      responsavel: "Fulano",
      dataAbertura: new Date(),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita sem palavras-chave", () => {
    const input = {
      numero: "2026/001",
      objeto: "Objeto qualquer",
      unidade: "unidade",
      quantidade: 10,
      caracteristicasTecnicas: "Algo",
      palavrasChave: [],
      classificacao: "comum" as const,
      responsavel: "Fulano",
      dataAbertura: new Date(),
    };
    const result = createProcessoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createFornecedorSchema", () => {
  it("aceita CNPJ no formato correto", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita CNPJ sem formatação", () => {
    const input = {
      cnpj: "12345678000190",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SP",
      responsavelContato: "João Silva",
      email: "nao-e-um-email",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejeita estado com mais de 2 letras", () => {
    const input = {
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Empresa Teste Ltda.",
      categoria: ["Informática"],
      cidade: "Santos",
      estado: "SPP",
      responsavelContato: "João Silva",
      email: "joao@empresa.com.br",
    };
    const result = createFornecedorSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createCotacaoSchema", () => {
  it("aceita cotação válida", () => {
    const input = {
      processoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fornecedorId: "clxxxxxxxxxxxxxxxxxxxxxxxy",
      dataEnvio: new Date("2026-05-20"),
      dataLimite: new Date("2026-06-03"),
    };
    const result = createCotacaoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("createPropostaSchema", () => {
  it("aceita proposta válida completa", () => {
    const input = {
      cotacaoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      cnpjValido: "valido" as const,
      descricaoValida: "valido" as const,
      valorUnitarioValido: "valido" as const,
      valorTotalValido: "valido" as const,
      dataValida: "valido" as const,
      responsavelValido: "valido" as const,
      statusGeral: "valida" as const,
      valorUnitario: 1250.0,
      valorTotal: 50000.0,
    };
    const result = createPropostaSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("createPrecoConsolidadoSchema", () => {
  it("aceita preço válido incluído", () => {
    const input = {
      seriePrecoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fonte: "contratacao_publica" as const,
      descricaoFonte: "Pregão 001/2026",
      fornecedorOuOrgao: "Tribunal XYZ",
      dataReferencia: new Date("2026-01-01"),
      valorUnitario: 1250.0,
      status: "incluido" as const,
    };
    const result = createPrecoConsolidadoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejeita valor unitário zero ou negativo", () => {
    const input = {
      seriePrecoId: "clxxxxxxxxxxxxxxxxxxxxxxxx",
      fonte: "contratacao_publica" as const,
      descricaoFonte: "Pregão 001/2026",
      fornecedorOuOrgao: "Tribunal XYZ",
      dataReferencia: new Date("2026-01-01"),
      valorUnitario: 0,
    };
    const result = createPrecoConsolidadoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes**

```bash
pnpm test
```

Expected: todos os testes passam (incluindo testes pré-existentes e os novos).

---

## Task 11: Verificar qualidade e commit final

**Files:**
- Modify: `docs/PLAN.md` (marcar entregas do M5 como concluídas)

- [ ] **Step 1: Rodar lint e typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 2: Rodar todos os testes**

```bash
pnpm test
```

Expected: todos os testes passam.

- [ ] **Step 3: Marcar entregas do M5 como `[x]` no PLAN.md**

No arquivo `docs/PLAN.md`, altere as linhas do M5 de `- [ ]` para `- [x]`:

```markdown
- [x] Postgres local (docker-compose) + `DATABASE_URL`.
- [x] `prisma/schema.prisma` com modelos: User, Processo, Item, Fonte, Evidencia, Fornecedor, Cotacao, Proposta, SeriePreco/PrecoConsolidado, AuditLog.
- [x] Migration inicial + `lib/db.ts` (singleton Prisma).
- [x] Script de seed com dados equivalentes às fixtures de UI.
- [x] Schemas Zod compartilhados em `lib/validations/` alinhados ao schema do banco.
```

- [ ] **Step 4: Commit final**

```bash
git add docker-compose.yml prisma/ src/lib/db.ts src/lib/validations/ docs/PLAN.md package.json pnpm-lock.yaml
git commit -m "feat: schema Prisma, migration inicial e seed do domínio"
```

---

## Self-Review — Cobertura da Spec

| Entrega do M5 | Task que cobre |
|---|---|
| Postgres local (docker-compose) + `DATABASE_URL` | Task 2 |
| `prisma/schema.prisma` com todos os modelos | Task 4 |
| Migration inicial | Task 5 |
| `lib/db.ts` (singleton Prisma) | Task 6 |
| Script de seed com dados equivalentes às fixtures | Task 8 |
| Schemas Zod em `lib/validations/` alinhados ao banco | Task 9 |
| Testes unitários dos schemas | Task 10 |
| Branch `feat/db-prisma` | Task 1 |
| Commit final | Task 11 |

**Critério de aceite:** `prisma migrate` e `prisma db seed` rodam; dados visíveis via Prisma Studio. ✓ Coberto pela Task 5, Task 8.
