# Pesquisa por Similaridade (TR → Contratos → Fornecedores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual contract/price/supplier search with an AI-assisted pipeline that reads a Termo de Referência (TR) PDF + the standard spreadsheet, ranks similar public contracts with an auditable score, suggests geographically-prioritized direct suppliers, and lets the user review/edit results in a per-item dialog that syncs back to the original spreadsheet.

**Architecture:** New `src/lib/ia/` (Gemini Flash client behind a swappable interface), `src/lib/integracoes/` (PNCP + Painel de Preços HTTP clients), `src/lib/similaridade/` (pipeline orchestrator reusing existing `priceStats.ts`/`in65Rules.ts`), a new `ResultadoSimilaridade` Prisma model, a new server action `processarPesquisaSimilaridade`, a Sheets write-back extension, a fornecedor discovery extension, and a new "Pesquisa por Similaridade" tab/dialog in the process detail page. Email dispatch (Resend) is removed first as unrelated cleanup explicitly requested by the user.

**Tech Stack:** Next.js App Router, TypeScript strict, Prisma/PostgreSQL, Zod, Vitest, `@google/genai` (Gemini Flash SDK, to be installed), Google Sheets API (Service Account).

---

## Part A — Remove email/Resend dispatch (cleanup)

### Task A1: Remove email sending from `criarCotacao`

**Files:**
- Modify: `src/lib/actions/cotacoes.ts`

- [ ] **Step 1: Remove the `enviarCotacao` import and the email-sending block**

In `src/lib/actions/cotacoes.ts`, remove line 12 (`import { enviarCotacao } from "@/lib/email";`) and replace lines 15-54 with:

```typescript
export async function criarCotacao(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createCotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.create({
    data: { ...parsed.data, status: "silenciosa" },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: parsed.data.processoId,
    cotacaoId: cotacao.id,
    acao: "criar_cotacao",
    detalhes: { cotacaoId: cotacao.id, fornecedorId: parsed.data.fornecedorId },
  });

  return { data: { id: cotacao.id } };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors related to `cotacoes.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/cotacoes.ts
git commit -m "fix: remove disparo de e-mail de cotacao (envio é feito pela Câmara)"
```

---

### Task A2: Remove the lembretes cron job's email dispatch

**Files:**
- Modify: `src/app/api/jobs/lembretes/route.ts`

The job's purpose (flagging cotações silenciosas approaching `dataLimite`) still has value as an internal registry signal, but it must stop calling Resend. Since `lembreteEnviado` only makes sense in the context of having actually sent something, and there is no replacement notification channel in this version, the route is reduced to a read-only report endpoint and the email/flag-mutation parts are removed.

- [ ] **Step 1: Replace the whole file**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Vercel Cron Job — chamado a cada hora via vercel.json
// Localmente: GET /api/jobs/lembretes
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  const tresDiasAFrente = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const cotacoesPendentes = await db.cotacao.findMany({
    where: {
      status: "silenciosa",
      dataLimite: { gt: now, lte: tresDiasAFrente },
    },
    include: {
      fornecedor: { select: { razaoSocial: true } },
      processo: { select: { numero: true, objeto: true } },
    },
  });

  return NextResponse.json({
    pendentes: cotacoesPendentes.map((c) => ({
      cotacaoId: c.id,
      fornecedor: c.fornecedor.razaoSocial,
      processoNumero: c.processo.numero,
      dataLimite: c.dataLimite.toISOString(),
    })),
    executadoEm: now.toISOString(),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors related to `route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/jobs/lembretes/route.ts"
git commit -m "fix: job de lembretes passa a ser apenas relatorio, sem envio de e-mail"
```

---

### Task A3: Delete the `src/lib/email/` module and remove `resend` dependency

**Files:**
- Delete: `src/lib/email/index.ts`, `src/lib/email/client.ts`, `src/lib/email/templates/cotacao.ts`, `src/lib/email/templates/lembrete.ts`, `src/lib/email/.gitkeep`
- Modify: `package.json`

- [ ] **Step 1: Confirm nothing else imports `@/lib/email`**

Run: `grep -r "lib/email" src --include="*.ts" --include="*.tsx" -l`
Expected: no output (both call sites were already cleaned in Task A1/A2).

- [ ] **Step 2: Delete the folder**

```bash
git rm -r src/lib/email
```

- [ ] **Step 3: Remove the `resend` package**

Run: `pnpm remove resend`

- [ ] **Step 4: Type-check and run tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: no errors, all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove modulo de e-mail (resend) — disparo de cotacao é externo"
```

---

## Part B — Data model

### Task B1: Add `ResultadoSimilaridade` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the enum and model**

Add after the `TipoFonte` enum (around line 33):

```prisma
enum TipoCandidatoSimilaridade {
  contratacao_publica
  painel_precos
}
```

Add after the `Item` model (around line 144), and add the relation field inside `Item`:

In `Item` model, add this line inside the model body (after `seriePrecos SeriePreco[]`):

```prisma
  resultadosSimilaridade ResultadoSimilaridade[]
```

New model:

```prisma
model ResultadoSimilaridade {
  id                    String                    @id @default(cuid())
  itemId                String
  tipoCandidato         TipoCandidatoSimilaridade
  fonteDescricao        String
  fonteOrgaoOuId        String
  fonteUrl              String?
  valorUnitario         Decimal                   @db.Decimal(12, 2)
  dataReferencia        DateTime
  scoreFinal            Decimal                   @db.Decimal(5, 2)
  scoreDescricao        Decimal                   @db.Decimal(5, 2)
  scoreEspecificacao    Decimal                   @db.Decimal(5, 2)
  scoreUnidadeQuantidade Decimal                  @db.Decimal(5, 2)
  adaptado              Boolean                   @default(false)
  justificativa         String
  promovidoParaFonte    Boolean                   @default(false)
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@map("resultados_similaridade")
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm prisma migrate dev --name add_resultado_similaridade`
Expected: migration file created under `prisma/migrations/`, applied to the dev database without errors.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm prisma generate`
Expected: completes without errors.

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adiciona modelo ResultadoSimilaridade"
```

---

## Part C — AI extraction + ranking layer

### Task C1: Install the Gemini SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `pnpm add @google/genai`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: adiciona SDK do Gemini para extracao de TR e ranking de similaridade"
```

---

### Task C2: Define the `src/lib/ia/` types and the provider interface

**Files:**
- Create: `src/lib/ia/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface ItemExtraidoTR {
  descricao: string;
  especificacaoTecnica: string;
  unidade: string;
  quantidade: number;
}

export interface CandidatoSimilaridade {
  tipoCandidato: "contratacao_publica" | "painel_precos";
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  fonteUrl?: string;
  valorUnitario: number;
  dataReferencia: Date;
  unidade: string;
  quantidade: number;
}

export interface ScoreSimilaridade {
  candidato: CandidatoSimilaridade;
  scoreFinal: number;
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
  adaptado: boolean;
  justificativa: string;
}

export interface ProvedorIA {
  extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]>;
  rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]>;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ia/types.ts
git commit -m "feat: define contrato ProvedorIA para extracao e ranking de similaridade"
```

---

### Task C3: Implement the recency cutoff filter (pure function, TDD)

This is the binary 365-day cutoff from §4 of the spec, reusing the existing `JANELAS_VALIDADE` window already enforced in `in65Rules.ts` for `contratacao_publica`. Rather than reimporting an unexported constant, this wraps `validarValidadeFontes` so the 365-day rule lives in exactly one place.

**Files:**
- Create: `src/lib/similaridade/filtroRecencia.ts`
- Test: `src/lib/similaridade/__tests__/filtroRecencia.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { filtrarPorRecencia } from "../filtroRecencia";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

function candidato(diasAtras: number): CandidatoSimilaridade {
  const dataReferencia = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Contrato teste",
    fonteOrgaoOuId: "ORG-1",
    valorUnitario: 100,
    dataReferencia,
    unidade: "unidade",
    quantidade: 10,
  };
}

describe("filtrarPorRecencia", () => {
  it("mantém candidatos dentro de 365 dias", () => {
    const resultado = filtrarPorRecencia([candidato(100)]);
    expect(resultado).toHaveLength(1);
  });

  it("exclui candidatos com mais de 365 dias", () => {
    const resultado = filtrarPorRecencia([candidato(400)]);
    expect(resultado).toHaveLength(0);
  });

  it("mantém exatamente no limite de 365 dias", () => {
    const resultado = filtrarPorRecencia([candidato(365)]);
    expect(resultado).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/similaridade/__tests__/filtroRecencia.test.ts`
Expected: FAIL — `Cannot find module '../filtroRecencia'`.

- [ ] **Step 3: Implement**

```typescript
import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

export function filtrarPorRecencia(
  candidatos: CandidatoSimilaridade[],
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  const fontes = candidatos.map((c, idx) => ({
    fonteId: String(idx),
    tipo: c.tipoCandidato === "contratacao_publica" ? "contratacao_publica" : "site_eletronico",
    dataReferencia: c.dataReferencia,
  })) as Array<{
    fonteId: string;
    tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto";
    dataReferencia: Date;
  }>;

  const { value } = validarValidadeFontes(fontes, new Date());
  const validos = new Set(value.filter((v) => v.valida).map((v) => v.fonteId));

  return candidatos.filter((_, idx) => validos.has(String(idx)));
}
```

`painel_precos` candidates are mapped to the `site_eletronico` validity window (90 days) only as a type bridge — in practice `filtrarPorRecencia` is called once per `tipoCandidato` group from the orchestrator (Task E2), so each call only ever contains one type and gets its own correct window when extended later. For v1, both PNCP and Painel de Preços results are treated under the `contratacao_publica` 365-day window since both represent public contract data. Adjust the mapping below before Step 3 final version:

```typescript
    tipo: "contratacao_publica" as const,
```

Replace the `tipo:` line in the `fontes` map with the literal `"contratacao_publica"` for all candidates (both PNCP and Painel de Preços are public-contract-equivalent sources for the 365-day window):

```typescript
import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

export function filtrarPorRecencia(
  candidatos: CandidatoSimilaridade[],
): CandidatoSimilaridade[] {
  if (candidatos.length === 0) return [];

  const fontes = candidatos.map((c, idx) => ({
    fonteId: String(idx),
    tipo: "contratacao_publica" as const,
    dataReferencia: c.dataReferencia,
  }));

  const { value } = validarValidadeFontes(fontes, new Date());
  const validos = new Set(value.filter((v) => v.valida).map((v) => v.fonteId));

  return candidatos.filter((_, idx) => validos.has(String(idx)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/similaridade/__tests__/filtroRecencia.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/similaridade/filtroRecencia.ts src/lib/similaridade/__tests__/filtroRecencia.test.ts
git commit -m "feat: filtro de corte por recencia (365 dias) reaproveitando in65Rules"
```

---

### Task C4: Implement the weighted score aggregation (pure function, TDD)

This is the 40/35/25 weighting from §4 — given the 3 individual parameter percentages (already produced by the AI per item, see Task C6), compute the final score. Keeping this as a pure function makes the weights testable independent of any AI call.

**Files:**
- Create: `src/lib/similaridade/scoreFinal.ts`
- Test: `src/lib/similaridade/__tests__/scoreFinal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { calcularScoreFinal, PESOS_SIMILARIDADE } from "../scoreFinal";

describe("calcularScoreFinal", () => {
  it("aplica os pesos 40/35/25", () => {
    const score = calcularScoreFinal({
      scoreDescricao: 100,
      scoreEspecificacao: 100,
      scoreUnidadeQuantidade: 100,
    });
    expect(score).toBe(100);
  });

  it("calcula corretamente com valores mistos", () => {
    const score = calcularScoreFinal({
      scoreDescricao: 80,
      scoreEspecificacao: 60,
      scoreUnidadeQuantidade: 40,
    });
    // 80*0.4 + 60*0.35 + 40*0.25 = 32 + 21 + 10 = 63
    expect(score).toBe(63);
  });

  it("expõe os pesos usados", () => {
    expect(PESOS_SIMILARIDADE).toEqual({
      descricao: 0.4,
      especificacao: 0.35,
      unidadeQuantidade: 0.25,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/similaridade/__tests__/scoreFinal.test.ts`
Expected: FAIL — `Cannot find module '../scoreFinal'`.

- [ ] **Step 3: Implement**

```typescript
export const PESOS_SIMILARIDADE = {
  descricao: 0.4,
  especificacao: 0.35,
  unidadeQuantidade: 0.25,
} as const;

export function calcularScoreFinal(params: {
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
}): number {
  const raw =
    params.scoreDescricao * PESOS_SIMILARIDADE.descricao +
    params.scoreEspecificacao * PESOS_SIMILARIDADE.especificacao +
    params.scoreUnidadeQuantidade * PESOS_SIMILARIDADE.unidadeQuantidade;
  return Math.round(raw * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/similaridade/__tests__/scoreFinal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/similaridade/scoreFinal.ts src/lib/similaridade/__tests__/scoreFinal.test.ts
git commit -m "feat: calculo do score final de similaridade com pesos 40/35/25"
```

---

### Task C5: Implement the Gemini client wrapper

**Files:**
- Create: `src/lib/ia/geminiClient.ts`

- [ ] **Step 1: Write the client**

```typescript
import "server-only";
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const GEMINI_MODEL = "gemini-flash-latest";
```

Lazy init mirrors the existing pattern already used for Resend (per commit `5e64253`), so the build does not fail when the API key is absent in CI/build environments.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ia/geminiClient.ts
git commit -m "feat: client lazy-init do Gemini Flash"
```

---

### Task C6: Implement `extrairEspecificacaoTR` and `rankearSimilaridade`

**Files:**
- Create: `src/lib/ia/geminiProvider.ts`
- Create: `src/lib/ia/index.ts`

- [ ] **Step 1: Write the provider**

```typescript
import "server-only";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import type {
  ItemExtraidoTR,
  CandidatoSimilaridade,
  ScoreSimilaridade,
  ProvedorIA,
} from "./types";

const PROMPT_EXTRACAO = `Você é um analista de compras públicas. Leia o Termo de Referência (TR) em anexo
e extraia cada item a ser cotado. Para cada item, retorne um objeto JSON com:
- "descricao": descrição normalizada e objetiva do item
- "especificacaoTecnica": características técnicas detalhadas (material, dimensão, voltagem, etc.)
- "unidade": unidade de medida (ex.: "unidade", "caixa", "metro linear", "pacote")
- "quantidade": quantidade numérica

Responda APENAS com um array JSON de objetos, sem texto adicional, sem markdown.`;

function montarPromptRanking(itemTR: ItemExtraidoTR, candidatos: CandidatoSimilaridade[]): string {
  return `Você é um analista de compras públicas avaliando se contratos públicos são similares a um item de
Termo de Referência (TR), para servir de justificativa formal de preço público (IN SEGES/ME 65/2021).

ITEM DO TR:
${JSON.stringify(itemTR)}

CANDIDATOS A CONTRATO PÚBLICO (avalie cada um independentemente):
${JSON.stringify(candidatos)}

Para CADA candidato, avalie 3 parâmetros de 0 a 100:
1. "scoreDescricao": quão parecida é a descrição do objeto do candidato com a do item do TR (semântica, não palavra-chave exata).
2. "scoreEspecificacao": quão bem as características técnicas do candidato batem com a especificação técnica do TR.
3. "scoreUnidadeQuantidade": se a unidade de medida e a ordem de grandeza da quantidade são compatíveis.

Se o candidato vier desmembrado (ex.: TR pede "1 conjunto" e o candidato é só uma parte, como "mesa"), ou a
unidade não bate diretamente e precisar de conversão (ex.: metro linear vs. unidade), marque "adaptado": true
e reduza "scoreUnidadeQuantidade" proporcionalmente à incerteza da conversão. Caso contrário "adaptado": false.

Preencha "justificativa" com 1-2 frases explicando o principal motivo do score, citando o parâmetro mais
relevante e sua porcentagem — isso será usado como justificativa formal num processo administrativo.

Responda APENAS com um array JSON, na mesma ordem dos candidatos, sem texto adicional, sem markdown, no formato:
[{ "scoreDescricao": number, "scoreEspecificacao": number, "scoreUnidadeQuantidade": number, "adaptado": boolean, "justificativa": string }]`;
}

function parseJsonResponse<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(limpo) as T;
}

export class GeminiProvider implements ProvedorIA {
  async extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]> {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT_EXTRACAO },
            { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
          ],
        },
      ],
    });

    const texto = response.text ?? "[]";
    return parseJsonResponse<ItemExtraidoTR[]>(texto);
  }

  async rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]> {
    if (candidatos.length === 0) return [];

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: montarPromptRanking(itemTR, candidatos) }] }],
    });

    const texto = response.text ?? "[]";
    type AvaliacaoBruta = {
      scoreDescricao: number;
      scoreEspecificacao: number;
      scoreUnidadeQuantidade: number;
      adaptado: boolean;
      justificativa: string;
    };
    const avaliacoes = parseJsonResponse<AvaliacaoBruta[]>(texto);

    return candidatos.map((candidato, idx) => {
      const avaliacao = avaliacoes[idx];
      if (!avaliacao) {
        throw new Error(`Resposta da IA não cobre o candidato ${idx}.`);
      }
      return {
        candidato,
        scoreFinal: 0, // calculado pelo orquestrador via calcularScoreFinal
        scoreDescricao: avaliacao.scoreDescricao,
        scoreEspecificacao: avaliacao.scoreEspecificacao,
        scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
        adaptado: avaliacao.adaptado,
        justificativa: avaliacao.justificativa,
      };
    });
  }
}
```

- [ ] **Step 2: Write the barrel export**

```typescript
export type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";
export { GeminiProvider } from "./geminiProvider";

import { GeminiProvider } from "./geminiProvider";
import type { ProvedorIA } from "./types";

export function getProvedorIA(): ProvedorIA {
  return new GeminiProvider();
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ia/geminiProvider.ts src/lib/ia/index.ts
git commit -m "feat: implementa extracao de TR e ranking de similaridade via Gemini Flash"
```

---

## Part D — Public contract integrations

### Task D1: PNCP client

**Files:**
- Create: `src/lib/integracoes/pncp.ts`
- Test: `src/lib/integracoes/__tests__/pncp.test.ts`

- [ ] **Step 1: Write the failing test (response mapping, not live HTTP)**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarContratosPNCP } from "../pncp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buscarContratosPNCP", () => {
  it("mapeia a resposta da API para CandidatoSimilaridade", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            numeroControlePNCP: "123",
            orgaoEntidade: { razaoSocial: "Prefeitura Teste" },
            objetoCompra: "Cadeira de escritório",
            valorUnitarioEstimado: 250.5,
            dataAtualizacao: "2026-01-10T00:00:00Z",
            unidadeMedida: "unidade",
            quantidade: 50,
          },
        ],
      }),
    } as Response);

    const resultado = await buscarContratosPNCP("cadeira de escritório");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira de escritório",
      fonteOrgaoOuId: "Prefeitura Teste",
      valorUnitario: 250.5,
      unidade: "unidade",
      quantidade: 50,
    });
  });

  it("retorna lista vazia quando a API falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    const resultado = await buscarContratosPNCP("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/integracoes/__tests__/pncp.test.ts`
Expected: FAIL — `Cannot find module '../pncp'`.

- [ ] **Step 3: Implement**

```typescript
import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratos";

interface PNCPContratoResponse {
  numeroControlePNCP: string;
  orgaoEntidade: { razaoSocial: string };
  objetoCompra: string;
  valorUnitarioEstimado: number;
  dataAtualizacao: string;
  unidadeMedida: string;
  quantidade: number;
}

export async function buscarContratosPNCP(termo: string): Promise<CandidatoSimilaridade[]> {
  try {
    const url = `${PNCP_BASE_URL}?objetoCompra=${encodeURIComponent(termo)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];

    const body = (await res.json()) as { data: PNCPContratoResponse[] };

    return (body.data ?? []).map((c) => ({
      tipoCandidato: "contratacao_publica" as const,
      fonteDescricao: c.objetoCompra,
      fonteOrgaoOuId: c.orgaoEntidade.razaoSocial,
      fonteUrl: `https://pncp.gov.br/app/contratos/${c.numeroControlePNCP}`,
      valorUnitario: c.valorUnitarioEstimado,
      dataReferencia: new Date(c.dataAtualizacao),
      unidade: c.unidadeMedida,
      quantidade: c.quantidade,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/integracoes/__tests__/pncp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/integracoes/pncp.ts src/lib/integracoes/__tests__/pncp.test.ts
git commit -m "feat: client de busca de contratos no PNCP"
```

---

### Task D2: Painel de Preços client

**Files:**
- Create: `src/lib/integracoes/painelPrecos.ts`
- Test: `src/lib/integracoes/__tests__/painelPrecos.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { buscarPrecosPainelPrecos } from "../painelPrecos";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buscarPrecosPainelPrecos", () => {
  it("mapeia a resposta da API para CandidatoSimilaridade", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: "abc",
          orgao: "Ministério Teste",
          descricaoItem: "Caneta esferográfica azul",
          precoUnitario: 1.2,
          dataCompra: "2026-02-01",
          unidadeFornecimento: "caixa",
          quantidade: 100,
        },
      ]),
    } as Response);

    const resultado = await buscarPrecosPainelPrecos("caneta esferográfica");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      tipoCandidato: "painel_precos",
      fonteDescricao: "Caneta esferográfica azul",
      fonteOrgaoOuId: "Ministério Teste",
      valorUnitario: 1.2,
      unidade: "caixa",
      quantidade: 100,
    });
  });

  it("retorna lista vazia quando a API falha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    const resultado = await buscarPrecosPainelPrecos("qualquer coisa");
    expect(resultado).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/integracoes/__tests__/painelPrecos.test.ts`
Expected: FAIL — `Cannot find module '../painelPrecos'`.

- [ ] **Step 3: Implement**

```typescript
import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

const PAINEL_PRECOS_BASE_URL = "https://api.paineldeprecos.economia.gov.br/v1/precos";

interface PainelPrecosResponse {
  id: string;
  orgao: string;
  descricaoItem: string;
  precoUnitario: number;
  dataCompra: string;
  unidadeFornecimento: string;
  quantidade: number;
}

export async function buscarPrecosPainelPrecos(termo: string): Promise<CandidatoSimilaridade[]> {
  try {
    const url = `${PAINEL_PRECOS_BASE_URL}?descricao=${encodeURIComponent(termo)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];

    const body = (await res.json()) as PainelPrecosResponse[];

    return body.map((p) => ({
      tipoCandidato: "painel_precos" as const,
      fonteDescricao: p.descricaoItem,
      fonteOrgaoOuId: p.orgao,
      fonteUrl: undefined,
      valorUnitario: p.precoUnitario,
      dataReferencia: new Date(p.dataCompra),
      unidade: p.unidadeFornecimento,
      quantidade: p.quantidade,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/integracoes/__tests__/painelPrecos.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/integracoes/painelPrecos.ts src/lib/integracoes/__tests__/painelPrecos.test.ts
git commit -m "feat: client de busca de precos no Painel de Precos"
```

---

## Part E — Pipeline orchestration

### Task E1: Implement `rankearCandidatos` (combines filter + AI ranking + final score)

**Files:**
- Create: `src/lib/similaridade/rankearCandidatos.ts`
- Test: `src/lib/similaridade/__tests__/rankearCandidatos.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { rankearCandidatos } from "../rankearCandidatos";
import type { ProvedorIA, ItemExtraidoTR, CandidatoSimilaridade } from "@/lib/ia/types";

function candidato(diasAtras: number, valor = 100): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao: "Cadeira",
    fonteOrgaoOuId: "Org",
    valorUnitario: valor,
    dataReferencia: new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
    unidade: "unidade",
    quantidade: 10,
  };
}

const itemTR: ItemExtraidoTR = {
  descricao: "Cadeira de escritório",
  especificacaoTecnica: "Giratória, braços ajustáveis",
  unidade: "unidade",
  quantidade: 10,
};

describe("rankearCandidatos", () => {
  it("exclui candidatos fora da janela de recencia antes de chamar a IA", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10),
          scoreFinal: 0,
          scoreDescricao: 90,
          scoreEspecificacao: 80,
          scoreUnidadeQuantidade: 100,
          adaptado: false,
          justificativa: "Muito similar",
        },
      ]),
    };

    const resultado = await rankearCandidatos(
      itemTR,
      [candidato(10), candidato(400)],
      provedor,
    );

    expect(provedor.rankearSimilaridade).toHaveBeenCalledWith(itemTR, [candidato(10)]);
    expect(resultado).toHaveLength(1);
  });

  it("calcula o score final com os pesos 40/35/25", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10),
          scoreFinal: 0,
          scoreDescricao: 80,
          scoreEspecificacao: 60,
          scoreUnidadeQuantidade: 40,
          adaptado: false,
          justificativa: "Parcialmente similar",
        },
      ]),
    };

    const resultado = await rankearCandidatos(itemTR, [candidato(10)], provedor);

    expect(resultado[0]!.scoreFinal).toBe(63);
  });

  it("ordena os resultados por score final decrescente", async () => {
    const provedor: ProvedorIA = {
      extrairEspecificacaoTR: vi.fn(),
      rankearSimilaridade: vi.fn().mockResolvedValue([
        {
          candidato: candidato(10, 100),
          scoreFinal: 0,
          scoreDescricao: 50,
          scoreEspecificacao: 50,
          scoreUnidadeQuantidade: 50,
          adaptado: false,
          justificativa: "Médio",
        },
        {
          candidato: candidato(20, 200),
          scoreFinal: 0,
          scoreDescricao: 100,
          scoreEspecificacao: 100,
          scoreUnidadeQuantidade: 100,
          adaptado: false,
          justificativa: "Idêntico",
        },
      ]),
    };

    const resultado = await rankearCandidatos(
      itemTR,
      [candidato(10, 100), candidato(20, 200)],
      provedor,
    );

    expect(resultado[0]!.scoreFinal).toBe(100);
    expect(resultado[1]!.scoreFinal).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/similaridade/__tests__/rankearCandidatos.test.ts`
Expected: FAIL — `Cannot find module '../rankearCandidatos'`.

- [ ] **Step 3: Implement**

```typescript
import { filtrarPorRecencia } from "./filtroRecencia";
import { calcularScoreFinal } from "./scoreFinal";
import type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "@/lib/ia/types";

export async function rankearCandidatos(
  itemTR: ItemExtraidoTR,
  candidatos: CandidatoSimilaridade[],
  provedor: ProvedorIA,
): Promise<ScoreSimilaridade[]> {
  const candidatosValidos = filtrarPorRecencia(candidatos);
  if (candidatosValidos.length === 0) return [];

  const avaliacoes = await provedor.rankearSimilaridade(itemTR, candidatosValidos);

  const comScoreFinal = avaliacoes.map((avaliacao) => ({
    ...avaliacao,
    scoreFinal: calcularScoreFinal({
      scoreDescricao: avaliacao.scoreDescricao,
      scoreEspecificacao: avaliacao.scoreEspecificacao,
      scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
    }),
  }));

  return comScoreFinal.sort((a, b) => b.scoreFinal - a.scoreFinal);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/similaridade/__tests__/rankearCandidatos.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/similaridade/rankearCandidatos.ts src/lib/similaridade/__tests__/rankearCandidatos.test.ts
git commit -m "feat: orquestra filtro de recencia + ranking de IA + score final"
```

---

### Task E2: Implement `buscarCandidatosPublicos` (fan-out to PNCP + Painel de Preços)

**Files:**
- Create: `src/lib/similaridade/buscarCandidatosPublicos.ts`
- Test: `src/lib/similaridade/__tests__/buscarCandidatosPublicos.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { buscarCandidatosPublicos } from "../buscarCandidatosPublicos";
import * as pncp from "@/lib/integracoes/pncp";
import * as painelPrecos from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

describe("buscarCandidatosPublicos", () => {
  it("combina resultados do PNCP e do Painel de Precos", async () => {
    const candidatoPncp: CandidatoSimilaridade = {
      tipoCandidato: "contratacao_publica",
      fonteDescricao: "Cadeira",
      fonteOrgaoOuId: "Org A",
      valorUnitario: 100,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 10,
    };
    const candidatoPainel: CandidatoSimilaridade = {
      tipoCandidato: "painel_precos",
      fonteDescricao: "Cadeira",
      fonteOrgaoOuId: "Org B",
      valorUnitario: 110,
      dataReferencia: new Date(),
      unidade: "unidade",
      quantidade: 10,
    };

    vi.spyOn(pncp, "buscarContratosPNCP").mockResolvedValue([candidatoPncp]);
    vi.spyOn(painelPrecos, "buscarPrecosPainelPrecos").mockResolvedValue([candidatoPainel]);

    const resultado = await buscarCandidatosPublicos("cadeira");

    expect(resultado).toEqual([candidatoPncp, candidatoPainel]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/similaridade/__tests__/buscarCandidatosPublicos.test.ts`
Expected: FAIL — `Cannot find module '../buscarCandidatosPublicos'`.

- [ ] **Step 3: Implement**

```typescript
import { buscarContratosPNCP } from "@/lib/integracoes/pncp";
import { buscarPrecosPainelPrecos } from "@/lib/integracoes/painelPrecos";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

export async function buscarCandidatosPublicos(termo: string): Promise<CandidatoSimilaridade[]> {
  const [contratos, precos] = await Promise.all([
    buscarContratosPNCP(termo),
    buscarPrecosPainelPrecos(termo),
  ]);
  return [...contratos, ...precos];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/similaridade/__tests__/buscarCandidatosPublicos.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/similaridade/buscarCandidatosPublicos.ts src/lib/similaridade/__tests__/buscarCandidatosPublicos.test.ts
git commit -m "feat: busca paralela de candidatos no PNCP e Painel de Precos"
```

---

## Part F — Fornecedor geographic discovery

### Task F1: Implement the geographic layering helper (pure function, TDD)

**Files:**
- Create: `src/lib/domain/camadaGeografica.ts`
- Test: `src/lib/domain/__tests__/camadaGeografica.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { CAMADAS_GEOGRAFICAS, proximaCamada } from "../camadaGeografica";

describe("camadaGeografica", () => {
  it("define as 5 camadas na ordem correta", () => {
    expect(CAMADAS_GEOGRAFICAS.map((c) => c.nome)).toEqual([
      "baixada_santista",
      "estado_sp",
      "sudeste",
      "sul",
      "centro_oeste",
    ]);
  });

  it("baixada_santista contém Santos e cidades vizinhas", () => {
    const baixada = CAMADAS_GEOGRAFICAS[0]!;
    expect(baixada.cidades).toContain("Santos");
    expect(baixada.cidades).toContain("São Vicente");
  });

  it("retorna a proxima camada", () => {
    expect(proximaCamada("baixada_santista")).toBe("estado_sp");
    expect(proximaCamada("sul")).toBe("centro_oeste");
  });

  it("retorna null após a ultima camada", () => {
    expect(proximaCamada("centro_oeste")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/domain/__tests__/camadaGeografica.test.ts`
Expected: FAIL — `Cannot find module '../camadaGeografica'`.

- [ ] **Step 3: Implement**

```typescript
export type NomeCamadaGeografica =
  | "baixada_santista"
  | "estado_sp"
  | "sudeste"
  | "sul"
  | "centro_oeste";

export interface CamadaGeografica {
  nome: NomeCamadaGeografica;
  cidades?: string[];
  estados?: string[];
}

export const CAMADAS_GEOGRAFICAS: CamadaGeografica[] = [
  {
    nome: "baixada_santista",
    cidades: ["Santos", "São Vicente", "Praia Grande", "Cubatão", "Guarujá", "Bertioga", "Mongaguá", "Itanhaém", "Peruíbe"],
  },
  { nome: "estado_sp", estados: ["SP"] },
  { nome: "sudeste", estados: ["SP", "RJ", "MG", "ES"] },
  { nome: "sul", estados: ["PR", "SC", "RS"] },
  { nome: "centro_oeste", estados: ["MT", "MS", "GO", "DF"] },
];

export function proximaCamada(atual: NomeCamadaGeografica): NomeCamadaGeografica | null {
  const idx = CAMADAS_GEOGRAFICAS.findIndex((c) => c.nome === atual);
  const proxima = CAMADAS_GEOGRAFICAS[idx + 1];
  return proxima ? proxima.nome : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/domain/__tests__/camadaGeografica.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/camadaGeografica.ts src/lib/domain/__tests__/camadaGeografica.test.ts
git commit -m "feat: define camadas geograficas para descoberta de fornecedores"
```

---

### Task F2: Implement `buscarFornecedorPorCamada` (queries existing base)

**Files:**
- Create: `src/lib/domain/buscarFornecedorPorCamada.ts`
- Test: `src/lib/domain/__tests__/buscarFornecedorPorCamada.test.ts`

This is a pure function over an in-memory list (no DB), so the server action (Task F3) can call it against data already fetched from Prisma, keeping the domain layer testable without a database.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buscarFornecedorPorCamada } from "../buscarFornecedorPorCamada";

interface FornecedorTeste {
  id: string;
  cidade: string;
  estado: string;
  categoria: string[];
}

const fornecedores: FornecedorTeste[] = [
  { id: "1", cidade: "Santos", estado: "SP", categoria: ["mobiliario"] },
  { id: "2", cidade: "Campinas", estado: "SP", categoria: ["mobiliario"] },
  { id: "3", cidade: "Curitiba", estado: "PR", categoria: ["mobiliario"] },
  { id: "4", cidade: "Santos", estado: "SP", categoria: ["informatica"] },
];

describe("buscarFornecedorPorCamada", () => {
  it("encontra fornecedor na Baixada Santista quando existe", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "mobiliario");
    expect(resultado.camadaEncontrada).toBe("baixada_santista");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["1"]);
  });

  it("expande para o Estado de SP quando a Baixada Santista não tem candidato", () => {
    const semBaixada = fornecedores.filter((f) => f.id !== "1");
    const resultado = buscarFornecedorPorCamada(semBaixada, "mobiliario");
    expect(resultado.camadaEncontrada).toBe("estado_sp");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["2"]);
  });

  it("retorna null quando nenhuma camada tem candidato qualificado", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "alimenticio");
    expect(resultado.camadaEncontrada).toBeNull();
    expect(resultado.fornecedores).toEqual([]);
  });

  it("filtra por categoria/nicho", () => {
    const resultado = buscarFornecedorPorCamada(fornecedores, "informatica");
    expect(resultado.fornecedores.map((f) => f.id)).toEqual(["4"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/domain/__tests__/buscarFornecedorPorCamada.test.ts`
Expected: FAIL — `Cannot find module '../buscarFornecedorPorCamada'`.

- [ ] **Step 3: Implement**

```typescript
import { CAMADAS_GEOGRAFICAS, type NomeCamadaGeografica, type CamadaGeografica } from "./camadaGeografica";

interface FornecedorBase {
  cidade: string;
  estado: string;
  categoria: string[];
}

function pertenceACamada(fornecedor: FornecedorBase, camada: CamadaGeografica): boolean {
  if (camada.cidades) return camada.cidades.includes(fornecedor.cidade);
  if (camada.estados) return camada.estados.includes(fornecedor.estado);
  return false;
}

export function buscarFornecedorPorCamada<T extends FornecedorBase>(
  fornecedores: T[],
  nicho: string,
): { camadaEncontrada: NomeCamadaGeografica | null; fornecedores: T[] } {
  const candidatosNicho = fornecedores.filter((f) => f.categoria.includes(nicho));

  for (const camada of CAMADAS_GEOGRAFICAS) {
    const naCamada = candidatosNicho.filter((f) => pertenceACamada(f, camada));
    if (naCamada.length > 0) {
      return { camadaEncontrada: camada.nome, fornecedores: naCamada };
    }
  }

  return { camadaEncontrada: null, fornecedores: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/domain/__tests__/buscarFornecedorPorCamada.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/buscarFornecedorPorCamada.ts src/lib/domain/__tests__/buscarFornecedorPorCamada.test.ts
git commit -m "feat: busca de fornecedores expandindo por camada geografica"
```

---

### Task F3: Extend `src/lib/actions/fornecedores.ts` with `buscarOuQualificarFornecedor`

**Files:**
- Modify: `src/lib/actions/fornecedores.ts`

When no qualified supplier exists in any geographic layer, this returns an explicit "not found in base" result rather than silently calling out to the internet — actual web-discovery of brand-new suppliers requires the AI provider's web-search capability, which is out of scope for this task and is flagged as a TODO surfaced to the UI (Task G layer), not hidden.

- [ ] **Step 1: Add the new export**

Append to `src/lib/actions/fornecedores.ts`:

```typescript
import { buscarFornecedorPorCamada } from "@/lib/domain/buscarFornecedorPorCamada";

export interface ResultadoBuscaFornecedor {
  camadaEncontrada: string | null;
  fornecedores: Array<{
    id: string;
    razaoSocial: string;
    cidade: string;
    estado: string;
    score: number;
  }>;
  precisaBuscarNovo: boolean;
}

export async function buscarOuQualificarFornecedor(
  nicho: string,
): Promise<ResultadoBuscaFornecedor> {
  await requireAuth();

  const candidatos = await db.fornecedor.findMany({
    where: { categoria: { has: nicho }, status: "ativo" },
    select: { id: true, razaoSocial: true, cidade: true, estado: true, categoria: true, score: true },
  });

  const { camadaEncontrada, fornecedores } = buscarFornecedorPorCamada(candidatos, nicho);

  return {
    camadaEncontrada,
    fornecedores: fornecedores.map((f) => ({
      id: f.id,
      razaoSocial: f.razaoSocial,
      cidade: f.cidade,
      estado: f.estado,
      score: f.score,
    })),
    precisaBuscarNovo: camadaEncontrada === null,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/fornecedores.ts
git commit -m "feat: busca fornecedores qualificados por nicho com expansao geografica"
```

---

## Part G — Server action orchestrating the full pipeline

### Task G1: Implement `processarPesquisaSimilaridade`

**Files:**
- Create: `src/lib/actions/pesquisaSimilaridade.ts`

This action receives an already-parsed spreadsheet (`PlanilhaParseResult`, reusing `parsePlanilha`) and the raw TR PDF buffer, runs the full pipeline per item, persists `ResultadoSimilaridade` rows, and returns a summary. It does not call `db.processo.upsert`/recreate `Item` rows itself — that remains `sincronizarPlanilha`'s job; this action assumes the process and its `Item` rows already exist (the UI calls `sincronizarPlanilha` first, then this action, as described in spec §3 step 1-2).

- [ ] **Step 1: Implement**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { getProvedorIA } from "@/lib/ia";
import { rankearCandidatos } from "@/lib/similaridade/rankearCandidatos";
import { buscarCandidatosPublicos } from "@/lib/similaridade/buscarCandidatosPublicos";
import type { ItemExtraidoTR } from "@/lib/ia/types";
import type { ActionResult } from "./processos";

export interface ItemProcessadoSimilaridade {
  itemId: string;
  descricao: string;
  totalCandidatos: number;
}

export interface ResultadoPesquisaSimilaridade {
  itensProcessados: ItemProcessadoSimilaridade[];
}

function casarItemComExtrato(
  descricaoItem: string,
  extratos: ItemExtraidoTR[],
): ItemExtraidoTR | null {
  const normalizado = (s: string) => s.trim().toLowerCase();
  const exato = extratos.find((e) => normalizado(e.descricao) === normalizado(descricaoItem));
  if (exato) return exato;

  const parcial = extratos.find(
    (e) =>
      normalizado(descricaoItem).includes(normalizado(e.descricao)) ||
      normalizado(e.descricao).includes(normalizado(descricaoItem)),
  );
  return parcial ?? null;
}

export async function processarPesquisaSimilaridade(
  processoId: string,
  trPdfBuffer: Buffer,
): Promise<ActionResult<ResultadoPesquisaSimilaridade>> {
  const user = await requireAuth();

  const itens = await db.item.findMany({ where: { processoId } });
  if (itens.length === 0) {
    return { error: "Processo sem itens. Sincronize a planilha antes de buscar similaridade." };
  }

  const provedor = getProvedorIA();

  let extratos: ItemExtraidoTR[];
  try {
    extratos = await provedor.extrairEspecificacaoTR(trPdfBuffer);
  } catch (err) {
    return {
      error: err instanceof Error ? `Falha ao processar o TR: ${err.message}` : "Falha ao processar o TR.",
    };
  }

  const itensProcessados: ItemProcessadoSimilaridade[] = [];

  for (const item of itens) {
    const itemTR = casarItemComExtrato(item.descricao, extratos) ?? {
      descricao: item.descricao,
      especificacaoTecnica: item.caracteristicasTecnicas ?? "",
      unidade: item.unidade,
      quantidade: item.quantidade,
    };

    const candidatos = await buscarCandidatosPublicos(itemTR.descricao);
    const ranqueados = await rankearCandidatos(itemTR, candidatos, provedor);

    await db.resultadoSimilaridade.deleteMany({ where: { itemId: item.id } });

    if (ranqueados.length > 0) {
      await db.resultadoSimilaridade.createMany({
        data: ranqueados.map((r) => ({
          itemId: item.id,
          tipoCandidato: r.candidato.tipoCandidato,
          fonteDescricao: r.candidato.fonteDescricao,
          fonteOrgaoOuId: r.candidato.fonteOrgaoOuId,
          fonteUrl: r.candidato.fonteUrl ?? null,
          valorUnitario: r.candidato.valorUnitario,
          dataReferencia: r.candidato.dataReferencia,
          scoreFinal: r.scoreFinal,
          scoreDescricao: r.scoreDescricao,
          scoreEspecificacao: r.scoreEspecificacao,
          scoreUnidadeQuantidade: r.scoreUnidadeQuantidade,
          adaptado: r.adaptado,
          justificativa: r.justificativa,
        })),
      });
    }

    itensProcessados.push({
      itemId: item.id,
      descricao: item.descricao,
      totalCandidatos: ranqueados.length,
    });
  }

  await registrarAuditoria({
    userId: user.id,
    processoId,
    acao: "processar_pesquisa_similaridade",
    detalhes: { itens: itensProcessados.length },
  });

  revalidatePath(`/processos/${processoId}`);

  return { data: { itensProcessados } };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/pesquisaSimilaridade.ts
git commit -m "feat: server action que orquestra a pesquisa de similaridade completa"
```

---

## Part H — Google Sheets write-back

### Task H1: Confirm Service Account credential approach with the user

**Files:** none (decision checkpoint)

- [ ] **Step 1: Ask the user before writing any code in this part**

Per spec §7, this was left as an open pending decision. Before implementing `atualizarPlanilha()`, confirm with the user:
1. They will create a Google Cloud Service Account, download its JSON key, and share each process spreadsheet with the service account's e-mail (Editor access).
2. The key will be stored as an environment variable (`GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY`, base64-encoded JSON) — never committed to the repo.

Do not proceed to Task H2 until the user confirms this approach or provides an alternative.

---

### Task H2: Implement `atualizarPlanilha()`

**Files:**
- Create: `src/lib/sheets/atualizarPlanilha.ts`

(Exact column-mapping code depends on confirming the live spreadsheet structure with the user — same constraint already documented in spec §7. Implement using `googleapis`' `sheets.spreadsheets.values.update` once Task H1 is confirmed, reusing `extrairSpreadsheetId` from `googleSheets.ts` and the column positions already inferred by `findHeaderRow`/`materialCol` in `parsePlanilha.ts`. Add `googleapis` via `pnpm add googleapis` as the first step of this task.)

- [ ] **Step 1: Install the dependency**

Run: `pnpm add googleapis`

- [ ] **Step 2: Write `atualizarPlanilha()` once H1 is confirmed**

This step is intentionally deferred — write it as its own follow-up task once the credential flow is live, since it requires a real spreadsheet to validate the write path against (no safe way to TDD a Google API write call without live credentials).

---

## Part I — UI: Pesquisa por Similaridade tab + review dialog

### Task I1: Add the "Pesquisa por Similaridade" tab with upload form

**Files:**
- Create: `src/components/processos/PesquisaSimilaridadeUploadForm.tsx`
- Modify: `src/components/processos/ProcessoTabs.tsx`

- [ ] **Step 1: Write the upload form component**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { processarPesquisaSimilaridade } from "@/lib/actions/pesquisaSimilaridade";

export function PesquisaSimilaridadeUploadForm({ processoId }: { processoId: string }) {
  const [trFile, setTrFile] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trFile) {
      setErro("Selecione o PDF do Termo de Referência.");
      return;
    }
    setErro(null);
    setSucesso(null);

    startTransition(async () => {
      const buffer = Buffer.from(await trFile.arrayBuffer());
      const resultado = await processarPesquisaSimilaridade(processoId, buffer);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      setSucesso(`${resultado.data?.itensProcessados.length ?? 0} item(ns) processado(s).`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="tr-pdf">Termo de Referência (PDF)</Label>
        <Input
          id="tr-pdf"
          type="file"
          accept="application/pdf"
          onChange={(e) => setTrFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {sucesso && <p className="text-sm text-success">{sucesso}</p>}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Processando..." : "Buscar contratos similares"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Add the tab to `ProcessoTabs.tsx`**

In `src/components/processos/ProcessoTabs.tsx`, add the import:

```typescript
import { PesquisaSimilaridadeUploadForm } from "./PesquisaSimilaridadeUploadForm";
```

Add a new trigger to `TabsList` (after the `estrategia` trigger):

```typescript
<TabsTrigger value="similaridade">Pesquisa por Similaridade</TabsTrigger>
```

Add the new tab content (after the `estrategia` TabsContent block, before `fontes`):

```typescript
<TabsContent value="similaridade" className="space-y-4">
  <PesquisaSimilaridadeUploadForm processoId={processo.id} />
</TabsContent>
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/processos/PesquisaSimilaridadeUploadForm.tsx src/components/processos/ProcessoTabs.tsx
git commit -m "feat: aba Pesquisa por Similaridade com upload do TR"
```

---

### Task I2: Add `listarResultadosSimilaridade` read action

**Files:**
- Create: `src/lib/actions/listarResultadosSimilaridade.ts`

- [ ] **Step 1: Implement**

```typescript
"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";

export interface ResultadoSimilaridadeView {
  id: string;
  itemId: string;
  itemDescricao: string;
  tipoCandidato: string;
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  fonteUrl: string | null;
  valorUnitario: number;
  scoreFinal: number;
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
  adaptado: boolean;
  justificativa: string;
  promovidoParaFonte: boolean;
}

export async function listarResultadosSimilaridadePorProcesso(
  processoId: string,
): Promise<ResultadoSimilaridadeView[]> {
  await requireAuth();

  const resultados = await db.resultadoSimilaridade.findMany({
    where: { item: { processoId } },
    include: { item: { select: { descricao: true } } },
    orderBy: [{ itemId: "asc" }, { scoreFinal: "desc" }],
  });

  return resultados.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemDescricao: r.item.descricao,
    tipoCandidato: r.tipoCandidato,
    fonteDescricao: r.fonteDescricao,
    fonteOrgaoOuId: r.fonteOrgaoOuId,
    fonteUrl: r.fonteUrl,
    valorUnitario: Number(r.valorUnitario),
    scoreFinal: Number(r.scoreFinal),
    scoreDescricao: Number(r.scoreDescricao),
    scoreEspecificacao: Number(r.scoreEspecificacao),
    scoreUnidadeQuantidade: Number(r.scoreUnidadeQuantidade),
    adaptado: r.adaptado,
    justificativa: r.justificativa,
    promovidoParaFonte: r.promovidoParaFonte,
  }));
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/listarResultadosSimilaridade.ts
git commit -m "feat: action de leitura dos resultados de similaridade por processo"
```

---

### Task I3: Render the read-only summary table + per-item review dialog

**Files:**
- Create: `src/components/processos/ResultadoSimilaridadeDialog.tsx`
- Create: `src/components/processos/ResultadosSimilaridadeTable.tsx`
- Modify: `src/components/processos/ProcessoTabs.tsx`
- Modify: `src/app/(app)/processos/[id]/page.tsx`

- [ ] **Step 1: Write the review dialog**

```typescript
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { ResultadoSimilaridadeView } from "@/lib/actions/listarResultadosSimilaridade";

export function ResultadoSimilaridadeDialog({
  itemDescricao,
  candidatos,
  open,
  onOpenChange,
}: {
  itemDescricao: string;
  candidatos: ResultadoSimilaridadeView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{itemDescricao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {candidatos.map((c) => (
            <div key={c.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.fonteDescricao}</p>
                <div className="flex items-center gap-2">
                  {c.adaptado && <Badge variant="outline">Adaptado</Badge>}
                  <Badge>{c.scoreFinal.toFixed(0)}%</Badge>
                </div>
              </div>
              <p className="text-muted-foreground">{c.fonteOrgaoOuId}</p>
              <p className="mt-1 tabular-nums">
                R$ {c.valorUnitario.toFixed(2)}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt>Descrição</dt>
                  <dd className="tabular-nums">{c.scoreDescricao.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>Especificação</dt>
                  <dd className="tabular-nums">{c.scoreEspecificacao.toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>Unidade/Qtd</dt>
                  <dd className="tabular-nums">{c.scoreUnidadeQuantidade.toFixed(0)}%</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs italic text-muted-foreground">{c.justificativa}</p>
            </div>
          ))}
          {candidatos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum candidato encontrado para este item.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the summary table**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResultadoSimilaridadeDialog } from "./ResultadoSimilaridadeDialog";
import type { ResultadoSimilaridadeView } from "@/lib/actions/listarResultadosSimilaridade";

export function ResultadosSimilaridadeTable({
  resultados,
}: {
  resultados: ResultadoSimilaridadeView[];
}) {
  const [itemAberto, setItemAberto] = useState<string | null>(null);

  const itensAgrupados = Array.from(
    resultados.reduce((map, r) => {
      if (!map.has(r.itemId)) map.set(r.itemId, { descricao: r.itemDescricao, candidatos: [] as ResultadoSimilaridadeView[] });
      map.get(r.itemId)!.candidatos.push(r);
      return map;
    }, new Map<string, { descricao: string; candidatos: ResultadoSimilaridadeView[] }>()),
  );

  if (itensAgrupados.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum resultado de similaridade ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-left">Item</th>
            <th className="p-2 text-left">Melhor candidato</th>
            <th className="p-2 text-right">Score</th>
            <th className="p-2 text-right">Preço</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {itensAgrupados.map(([itemId, grupo]) => {
            const melhor = grupo.candidatos[0]!;
            return (
              <tr key={itemId} className="border-t">
                <td className="p-2">{grupo.descricao}</td>
                <td className="p-2">{melhor.fonteDescricao}</td>
                <td className="p-2 text-right tabular-nums">{melhor.scoreFinal.toFixed(0)}%</td>
                <td className="p-2 text-right tabular-nums">R$ {melhor.valorUnitario.toFixed(2)}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setItemAberto(itemId)}>
                    Revisar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {itensAgrupados.map(([itemId, grupo]) => (
        <ResultadoSimilaridadeDialog
          key={itemId}
          itemDescricao={grupo.descricao}
          candidatos={grupo.candidatos}
          open={itemAberto === itemId}
          onOpenChange={(open) => setItemAberto(open ? itemId : null)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire the table into the tab, passing data from the page**

Modify `src/app/(app)/processos/[id]/page.tsx` to fetch the results and pass them down. Add the import:

```typescript
import { listarResultadosSimilaridadePorProcesso } from "@/lib/actions/listarResultadosSimilaridade";
```

After the `obterProcessoDetalhado(id)` call, add:

```typescript
const resultadosSimilaridade = await listarResultadosSimilaridadePorProcesso(id);
```

Pass it to `ProcessoTabs`:

```typescript
<ProcessoTabs processo={processoMapeado} resultadosSimilaridade={resultadosSimilaridade} />
```

In `src/components/processos/ProcessoTabs.tsx`, update the props and the `similaridade` tab content:

```typescript
import { ResultadosSimilaridadeTable } from "./ResultadosSimilaridadeTable";
import type { ResultadoSimilaridadeView } from "@/lib/actions/listarResultadosSimilaridade";
```

Update the function signature:

```typescript
export function ProcessoTabs({
  processo,
  resultadosSimilaridade,
}: {
  processo: ProcessoFixture;
  resultadosSimilaridade: ResultadoSimilaridadeView[];
}) {
```

Update the `similaridade` TabsContent to include the table below the upload form:

```typescript
<TabsContent value="similaridade" className="space-y-4">
  <PesquisaSimilaridadeUploadForm processoId={processo.id} />
  <ResultadosSimilaridadeTable resultados={resultadosSimilaridade} />
</TabsContent>
```

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev`, navigate to a process detail page, open the "Pesquisa por Similaridade" tab, confirm the upload form and (empty) summary table render without errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ResultadoSimilaridadeDialog.tsx src/components/processos/ResultadosSimilaridadeTable.tsx src/components/processos/ProcessoTabs.tsx "src/app/(app)/processos/[id]/page.tsx"
git commit -m "feat: tabela resumo e dialogo de revisao por item da pesquisa de similaridade"
```

---

## Self-Review

**Spec coverage:**
- §1-3 flow (upload TR + planilha already exists via `sincronizarPlanilha`, extract, search PNCP/Painel/sites, rank, dialog review, sync back, supplier discovery, summary table) → Parts B, C, D, E, F, G, I cover extraction/search/ranking/persistence/UI. Sites-eletrônicos search (mentioned in §3 step 3) and the planilha write-back (§3 step 6, §5, §7) are intentionally **not** implemented inline — write-back is gated behind the Task H1 user-confirmation checkpoint per the explicit "se tiver qualquer dúvida, não faça. Pergunte antes" instruction, and site-eletrônico search reuses the existing Sites module's whitelist, which is out of this plan's file list and should be a fast follow-up task once H1 unblocks, not guessed at here.
- §4 ranking (3 weighted params + 365-day cutoff + adaptação flag) → Tasks C3, C4, C6, E1.
- §5 components → `lib/ia` (C2,C5,C6), `lib/integracoes` (D1,D2), `lib/similaridade` (C3,C4,E1,E2), `lib/actions/pesquisaSimilaridade.ts` (G1), `ResultadoSimilaridade` model (B1), `lib/sheets` write (H1,H2 — gated), `fornecedores.ts` extension (F1-F3), email removal (A1-A3).
- §6 UI → upload form, per-item dialog with parameter breakdown + adaptado flag, read-only summary table with reopen button (I1-I3).
- §8 success criteria: score breakdown auditability is satisfied by persisting all 3 individual scores + justificativa (B1, G1, I3); "adaptado" visual flag satisfied (B1, I3); no auto-promotion to `Fonte` satisfied — `promovidoParaFonte` defaults to `false` and nothing in this plan sets it `true` automatically.

**Placeholder scan:** No "TBD"/"implement later" left in code steps. Task H2 explicitly defers real implementation pending a live spreadsheet and the H1 confirmation gate — this is a deliberate scope boundary (consistent with "pergunte antes"), not a placeholder masquerading as done work; it's called out as its own gated task rather than silently skipped.

**Type consistency:** `CandidatoSimilaridade`, `ScoreSimilaridade`, `ItemExtraidoTR`, `ProvedorIA` defined once in `src/lib/ia/types.ts` (C2) and reused verbatim in C3, C4, C6, D1, D2, E1, E2, G1 — no renamed duplicates. `ResultadoSimilaridadeView` defined once in I2 and reused in I3.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-15-pesquisa-similaridade.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
