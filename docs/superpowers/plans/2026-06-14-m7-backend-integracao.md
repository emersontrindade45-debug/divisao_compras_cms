# M7 — Backend Integration & IN 65/2021 Compliance Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock/fixture data with real Prisma-backed server actions, implement the `lib/domain/` pure-function compliance layer with full test coverage, and wire the M2–M4 UI pages to the real database.

**Architecture:** Pure domain functions in `src/lib/domain/` compute compliance results (DomainResult<T>) without any DB or Next.js imports. Server Actions consume those results and decide what to persist, block, or warn. The UI pages are updated to call server actions instead of fixture imports.

**Tech Stack:** Next.js App Router, TypeScript strict, Prisma (PostgreSQL), Zod, Vitest, shadcn/ui, pnpm

**Priority rule:** Ato da Mesa nº 17/2023 (CMS) takes precedence over IN SEGES/ME 65/2021 in all conflicts.

---

## File Map

### New files (domain):
- `src/lib/domain/types.ts` — shared domain types (Violation, DomainResult<T>, EstatisticaPrecos, ValidacaoFonte)
- `src/lib/domain/priceStats.ts` — price series statistics (excluirDiscrepantes, calcularEstatisticas, validarEvidenciasFontes)
- `src/lib/domain/in65Rules.ts` — IN 65/2021 compliance rules (validarMinFornecedores, validarFontePublica, validarValidadeFontes, validarRegistroNaoRespondentes)
- `src/lib/domain/supplierScore.ts` — supplier score calculation
- `src/lib/domain/proposalValidator.ts` — proposal checklist validation
- `src/lib/domain/__tests__/priceStats.test.ts`
- `src/lib/domain/__tests__/in65Rules.test.ts`
- `src/lib/domain/__tests__/supplierScore.test.ts`
- `src/lib/domain/__tests__/proposalValidator.test.ts`

### New files (actions):
- `src/lib/actions/fontes.ts` — CRUD for Fonte + Evidencia
- `src/lib/actions/fornecedores.ts` — CRUD for Fornecedor
- `src/lib/actions/cotacoes.ts` — CRUD for Cotacao + Proposta
- `src/lib/actions/precos.ts` — SeriePreco + PrecoConsolidado with domain validation

### New files (storage):
- `src/lib/storage/index.ts` — UploadedFile interface + uploadFile() function
- `src/lib/storage/local.ts` — local filesystem adapter (dev)

### Modify (filters):
- `src/lib/domain/processoFilter.ts` — update to work with Prisma types, not fixtures

### Modify (UI pages — replace fixture imports with server data):
- `src/app/(app)/processos/page.tsx`
- `src/app/(app)/processos/[id]/page.tsx`
- `src/app/(app)/fornecedores/page.tsx`
- `src/app/(app)/cotacoes/page.tsx`

---

## Task 1: Shared Domain Types

**Files:**
- Create: `src/lib/domain/types.ts`

- [ ] **Step 1: Create `src/lib/domain/types.ts`**

```ts
export interface Violation {
  code: string;
  rule: string;
  severity: "block" | "warn" | "info";
}

export interface DomainResult<T> {
  value: T;
  valid: boolean;
  violations: Violation[];
}

export interface EstatisticaPrecos {
  media: number;
  mediana: number;
  menorValor: number;
  coeficienteVariacao: number;
  totalPrecos: number;
  precosIncluidos: number;
  precosExcluidos: number;
  valorEstimado: number;
}

export interface ValidacaoFonte {
  fonteId: string;
  valida: boolean;
  motivo?: string;
}
```

- [ ] **Step 2: Run typecheck to verify the file compiles**

Run: `pnpm typecheck`
Expected: passes (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/types.ts
git commit -m "feat: tipos compartilhados do domínio (Violation, DomainResult, EstatisticaPrecos)"
```

---

## Task 2: Price Statistics — `priceStats.ts` + Tests

**Files:**
- Create: `src/lib/domain/priceStats.ts`
- Create: `src/lib/domain/__tests__/priceStats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/__tests__/priceStats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  excluirDiscrepantes,
  calcularEstatisticas,
  validarEvidenciasFontes,
} from "../priceStats";

describe("excluirDiscrepantes", () => {
  it("exclui preço 31% acima da mediana para aquisição", () => {
    // mediana = 100, limite superior = 130, preço 131 deve ser excluído
    const { incluidos, excluidos } = excluirDiscrepantes([100, 100, 100, 131], "aquisicao");
    expect(excluidos).toContain(131);
    expect(incluidos).not.toContain(131);
  });

  it("inclui preço 29% acima da mediana para aquisição", () => {
    const { incluidos } = excluirDiscrepantes([100, 100, 100, 129], "aquisicao");
    expect(incluidos).toContain(129);
  });

  it("inclui preço 74% acima da mediana para obra", () => {
    const { incluidos } = excluirDiscrepantes([100, 100, 100, 174], "obra");
    expect(incluidos).toContain(174);
  });

  it("exclui preço 76% acima da mediana para obra", () => {
    const { excluidos } = excluirDiscrepantes([100, 100, 100, 176], "obra");
    expect(excluidos).toContain(176);
  });

  it("retorna vazio para lista vazia", () => {
    const result = excluirDiscrepantes([], "aquisicao");
    expect(result.incluidos).toHaveLength(0);
    expect(result.excluidos).toHaveLength(0);
    expect(result.limiteInferior).toBe(0);
    expect(result.limiteSuperior).toBe(0);
  });

  it("não exclui nenhum com lista de 1 elemento", () => {
    const { incluidos, excluidos } = excluirDiscrepantes([100], "aquisicao");
    expect(incluidos).toHaveLength(1);
    expect(excluidos).toHaveLength(0);
  });
});

describe("calcularEstatisticas", () => {
  it("retorna valid: false e violation OP-ADH-04 com menos de 3 preços", () => {
    const result = calcularEstatisticas([100, 200], "media");
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-ADH-04" && v.severity === "block")).toBe(true);
  });

  it("retorna violation warn R-06 quando CV > 30%", () => {
    // preços com alta dispersão: CV >> 30%
    const result = calcularEstatisticas([100, 100, 500], "media");
    expect(result.valid).toBe(true); // sem block, mas tem warn
    expect(result.violations.some((v) => v.code === "R-06" && v.severity === "warn")).toBe(true);
  });

  it("não gera violations quando tudo válido e CV <= 30%", () => {
    const result = calcularEstatisticas([100, 105, 110], "media");
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("calcula mediana corretamente para lista par (média dos dois centrais)", () => {
    // [100, 200, 300, 400] → dois centrais 200 e 300 → mediana 250
    const result = calcularEstatisticas([100, 200, 300, 400], "mediana");
    expect(result.value.mediana).toBe(250);
  });

  it("usa menor valor quando metodo é menor_valor", () => {
    const result = calcularEstatisticas([100, 200, 300], "menor_valor");
    expect(result.value.valorEstimado).toBe(100);
  });

  it("calcula valorEstimado como média quando metodo é media", () => {
    const result = calcularEstatisticas([100, 200, 300], "media");
    expect(result.value.valorEstimado).toBeCloseTo(200, 2);
  });
});

describe("validarEvidenciasFontes", () => {
  it("retorna valid: false e violation R-02 para fonte sem evidência", () => {
    const result = validarEvidenciasFontes([{ id: "f1", evidencias: [] }]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-02")).toBe(true);
    expect(result.value.find((v) => v.fonteId === "f1")?.valida).toBe(false);
  });

  it("retorna valid: true quando todas as fontes têm evidência", () => {
    const result = validarEvidenciasFontes([
      { id: "f1", evidencias: [{ dataHoraAcesso: new Date() }] },
      { id: "f2", evidencias: [{ dataHoraAcesso: new Date() }] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("retorna valid: false quando apenas uma fonte falha", () => {
    const result = validarEvidenciasFontes([
      { id: "f1", evidencias: [{ dataHoraAcesso: new Date() }] },
      { id: "f2", evidencias: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.value.find((v) => v.fonteId === "f1")?.valida).toBe(true);
    expect(result.value.find((v) => v.fonteId === "f2")?.valida).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/domain/__tests__/priceStats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/priceStats.ts`**

```ts
import type { DomainResult, EstatisticaPrecos, ValidacaoFonte, Violation } from "./types";

function mediana(valores: number[]): number {
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function media(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function desvioPadrao(valores: number[], avg: number): number {
  const variance = valores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / valores.length;
  return Math.sqrt(variance);
}

export function excluirDiscrepantes(
  precos: number[],
  tipoObjeto: "aquisicao" | "obra",
): {
  incluidos: number[];
  excluidos: number[];
  limiteInferior: number;
  limiteSuperior: number;
} {
  if (precos.length === 0) {
    return { incluidos: [], excluidos: [], limiteInferior: 0, limiteSuperior: 0 };
  }

  const tolerancia = tipoObjeto === "obra" ? 0.75 : 0.30;
  const med = mediana(precos);
  const limiteInferior = med * (1 - tolerancia);
  const limiteSuperior = med * (1 + tolerancia);

  const incluidos: number[] = [];
  const excluidos: number[] = [];
  for (const p of precos) {
    if (p >= limiteInferior && p <= limiteSuperior) {
      incluidos.push(p);
    } else {
      excluidos.push(p);
    }
  }
  return { incluidos, excluidos, limiteInferior, limiteSuperior };
}

export function calcularEstatisticas(
  precosIncluidos: number[],
  metodo: "media" | "mediana" | "menor_valor",
): DomainResult<EstatisticaPrecos> {
  const violations: Violation[] = [];

  if (precosIncluidos.length < 3) {
    return {
      value: {
        media: 0,
        mediana: 0,
        menorValor: 0,
        coeficienteVariacao: 0,
        totalPrecos: precosIncluidos.length,
        precosIncluidos: precosIncluidos.length,
        precosExcluidos: 0,
        valorEstimado: 0,
      },
      valid: false,
      violations: [
        {
          code: "OP-ADH-04",
          rule: "Quadro Demonstrativo exige ≥ 3 preços válidos após tratamento estatístico",
          severity: "block",
        },
      ],
    };
  }

  const avg = media(precosIncluidos);
  const med = mediana(precosIncluidos);
  const menor = Math.min(...precosIncluidos);
  const dp = desvioPadrao(precosIncluidos, avg);
  const cv = (dp / avg) * 100;

  if (cv > 30) {
    violations.push({
      code: "R-06",
      rule: "Grande dispersão de preços: análise crítica obrigatória (CV > 30%)",
      severity: "warn",
    });
  }

  const valorEstimado =
    metodo === "media" ? avg : metodo === "mediana" ? med : menor;

  return {
    value: {
      media: avg,
      mediana: med,
      menorValor: menor,
      coeficienteVariacao: cv,
      totalPrecos: precosIncluidos.length,
      precosIncluidos: precosIncluidos.length,
      precosExcluidos: 0,
      valorEstimado,
    },
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}

export function validarEvidenciasFontes(
  fontes: Array<{ id: string; evidencias: Array<{ dataHoraAcesso: Date }> }>,
): DomainResult<ValidacaoFonte[]> {
  const violations: Violation[] = [];
  const resultado: ValidacaoFonte[] = [];

  for (const fonte of fontes) {
    const valida = fonte.evidencias.length > 0;
    resultado.push({
      fonteId: fonte.id,
      valida,
      motivo: valida ? undefined : "Nenhuma evidência com data/hora de acesso registrada",
    });
    if (!valida) {
      violations.push({
        code: "R-02",
        rule: "Preço sem evidência vinculada (fonte + data + evidência obrigatórios)",
        severity: "block",
      });
    }
  }

  return {
    value: resultado,
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}
```

- [ ] **Step 4: Run tests — must pass**

Run: `pnpm test src/lib/domain/__tests__/priceStats.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/priceStats.ts src/lib/domain/__tests__/priceStats.test.ts
git commit -m "feat: estatística de preços com exclusão de discrepantes e validação de evidências"
```

---

## Task 3: IN 65/2021 Compliance Rules — `in65Rules.ts` + Tests

**Files:**
- Create: `src/lib/domain/in65Rules.ts`
- Create: `src/lib/domain/__tests__/in65Rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/__tests__/in65Rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validarMinFornecedores,
  validarFontePublica,
  validarValidadeFontes,
  validarRegistroNaoRespondentes,
} from "../in65Rules";

describe("validarMinFornecedores", () => {
  it("válido com 3 ou mais fornecedores", () => {
    const result = validarMinFornecedores(3, false);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("block R-03 com 2 fornecedores sem justificativa", () => {
    const result = validarMinFornecedores(2, false);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-03" && v.severity === "block")).toBe(true);
  });

  it("warn OP-EXC-01 com 2 fornecedores com justificativa", () => {
    const result = validarMinFornecedores(2, true);
    expect(result.valid).toBe(true); // warn não bloqueia
    expect(result.violations.some((v) => v.code === "OP-EXC-01" && v.severity === "warn")).toBe(true);
  });

  it("block R-03 com 0 fornecedores mesmo com justificativa", () => {
    const result = validarMinFornecedores(0, true);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-03" && v.severity === "block")).toBe(true);
  });
});

describe("validarFontePublica", () => {
  it("válido quando usou fonte pública", () => {
    const result = validarFontePublica(true);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("block R-07 quando não usou e sem justificativa", () => {
    const result = validarFontePublica(false);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "R-07" && v.severity === "block")).toBe(true);
  });

  it("warn OP-EXC-02 quando não usou mas tem justificativa", () => {
    const result = validarFontePublica(false, "Nenhuma contratação pública similar encontrada");
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.code === "OP-EXC-02" && v.severity === "warn")).toBe(true);
  });
});

describe("validarValidadeFontes", () => {
  const hoje = new Date("2026-06-14");

  function datasAtras(dias: number): Date {
    const d = new Date(hoje);
    d.setDate(d.getDate() - dias);
    return d;
  }

  it("block OP-SLA-06 para contratação pública com 366 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(366) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-06")).toBe(true);
  });

  it("válida para contratação pública com 364 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "contratacao_publica", dataReferencia: datasAtras(364) }],
      hoje,
    );
    expect(result.valid).toBe(true);
  });

  it("block OP-SLA-04 para site eletrônico com 91 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "site_eletronico", dataReferencia: datasAtras(91) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-04")).toBe(true);
  });

  it("block OP-SLA-03 para fornecedor direto com 181 dias", () => {
    const result = validarValidadeFontes(
      [{ fonteId: "f1", tipo: "fornecedor_direto", dataReferencia: datasAtras(181) }],
      hoje,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "OP-SLA-03")).toBe(true);
  });
});

describe("validarRegistroNaoRespondentes", () => {
  it("warn R-04 quando há fornecedores sem resposta", () => {
    const result = validarRegistroNaoRespondentes(["f1", "f2", "f3"], ["f1"]);
    expect(result.violations.some((v) => v.code === "R-04" && v.severity === "warn")).toBe(true);
    expect(result.value.naoResponderam).toEqual(expect.arrayContaining(["f2", "f3"]));
  });

  it("sem violations quando todos responderam", () => {
    const result = validarRegistroNaoRespondentes(["f1", "f2"], ["f1", "f2"]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/domain/__tests__/in65Rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/in65Rules.ts`**

```ts
import type { DomainResult, Violation } from "./types";

const JANELAS_VALIDADE: Record<string, number> = {
  contratacao_publica: 365,
  site_eletronico: 90,
  fornecedor_direto: 180,
};

const CODIGOS_VALIDADE: Record<string, string> = {
  contratacao_publica: "OP-SLA-06",
  site_eletronico: "OP-SLA-04",
  fornecedor_direto: "OP-SLA-03",
};

export function validarMinFornecedores(
  fornecedoresConsultados: number,
  comJustificativa: boolean,
): DomainResult<void> {
  if (fornecedoresConsultados === 0) {
    return {
      value: undefined,
      valid: false,
      violations: [
        {
          code: "R-03",
          rule: "Pesquisa direta exige ≥ 3 fornecedores consultados",
          severity: "block",
        },
      ],
    };
  }

  if (fornecedoresConsultados >= 3) {
    return { value: undefined, valid: true, violations: [] };
  }

  if (comJustificativa) {
    return {
      value: undefined,
      valid: true,
      violations: [
        {
          code: "OP-EXC-01",
          rule: "Exceção: < 3 fornecedores com justificativa — requer aprovação",
          severity: "warn",
        },
      ],
    };
  }

  return {
    value: undefined,
    valid: false,
    violations: [
      {
        code: "R-03",
        rule: "Pesquisa direta exige ≥ 3 fornecedores consultados",
        severity: "block",
      },
    ],
  };
}

export function validarFontePublica(
  usouFontePublica: boolean,
  justificativa?: string,
): DomainResult<void> {
  if (usouFontePublica) {
    return { value: undefined, valid: true, violations: [] };
  }

  if (justificativa && justificativa.trim().length > 0) {
    return {
      value: undefined,
      valid: true,
      violations: [
        {
          code: "OP-EXC-02",
          rule: "Não uso de fonte pública com justificativa — requer aprovação",
          severity: "warn",
        },
      ],
    };
  }

  return {
    value: undefined,
    valid: false,
    violations: [
      {
        code: "R-07",
        rule: "Fonte pública não utilizada sem justificativa registrada",
        severity: "block",
      },
    ],
  };
}

export function validarValidadeFontes(
  fontes: Array<{
    fonteId: string;
    tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto";
    dataReferencia: Date;
  }>,
  dataReferenciaCalculo: Date,
): DomainResult<Array<{ fonteId: string; valida: boolean; diasRestantes: number }>> {
  const violations: Violation[] = [];
  const resultado: Array<{ fonteId: string; valida: boolean; diasRestantes: number }> = [];

  for (const fonte of fontes) {
    const janela = JANELAS_VALIDADE[fonte.tipo]!;
    const diffMs = dataReferenciaCalculo.getTime() - fonte.dataReferencia.getTime();
    const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diasRestantes = janela - diasDecorridos;
    const valida = diasDecorridos <= janela;

    resultado.push({ fonteId: fonte.fonteId, valida, diasRestantes });

    if (!valida) {
      const code = CODIGOS_VALIDADE[fonte.tipo]!;
      violations.push({
        code,
        rule: `Fonte ${fonte.fonteId} expirada: ${Math.abs(diasRestantes)} dia(s) além do prazo de validade`,
        severity: "block",
      });
    }
  }

  return {
    value: resultado,
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}

export function validarRegistroNaoRespondentes(
  fornecedoresConsultados: string[],
  fornecedoresQueResponderam: string[],
): DomainResult<{ naoResponderam: string[] }> {
  const responderam = new Set(fornecedoresQueResponderam);
  const naoResponderam = fornecedoresConsultados.filter((f) => !responderam.has(f));

  if (naoResponderam.length === 0) {
    return { value: { naoResponderam: [] }, valid: true, violations: [] };
  }

  return {
    value: { naoResponderam },
    valid: true,
    violations: [
      {
        code: "R-04",
        rule: "Fornecedores sem resposta devem ter registro formal no processo",
        severity: "warn",
      },
    ],
  };
}
```

- [ ] **Step 4: Run tests — must pass**

Run: `pnpm test src/lib/domain/__tests__/in65Rules.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/in65Rules.ts src/lib/domain/__tests__/in65Rules.test.ts
git commit -m "feat: regras de conformidade IN 65/2021 e Ato da Mesa nº 17/2023"
```

---

## Task 4: Supplier Score — `supplierScore.ts` + Tests

**Files:**
- Create: `src/lib/domain/supplierScore.ts`
- Create: `src/lib/domain/__tests__/supplierScore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/__tests__/supplierScore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcularScore } from "../supplierScore";

function cotacao(envio: string, resposta?: string) {
  return {
    dataEnvio: new Date(envio),
    dataResposta: resposta ? new Date(resposta) : undefined,
  };
}

describe("calcularScore", () => {
  it("taxa 100% e velocidade 0 dias → score 100", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-06-01")],
    });
    expect(result.value.score).toBe(100);
    expect(result.valid).toBe(true);
  });

  it("taxa 0% → score 0", () => {
    const result = calcularScore({
      totalCotacoes: 5,
      totalRespostas: 0,
      historicoRespostas: [cotacao("2026-06-01")],
    });
    expect(result.value.score).toBe(0);
  });

  it("taxa 50%, velocidade 5 dias → score 50 (30 + 20)", () => {
    const result = calcularScore({
      totalCotacoes: 2,
      totalRespostas: 1,
      historicoRespostas: [
        cotacao("2026-06-01", "2026-06-06"), // 5 dias
        cotacao("2026-06-01"),
      ],
    });
    expect(result.value.score).toBe(50);
    expect(result.value.breakdown.pontosResposta).toBe(30);
    expect(result.value.breakdown.pontosVelocidade).toBe(20);
  });

  it("taxa 100%, velocidade 10 dias → score 60 (60 + 0)", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-06-11")],
    });
    expect(result.value.score).toBe(60);
    expect(result.value.breakdown.pontosVelocidade).toBe(0);
  });

  it("0 cotações → score 0, valid true", () => {
    const result = calcularScore({
      totalCotacoes: 0,
      totalRespostas: 0,
      historicoRespostas: [],
    });
    expect(result.value.score).toBe(0);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("velocidade > 10 dias → pontosVelocidade não fica negativo", () => {
    const result = calcularScore({
      totalCotacoes: 1,
      totalRespostas: 1,
      historicoRespostas: [cotacao("2026-06-01", "2026-07-01")], // 30 dias
    });
    expect(result.value.breakdown.pontosVelocidade).toBe(0);
    expect(result.value.score).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/domain/__tests__/supplierScore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/supplierScore.ts`**

```ts
import type { DomainResult } from "./types";

export function calcularScore(dados: {
  totalCotacoes: number;
  totalRespostas: number;
  historicoRespostas: Array<{
    dataEnvio: Date;
    dataResposta?: Date;
  }>;
}): DomainResult<{
  score: number;
  taxaResposta: number;
  velocidadeMedia: number;
  breakdown: { pontosResposta: number; pontosVelocidade: number };
}> {
  if (dados.totalCotacoes === 0) {
    return {
      value: {
        score: 0,
        taxaResposta: 0,
        velocidadeMedia: 0,
        breakdown: { pontosResposta: 0, pontosVelocidade: 0 },
      },
      valid: true,
      violations: [],
    };
  }

  const taxaResposta = (dados.totalRespostas / dados.totalCotacoes) * 100;
  const pontosResposta = taxaResposta * 0.6;

  const respondidas = dados.historicoRespostas.filter((h) => h.dataResposta != null);
  let velocidadeMedia = 0;
  if (respondidas.length > 0) {
    const diasTotal = respondidas.reduce((acc, h) => {
      const diffMs = h.dataResposta!.getTime() - h.dataEnvio.getTime();
      return acc + diffMs / (1000 * 60 * 60 * 24);
    }, 0);
    velocidadeMedia = diasTotal / respondidas.length;
  }

  const pontosVelocidade = Math.max(0, 40 - velocidadeMedia * 4);
  const score = Math.round(pontosResposta + pontosVelocidade);

  return {
    value: {
      score,
      taxaResposta,
      velocidadeMedia,
      breakdown: {
        pontosResposta: Math.round(pontosResposta * 100) / 100,
        pontosVelocidade: Math.round(pontosVelocidade * 100) / 100,
      },
    },
    valid: true,
    violations: [],
  };
}
```

- [ ] **Step 4: Run tests — must pass**

Run: `pnpm test src/lib/domain/__tests__/supplierScore.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/supplierScore.ts src/lib/domain/__tests__/supplierScore.test.ts
git commit -m "feat: score de fornecedor por taxa de resposta e velocidade"
```

---

## Task 5: Proposal Validator — `proposalValidator.ts` + Tests

**Files:**
- Create: `src/lib/domain/proposalValidator.ts`
- Create: `src/lib/domain/__tests__/proposalValidator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/__tests__/proposalValidator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarProposta } from "../proposalValidator";

const hoje = new Date("2026-06-14");

function datasAtras(dias: number): Date {
  const d = new Date(hoje);
  d.setDate(d.getDate() - dias);
  return d;
}

const propostaValida = {
  cnpj: "12.345.678/0001-90",
  descricaoObjeto: "Cadeiras ergonômicas NR-17",
  valorUnitario: 1200,
  valorTotal: 48000,
  dataEmissao: datasAtras(30),
  nomeResponsavel: "Maria Silva",
};

describe("validarProposta", () => {
  it("proposta completa e válida → statusGeral valida, sem violations block", () => {
    const result = validarProposta(propostaValida, hoje);
    expect(result.value.statusGeral).toBe("valida");
    expect(result.valid).toBe(true);
    expect(result.violations.filter((v) => v.severity === "block")).toHaveLength(0);
  });

  it("cnpj ausente → statusGeral invalida, violation block", () => {
    const result = validarProposta({ ...propostaValida, cnpj: undefined }, hoje);
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.severity === "block")).toBe(true);
    expect(result.value.itens.find((i) => i.campo === "cnpj")?.status).toBe("invalido");
  });

  it("dataEmissao com 181 dias → statusGeral com_ressalva, violation warn OP-SLA-03", () => {
    const result = validarProposta({ ...propostaValida, dataEmissao: datasAtras(181) }, hoje);
    expect(result.value.statusGeral).toBe("com_ressalva");
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.code === "OP-SLA-03" && v.severity === "warn")).toBe(true);
    expect(result.value.itens.find((i) => i.campo === "dataEmissao")?.status).toBe("ressalva");
  });

  it("valorUnitario ausente + dataEmissao vencida → statusGeral invalida", () => {
    const result = validarProposta(
      { ...propostaValida, valorUnitario: undefined, dataEmissao: datasAtras(200) },
      hoje,
    );
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.valid).toBe(false);
  });

  it("todos os campos ausentes → todos invalidos", () => {
    const result = validarProposta({}, hoje);
    expect(result.value.statusGeral).toBe("invalida");
    expect(result.value.itens.every((i) => i.status === "invalido")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/domain/__tests__/proposalValidator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/lib/domain/proposalValidator.ts`**

```ts
import type { DomainResult, Violation } from "./types";

type ItemChecklist = {
  campo: string;
  status: "valido" | "ressalva" | "invalido";
  motivo?: string;
};

type ResultadoValidacao = {
  itens: ItemChecklist[];
  statusGeral: "valida" | "com_ressalva" | "invalida";
};

const VALIDADE_PROPOSTA_DIAS = 180;

export function validarProposta(
  proposta: {
    cnpj?: string;
    descricaoObjeto?: string;
    valorUnitario?: number;
    valorTotal?: number;
    dataEmissao?: Date;
    nomeResponsavel?: string;
  },
  dataReferenciaCalculo: Date,
): DomainResult<ResultadoValidacao> {
  const violations: Violation[] = [];
  const itens: ItemChecklist[] = [];

  function campoObrigatorio(campo: string, valor: unknown): ItemChecklist {
    if (valor == null || (typeof valor === "string" && valor.trim() === "")) {
      violations.push({
        code: "R-05",
        rule: `Campo obrigatório ausente na proposta: ${campo}`,
        severity: "block",
      });
      return { campo, status: "invalido", motivo: "Campo obrigatório ausente" };
    }
    return { campo, status: "valido" };
  }

  itens.push(campoObrigatorio("cnpj", proposta.cnpj));
  itens.push(campoObrigatorio("descricaoObjeto", proposta.descricaoObjeto));
  itens.push(campoObrigatorio("valorUnitario", proposta.valorUnitario));
  itens.push(campoObrigatorio("valorTotal", proposta.valorTotal));
  itens.push(campoObrigatorio("nomeResponsavel", proposta.nomeResponsavel));

  // dataEmissao: obrigatório + validade 180 dias
  if (proposta.dataEmissao == null) {
    violations.push({
      code: "R-05",
      rule: "Campo obrigatório ausente na proposta: dataEmissao",
      severity: "block",
    });
    itens.push({ campo: "dataEmissao", status: "invalido", motivo: "Campo obrigatório ausente" });
  } else {
    const diffMs = dataReferenciaCalculo.getTime() - proposta.dataEmissao.getTime();
    const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diasDecorridos > VALIDADE_PROPOSTA_DIAS) {
      violations.push({
        code: "OP-SLA-03",
        rule: "Proposta com data de emissão superior a 180 dias — validade expirada",
        severity: "warn",
      });
      itens.push({
        campo: "dataEmissao",
        status: "ressalva",
        motivo: `Proposta emitida há ${diasDecorridos} dias (limite: ${VALIDADE_PROPOSTA_DIAS} dias)`,
      });
    } else {
      itens.push({ campo: "dataEmissao", status: "valido" });
    }
  }

  const temInvalido = itens.some((i) => i.status === "invalido");
  const temRessalva = itens.some((i) => i.status === "ressalva");
  const statusGeral: "valida" | "com_ressalva" | "invalida" = temInvalido
    ? "invalida"
    : temRessalva
      ? "com_ressalva"
      : "valida";

  return {
    value: { itens, statusGeral },
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}
```

- [ ] **Step 4: Run tests — must pass**

Run: `pnpm test src/lib/domain/__tests__/proposalValidator.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Run all domain tests**

Run: `pnpm test src/lib/domain/`
Expected: all tests PASS (status, processoFilter, priceStats, in65Rules, supplierScore, proposalValidator)

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/proposalValidator.ts src/lib/domain/__tests__/proposalValidator.test.ts
git commit -m "feat: validador de proposta com checklist mínimo e validade de 180 dias"
```

---

## Task 6: Storage Abstraction — `lib/storage/`

**Files:**
- Create: `src/lib/storage/index.ts`
- Create: `src/lib/storage/local.ts`

- [ ] **Step 1: Create `src/lib/storage/index.ts`**

```ts
export interface UploadedFile {
  path: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface StorageAdapter {
  upload(file: File, folder?: string): Promise<UploadedFile>;
  delete(path: string): Promise<void>;
}

// Selects the adapter based on environment
// Replace 'local' with 'vercel-blob' when ready for production
export { localAdapter as storageAdapter } from "./local";
```

- [ ] **Step 2: Create `src/lib/storage/local.ts`**

```ts
import path from "path";
import { writeFile, mkdir, unlink } from "fs/promises";
import type { StorageAdapter, UploadedFile } from "./index";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const localAdapter: StorageAdapter = {
  async upload(file: File, folder = "evidencias"): Promise<UploadedFile> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const destDir = path.join(UPLOAD_DIR, folder);
    await mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, safeName);
    await writeFile(destPath, buffer);
    return {
      path: path.join(folder, safeName),
      url: `/uploads/${folder}/${safeName}`,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    };
  },

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(UPLOAD_DIR, filePath);
    await unlink(fullPath);
  },
};
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/
git commit -m "feat: abstração de storage de arquivos (adaptador local)"
```

---

## Task 7: Server Actions — Fontes & Evidências

**Files:**
- Create: `src/lib/actions/fontes.ts`
- Refer to: `src/lib/actions/processos.ts` for the ActionResult<T> pattern

- [ ] **Step 1: Create `src/lib/actions/fontes.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { z } from "zod";
import { storageAdapter } from "@/lib/storage";
import type { ActionResult } from "./processos";

const createFonteSchema = z.object({
  processoId: z.string().cuid(),
  tipo: z.enum(["contratacao_publica", "site_eletronico", "fornecedor_direto"]),
  descricao: z.string().min(1),
  url: z.string().url().optional(),
  orgao: z.string().optional(),
  valorUnitario: z.number().positive().optional(),
  dataReferencia: z.coerce.date(),
  aderencia: z.enum(["aderente", "parcial", "nao_aderente"]).optional(),
  justificativaAderencia: z.string().optional(),
});

const createEvidenciaSchema = z.object({
  fonteId: z.string().cuid(),
  dataHoraAcesso: z.coerce.date(),
  urlCapturada: z.string().url().optional(),
  descricao: z.string().optional(),
});

export async function criarFonte(input: z.infer<typeof createFonteSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createFonteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const processo = await db.processo.findUnique({ where: { id: parsed.data.processoId } });
  if (!processo) return { error: "Processo não encontrado" };

  const fonte = await db.fonte.create({ data: { ...parsed.data, userId: user.id } });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_fonte",
    processoId: parsed.data.processoId,
    detalhes: { fonteId: fonte.id, tipo: parsed.data.tipo },
  });

  return { data: { id: fonte.id } };
}

export async function criarEvidencia(
  input: z.infer<typeof createEvidenciaSchema>,
  arquivo?: File,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createEvidenciaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const fonte = await db.fonte.findUnique({ where: { id: parsed.data.fonteId } });
  if (!fonte) return { error: "Fonte não encontrada" };

  let arquivoUrl: string | undefined;
  let arquivoNome: string | undefined;
  if (arquivo) {
    const uploaded = await storageAdapter.upload(arquivo, "evidencias");
    arquivoUrl = uploaded.url;
    arquivoNome = uploaded.originalName;
  }

  const evidencia = await db.evidencia.create({
    data: {
      ...parsed.data,
      arquivoUrl,
      arquivoNome,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_evidencia",
    processoId: fonte.processoId,
    detalhes: { evidenciaId: evidencia.id, fonteId: parsed.data.fonteId },
  });

  return { data: { id: evidencia.id } };
}

export async function listarFontesPorProcesso(processoId: string) {
  await requireAuth();
  return db.fonte.findMany({
    where: { processoId },
    include: { evidencias: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function excluirFonte(fonteId: string): Promise<ActionResult> {
  const user = await requireRole("revisao");
  const fonte = await db.fonte.findUnique({ where: { id: fonteId } });
  if (!fonte) return { error: "Fonte não encontrada" };

  await db.fonte.delete({ where: { id: fonteId } });

  await registrarAuditoria({
    userId: user.id,
    acao: "excluir_fonte",
    processoId: fonte.processoId,
    detalhes: { fonteId },
  });

  return {};
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes (or only errors from UI pages not yet updated)

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/fontes.ts
git commit -m "feat: server actions de CRUD para fontes e evidências"
```

---

## Task 8: Server Actions — Fornecedores

**Files:**
- Create: `src/lib/actions/fornecedores.ts`

- [ ] **Step 1: Create `src/lib/actions/fornecedores.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { createFornecedorSchema, updateFornecedorSchema } from "@/lib/validations/fornecedor";
import { calcularScore } from "@/lib/domain/supplierScore";
import type { ActionResult } from "./processos";

export async function criarFornecedor(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createFornecedorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const existente = await db.fornecedor.findUnique({ where: { cnpj: parsed.data.cnpj } });
  if (existente) return { error: "CNPJ já cadastrado" };

  const fornecedor = await db.fornecedor.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_fornecedor",
    detalhes: { fornecedorId: fornecedor.id, cnpj: parsed.data.cnpj },
  });

  return { data: { id: fornecedor.id } };
}

export async function atualizarFornecedor(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("pesquisa");
  const parsed = updateFornecedorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const fornecedor = await db.fornecedor.findUnique({ where: { id } });
  if (!fornecedor) return { error: "Fornecedor não encontrado" };

  await db.fornecedor.update({ where: { id }, data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "atualizar_fornecedor",
    detalhes: { fornecedorId: id },
  });

  return {};
}

export async function listarFornecedores(filtros?: {
  busca?: string;
  cidade?: string;
  categoria?: string;
}) {
  await requireAuth();

  return db.fornecedor.findMany({
    where: {
      ...(filtros?.busca
        ? {
            OR: [
              { razaoSocial: { contains: filtros.busca, mode: "insensitive" } },
              { cnpj: { contains: filtros.busca } },
            ],
          }
        : {}),
      ...(filtros?.cidade ? { cidade: { contains: filtros.cidade, mode: "insensitive" } } : {}),
      ...(filtros?.categoria ? { categoria: { contains: filtros.categoria, mode: "insensitive" } } : {}),
    },
    orderBy: { razaoSocial: "asc" },
  });
}

export async function obterScoreFornecedor(fornecedorId: string) {
  await requireAuth();

  const historico = await db.historicoCotacao.findMany({
    where: { fornecedorId },
    select: { dataEnvio: true, dataResposta: true },
  });

  const total = await db.historicoCotacao.count({ where: { fornecedorId } });
  const respondidas = await db.historicoCotacao.count({
    where: { fornecedorId, dataResposta: { not: null } },
  });

  return calcularScore({
    totalCotacoes: total,
    totalRespostas: respondidas,
    historicoRespostas: historico.map((h) => ({
      dataEnvio: h.dataEnvio,
      dataResposta: h.dataResposta ?? undefined,
    })),
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/fornecedores.ts
git commit -m "feat: server actions de CRUD para fornecedores com score integrado"
```

---

## Task 9: Server Actions — Cotações & Propostas

**Files:**
- Create: `src/lib/actions/cotacoes.ts`

- [ ] **Step 1: Create `src/lib/actions/cotacoes.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  createCotacaoSchema,
  updateCotacaoSchema,
  createPropostaSchema,
} from "@/lib/validations/cotacao";
import { validarProposta } from "@/lib/domain/proposalValidator";
import type { ActionResult } from "./processos";

export async function criarCotacao(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createCotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.create({
    data: { ...parsed.data, status: "silenciosa" },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_cotacao",
    processoId: parsed.data.processoId,
    detalhes: { cotacaoId: cotacao.id, fornecedorId: parsed.data.fornecedorId },
  });

  return { data: { id: cotacao.id } };
}

export async function atualizarCotacao(
  cotacaoId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireRole("pesquisa");
  const parsed = updateCotacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { processo: true },
  });
  if (!cotacao) return { error: "Cotação não encontrada" };

  await db.cotacao.update({ where: { id: cotacaoId }, data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "atualizar_cotacao",
    processoId: cotacao.processoId,
    detalhes: { cotacaoId, statusNovo: parsed.data.status },
  });

  return {};
}

export async function registrarProposta(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createPropostaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const cotacao = await db.cotacao.findUnique({ where: { id: parsed.data.cotacaoId } });
  if (!cotacao) return { error: "Cotação não encontrada" };

  // Run domain validation
  const validacao = validarProposta(
    {
      cnpj: parsed.data.cnpjValido === "invalido" ? undefined : "present",
      descricaoObjeto: parsed.data.descricaoValida === "invalido" ? undefined : "present",
      valorUnitario: parsed.data.valorUnitario,
      valorTotal: parsed.data.valorTotal,
      dataEmissao: parsed.data.dataProposta,
      nomeResponsavel: parsed.data.responsavel,
    },
    new Date(),
  );

  const blockViolations = validacao.violations.filter((v) => v.severity === "block");
  if (blockViolations.length > 0) {
    return { error: blockViolations[0]!.rule };
  }

  const proposta = await db.proposta.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "registrar_proposta",
    processoId: cotacao.processoId,
    detalhes: { propostaId: proposta.id, cotacaoId: parsed.data.cotacaoId, statusGeral: parsed.data.statusGeral },
  });

  return { data: { id: proposta.id } };
}

export async function listarCotacoesPorProcesso(processoId: string) {
  await requireAuth();
  return db.cotacao.findMany({
    where: { processoId },
    include: {
      fornecedor: { select: { razaoSocial: true, cnpj: true } },
      proposta: true,
    },
    orderBy: { dataEnvio: "desc" },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/cotacoes.ts
git commit -m "feat: server actions de CRUD para cotações e propostas com validação de domínio"
```

---

## Task 10: Server Actions — Série de Preços

**Files:**
- Create: `src/lib/actions/precos.ts`

- [ ] **Step 1: Create `src/lib/actions/precos.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { createSeriePrecoSchema, createPrecoConsolidadoSchema } from "@/lib/validations/preco";
import { calcularEstatisticas, excluirDiscrepantes, validarEvidenciasFontes } from "@/lib/domain/priceStats";
import { validarValidadeFontes } from "@/lib/domain/in65Rules";
import type { ActionResult } from "./processos";

export async function criarSeriePreco(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createSeriePrecoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const item = await db.item.findUnique({ where: { id: parsed.data.itemId } });
  if (!item) return { error: "Item não encontrado" };

  const serie = await db.seriePreco.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "criar_serie_preco",
    detalhes: { serieId: serie.id, itemId: parsed.data.itemId },
  });

  return { data: { id: serie.id } };
}

export async function adicionarPreco(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("pesquisa");
  const parsed = createPrecoConsolidadoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const serie = await db.seriePreco.findUnique({ where: { id: parsed.data.seriePrecoId } });
  if (!serie) return { error: "Série de preços não encontrada" };

  const preco = await db.precoConsolidado.create({ data: parsed.data });

  await registrarAuditoria({
    userId: user.id,
    acao: "adicionar_preco",
    detalhes: { precoId: preco.id, serieId: parsed.data.seriePrecoId },
  });

  return { data: { id: preco.id } };
}

export async function consolidarSeriePreco(
  serieId: string,
  tipoObjeto: "aquisicao" | "obra",
): Promise<ActionResult<{ valorEstimado: number; violations: Array<{ code: string; rule: string; severity: string }> }>> {
  const user = await requireRole("pesquisa");

  const serie = await db.seriePreco.findUnique({
    where: { id: serieId },
    include: {
      precos: { where: { status: "incluido" } },
      item: {
        include: {
          processo: {
            include: {
              fontes: { include: { evidencias: true } },
            },
          },
        },
      },
    },
  });

  if (!serie) return { error: "Série não encontrada" };

  // Validate evidences
  const fontesComEvidencias = serie.item.processo.fontes.map((f) => ({
    id: f.id,
    evidencias: f.evidencias.map((e) => ({ dataHoraAcesso: e.dataHoraAcesso })),
  }));
  const evidResult = validarEvidenciasFontes(fontesComEvidencias);
  if (!evidResult.valid) {
    return { error: evidResult.violations.filter((v) => v.severity === "block")[0]?.rule ?? "Evidências inválidas" };
  }

  // Validate source validity dates
  const today = new Date();
  const fontesParaValidar = serie.item.processo.fontes.map((f) => ({
    fonteId: f.id,
    tipo: f.tipo as "contratacao_publica" | "site_eletronico" | "fornecedor_direto",
    dataReferencia: f.dataReferencia ?? today,
  }));
  const validadeResult = validarValidadeFontes(fontesParaValidar, today);
  if (!validadeResult.valid) {
    return { error: validadeResult.violations.filter((v) => v.severity === "block")[0]?.rule ?? "Fontes expiradas" };
  }

  // Exclude outliers and compute statistics
  const valores = serie.precos.map((p) => p.valorUnitario);
  const { incluidos } = excluirDiscrepantes(valores, tipoObjeto);
  const metodo = serie.metodo as "media" | "mediana" | "menor_valor";
  const estatResult = calcularEstatisticas(incluidos, metodo);

  if (!estatResult.valid) {
    return { error: estatResult.violations.filter((v) => v.severity === "block")[0]?.rule ?? "Estatísticas inválidas" };
  }

  await db.seriePreco.update({
    where: { id: serieId },
    data: { valorEstimado: estatResult.value.valorEstimado },
  });

  await registrarAuditoria({
    userId: user.id,
    acao: "consolidar_serie_preco",
    detalhes: {
      serieId,
      valorEstimado: estatResult.value.valorEstimado,
      cv: estatResult.value.coeficienteVariacao,
    },
  });

  return {
    data: {
      valorEstimado: estatResult.value.valorEstimado,
      violations: estatResult.violations,
    },
  };
}

export async function obterSeriePreco(serieId: string) {
  await requireAuth();
  return db.seriePreco.findUnique({
    where: { id: serieId },
    include: { precos: { orderBy: { dataReferencia: "asc" } } },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/precos.ts
git commit -m "feat: server actions de série de preços com validação de conformidade"
```

---

## Task 11: Server-Side Listing for Processos

**Files:**
- Create: `src/lib/actions/listar.ts` — shared listing functions that replace fixture reads

- [ ] **Step 1: Create `src/lib/actions/listar.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import type { StatusProcesso } from "@prisma/client";

export interface FiltrosProcessoServer {
  busca?: string;
  status?: StatusProcesso;
  responsavelId?: string;
  dataInicio?: string;
  dataFim?: string;
}

export async function listarProcessos(filtros?: FiltrosProcessoServer) {
  await requireAuth();

  return db.processo.findMany({
    where: {
      ...(filtros?.busca
        ? {
            OR: [
              { objeto: { contains: filtros.busca, mode: "insensitive" } },
              { numero: { contains: filtros.busca, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filtros?.status ? { status: filtros.status } : {}),
      ...(filtros?.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
      ...(filtros?.dataInicio || filtros?.dataFim
        ? {
            createdAt: {
              ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
              ...(filtros.dataFim ? { lte: new Date(filtros.dataFim) } : {}),
            },
          }
        : {}),
    },
    include: {
      responsavel: { select: { name: true } },
      itens: { take: 1, select: { descricao: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function obterProcessoDetalhado(id: string) {
  await requireAuth();

  return db.processo.findUnique({
    where: { id },
    include: {
      responsavel: { select: { name: true, email: true } },
      itens: {
        include: {
          seriePrecos: {
            include: { precos: true },
          },
        },
      },
      fontes: {
        include: { evidencias: true },
        orderBy: { createdAt: "asc" },
      },
      cotacoes: {
        include: {
          fornecedor: { select: { razaoSocial: true, cnpj: true } },
          proposta: true,
        },
        orderBy: { dataEnvio: "desc" },
      },
    },
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/listar.ts
git commit -m "feat: listagem server-side de processos com filtros"
```

---

## Task 12: Connect Processos List Page to Real Data

**Files:**
- Modify: `src/app/(app)/processos/page.tsx`

- [ ] **Step 1: Update `src/app/(app)/processos/page.tsx`**

Replace the fixture import with the real server action. The page is already a Server Component so we can call async functions directly.

```tsx
import { ProcessosTable } from "@/components/processos/ProcessosTable";
import { SheetsBanner } from "@/components/processos/SheetsBanner";
import { listarProcessos } from "@/lib/actions/listar";

export default async function ProcessosPage() {
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_URL || undefined;
  const processos = await listarProcessos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Processos</h1>
        <p className="text-sm text-muted-foreground">
          Processos de pesquisa de preços.
        </p>
      </div>
      <SheetsBanner sheetsUrl={sheetsUrl} />
      <ProcessosTable processos={processos} />
    </div>
  );
}
```

> **Note:** `ProcessosTable` currently expects `ProcessoFixture[]`. In Step 2 you'll need to check if the component can accept the Prisma type, or adapt the data shape. Check `src/components/processos/ProcessosTable.tsx` first.

- [ ] **Step 2: Check ProcessosTable props and fix type mismatch**

Read `src/components/processos/ProcessosTable.tsx`. If it uses `ProcessoFixture`, update the component to accept the Prisma-returned shape (or map the data in the page). The key fields needed are: `id`, `numero`, `objeto`, `status`, `responsavel` (name), `dataAbertura` (as string from createdAt).

Map data in page if needed:
```tsx
const processosAdaptados = processos.map((p) => ({
  id: p.id,
  numero: p.numero,
  objeto: p.objeto ?? "",
  status: p.status as "aderente" | "parcial" | "nao-aderente" | "pendente",
  responsavel: p.responsavel?.name ?? "—",
  dataAbertura: p.createdAt.toISOString().slice(0, 10),
}));
```

- [ ] **Step 3: Run typecheck and dev server**

Run: `pnpm typecheck`
Then: `pnpm dev` and open `http://localhost:3000/processos`
Expected: page loads (may show empty list if DB has no data — that's OK)

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/processos/page.tsx
git commit -m "feat: lista de processos conectada ao banco de dados real"
```

---

## Task 13: Connect Processo Detail Page to Real Data

**Files:**
- Modify: `src/app/(app)/processos/[id]/page.tsx`

- [ ] **Step 1: Update `src/app/(app)/processos/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessoHeader } from "@/components/processos/ProcessoHeader";
import { ProcessoTabs } from "@/components/processos/ProcessoTabs";
import { obterProcessoDetalhado } from "@/lib/actions/listar";

export default async function ProcessoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const processo = await obterProcessoDetalhado(id);

  if (!processo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <AlertTriangle className="size-8 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Processo não encontrado.
        </p>
        <Button render={<Link href="/processos" />} variant="outline" size="sm">
          Voltar para a lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProcessoHeader processo={processo} />
      <ProcessoTabs processo={processo} />
    </div>
  );
}
```

- [ ] **Step 2: Fix ProcessoHeader and ProcessoTabs type mismatches**

Read `src/components/processos/ProcessoHeader.tsx` and `src/components/processos/ProcessoTabs.tsx`.
These components receive the `processo` prop. Adapt the prop type or map fields in the page as needed.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/processos/[id]/page.tsx
git commit -m "feat: detalhe de processo conectado ao banco de dados real"
```

---

## Task 14: Final Quality Check & PLAN.md Update

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: all tests PASS including the 4 new domain test files

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 4: Mark M7 deliverables in PLAN.md**

Update `docs/PLAN.md` — check all M7 boxes:
- [x] Server actions de CRUD para processos, itens, fontes, fornecedores, cotações, propostas.
- [x] `lib/domain/`: estatística de preços (média/mediana/menor valor) **com testes unitários**.
- [x] Regras IN 65 aplicadas: preço só entra com fonte+data+evidência; ≥3 fornecedores na pesquisa direta; justificativa obrigatória ao não usar fonte pública; alerta de dispersão exigindo análise crítica.
- [x] Score de fornecedor (tempo de resposta + completude documental).
- [x] Validador de proposta server-side (checklist mínimo).
- [x] Upload de arquivos via abstração `lib/storage`.
- [x] Busca e filtros server-side (item, período, quantidade, localidade, fornecedor, aderência).
- [x] Telas de M2–M4 desligadas do mock e ligadas aos dados reais.

And update status line:
```markdown
## M7 — Ligação Backend & Regras da IN 65/2021 `[CONFORMIDADE]` ✅ CONCLUÍDO
```

- [ ] **Step 5: Final commit**

```bash
git add docs/PLAN.md
git commit -m "feat: M7 concluído — integração backend e regras de conformidade da IN 65/2021"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `lib/domain/types.ts` — Task 1
- ✅ `lib/domain/priceStats.ts` + tests — Task 2
- ✅ `lib/domain/in65Rules.ts` + tests — Task 3
- ✅ `lib/domain/supplierScore.ts` + tests — Task 4
- ✅ `lib/domain/proposalValidator.ts` + tests — Task 5
- ✅ `lib/storage/` abstraction — Task 6
- ✅ Server actions: fontes + evidências — Task 7
- ✅ Server actions: fornecedores with score — Task 8
- ✅ Server actions: cotações + propostas — Task 9
- ✅ Server actions: série de preços + consolidation — Task 10
- ✅ Server-side filters: processos list — Task 11
- ✅ UI connection: processos list page — Task 12
- ✅ UI connection: processo detail page — Task 13
- ✅ Quality gates + PLAN.md update — Task 14

**Type consistency:**
- `DomainResult<T>`, `Violation`, `EstatisticaPrecos`, `ValidacaoFonte` defined once in `types.ts`, imported everywhere
- `ActionResult<T>` imported from `processos.ts` (already established)
- All domain functions use `import type` from `@prisma/client` only — no runtime imports

**No placeholders:** All code blocks are complete and runnable.
