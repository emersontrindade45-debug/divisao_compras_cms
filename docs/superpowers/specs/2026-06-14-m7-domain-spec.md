# Spec — M7: `lib/domain/` Estatística de Preços & Conformidade IN 65/2021

**Data:** 2026-06-14
**Branch:** `feat/backend-integracao`
**Base normativa:** [docs/regulamentos-cms.md](../../regulamentos-cms.md)
**Milestone:** M7 — Ligação Backend & Regras da IN 65/2021

---

## Contexto

O `lib/domain/` é o núcleo de maior risco do M7. Contém toda a lógica de conformidade com a
IN SEGES/ME nº 65/2021 e o Ato da Mesa nº 17/2023 (CMS). Essas funções são **puras** — sem
acesso ao banco, sem side effects — e cobertas por testes unitários. As Server Actions consomem
os retornos do domínio e decidem o que persistir, bloquear ou alertar.

**Decisões fixadas (não reabrir sem justificativa):**
- Critério de discrepância: Ato da Mesa nº 17/2023 prevalece sobre qualquer outra norma.
- Evidência obrigatória: todos os tipos de fonte exigem ≥ 1 `Evidencia` com `dataHoraAcesso`.
- Limiar de dispersão: CV > 30% dispara alerta de análise crítica.
- Score de fornecedor: 60% taxa de resposta + 40% velocidade.
- Exceções (< 3 fornecedores, não uso de fonte pública): bloqueia por padrão; libera com
  justificativa aprovada por papel `aprovacao`.

---

## 1. Estrutura de Arquivos

```
src/lib/domain/
├── types.ts                        # tipos compartilhados do domínio
├── priceStats.ts                   # cálculo estatístico da série de preços
├── in65Rules.ts                    # regras de conformidade IN 65 / Ato da Mesa
├── supplierScore.ts                # score de fornecedor
├── proposalValidator.ts            # validação de checklist de proposta
├── status.ts                       # (existente — manter sem alteração)
├── processoFilter.ts               # (existente — atualizar para tipos reais no M7)
└── __tests__/
    ├── status.test.ts              # (existente)
    ├── processoFilter.test.ts      # (existente)
    ├── priceStats.test.ts          # novo
    ├── in65Rules.test.ts           # novo
    ├── supplierScore.test.ts       # novo
    └── proposalValidator.test.ts   # novo
```

Nenhum arquivo de domínio importa `@/lib/db`, `prisma`, `fetch` ou qualquer módulo Next.js.
Tipos do Prisma entram apenas como `import type`.

---

## 2. Tipos Compartilhados (`types.ts`)

```ts
export interface Violation {
  code: string      // código da regra no regulamentos-cms.md (ex: "R-02", "OP-ADH-04")
  rule: string      // descrição humana legível
  severity: "block" | "warn" | "info"
  // "block" → impede consolidação; requer aprovação de papel `aprovacao`
  // "warn"  → exige justificativa do usuário para prosseguir
  // "info"  → apenas informativo, sem impedimento
}

export interface DomainResult<T> {
  value: T
  valid: boolean          // false quando há ao menos uma violation com severity "block"
  violations: Violation[]
}

export interface EstatisticaPrecos {
  media: number
  mediana: number
  menorValor: number
  coeficienteVariacao: number   // percentual, ex: 28.5
  totalPrecos: number           // todos os preços antes da exclusão
  precosIncluidos: number       // após exclusão de discrepantes
  precosExcluidos: number
  valorEstimado: number         // resultado do método escolhido
}

export interface ValidacaoFonte {
  fonteId: string
  valida: boolean
  motivo?: string
}
```

---

## 3. `priceStats.ts` — Estatística de Preços

### 3.1 `excluirDiscrepantes`

```ts
function excluirDiscrepantes(
  precos: number[],
  tipoObjeto: "aquisicao" | "obra"
): {
  incluidos: number[]
  excluidos: number[]
  limiteInferior: number
  limiteSuperior: number
}
```

**Lógica:**
1. Calcular mediana do conjunto completo.
2. Tolerância: `0.30` para `"aquisicao"`, `0.75` para `"obra"`.
   - Norma: Ato da Mesa nº 17/2023, art. 57, II e III (redação do Ato nº 4/2024).
3. `limiteInferior = mediana * (1 - tolerancia)`, `limiteSuperior = mediana * (1 + tolerancia)`.
4. Incluídos: preços dentro do intervalo `[limiteInferior, limiteSuperior]`.

**Edge cases:**
- Lista vazia → retorna `{ incluidos: [], excluidos: [], limiteInferior: 0, limiteSuperior: 0 }`.
- Lista com 1 elemento → nenhum excluído (mediana = o próprio elemento).

### 3.2 `calcularEstatisticas`

```ts
function calcularEstatisticas(
  precosIncluidos: number[],
  metodo: "media" | "mediana" | "menor_valor"
): DomainResult<EstatisticaPrecos>
```

**Lógica:**
1. Se `precosIncluidos.length < 3` → `valid: false`, violation `block`:
   ```
   code: "OP-ADH-04"
   rule: "Quadro Demonstrativo exige ≥ 3 preços válidos após tratamento estatístico"
   severity: "block"
   ```
   Norma: Ato da Mesa nº 17/2023, art. 58.

2. Calcular `media`, `mediana`, `menorValor`.
3. `coeficienteVariacao = (desvioPadrao / media) * 100`.
4. Se `CV > 30` → violation `warn`:
   ```
   code: "R-06"
   rule: "Grande dispersão de preços: análise crítica obrigatória (CV > 30%)"
   severity: "warn"
   ```
   Norma: IN 65/2021 art. 8º; Ato da Mesa nº 17/2023, art. 55, §2º.
5. `valorEstimado` = resultado do método escolhido.

**Mediana:** para lista par, média dos dois elementos centrais após ordenação.

### 3.3 `validarEvidenciasFontes`

```ts
function validarEvidenciasFontes(
  fontes: Array<{
    id: string
    evidencias: Array<{ dataHoraAcesso: Date }>
  }>
): DomainResult<ValidacaoFonte[]>
```

**Lógica:**
- Todos os tipos de fonte exigem ≥ 1 evidência com `dataHoraAcesso` preenchido.
- Norma: IN 65/2021 art. 3º, §1º — R-02; Ato da Mesa nº 17/2023, art. 53, VII.
- Para cada fonte sem evidência → violation `block`:
  ```
  code: "R-02"
  rule: "Preço sem evidência vinculada (fonte + data + evidência obrigatórios)"
  severity: "block"
  ```
- `valid: false` se qualquer fonte falhar.

---

## 4. `in65Rules.ts` — Regras de Conformidade

### 4.1 `validarMinFornecedores`

```ts
function validarMinFornecedores(
  fornecedoresConsultados: number,
  comJustificativa: boolean
): DomainResult<void>
```

**Lógica:**
- `fornecedoresConsultados >= 3` → `valid: true`, sem violations.
- `< 3` e `comJustificativa = false` → violation `block`:
  ```
  code: "R-03"
  rule: "Pesquisa direta exige ≥ 3 fornecedores consultados"
  severity: "block"
  ```
- `< 3` e `comJustificativa = true` → violation `warn` (requer aprovação de papel `aprovacao`):
  ```
  code: "OP-EXC-01"
  rule: "Exceção: < 3 fornecedores com justificativa — requer aprovação"
  severity: "warn"
  ```
- `0` fornecedores → `block` independente de justificativa.
- Norma: IN 65/2021 art. 5º, §4º; Ato da Mesa nº 17/2023, art. 55, §4º.

### 4.2 `validarFontePublica`

```ts
function validarFontePublica(
  usouFontePublica: boolean,
  justificativa?: string
): DomainResult<void>
```

**Lógica:**
- `usouFontePublica = true` → `valid: true`.
- `false` e sem justificativa → violation `block`:
  ```
  code: "R-07"
  rule: "Fonte pública não utilizada sem justificativa registrada"
  severity: "block"
  ```
- `false` com justificativa → violation `warn`:
  ```
  code: "OP-EXC-02"
  rule: "Não uso de fonte pública com justificativa — requer aprovação"
  severity: "warn"
  ```
- Norma: IN 65/2021 art. 4º, §2º; Ato da Mesa nº 17/2023, art. 54, §1º.

### 4.3 `validarValidadeFontes`

```ts
function validarValidadeFontes(
  fontes: Array<{
    fonteId: string
    tipo: "contratacao_publica" | "site_eletronico" | "fornecedor_direto"
    dataReferencia: Date
  }>,
  dataReferenciaCalculo: Date
): DomainResult<Array<{ fonteId: string, valida: boolean, diasRestantes: number }>>
```

**Janelas de validade** (Ato da Mesa nº 17/2023, art. 60):
| Tipo | Janela | Código |
|---|---|---|
| `contratacao_publica` | 12 meses (365 dias) | OP-SLA-06 |
| `site_eletronico` | 90 dias | OP-SLA-04 |
| `fornecedor_direto` | 180 dias | OP-SLA-03 |

- Fonte fora da janela → violation `block` com `code` correspondente.
- `diasRestantes` pode ser negativo (expirada há N dias).

### 4.4 `validarRegistroNaoRespondentes`

```ts
function validarRegistroNaoRespondentes(
  fornecedoresConsultados: string[],
  fornecedoresQueResponderam: string[]
): DomainResult<{ naoResponderam: string[] }>
```

**Lógica:**
- `naoResponderam = fornecedoresConsultados - fornecedoresQueResponderam`.
- Se `naoResponderam.length > 0` e não há registro formal → violation `warn`:
  ```
  code: "R-04"
  rule: "Fornecedores sem resposta devem ter registro formal no processo"
  severity: "warn"
  ```
- Norma: IN 65/2021 art. 5º, §5º; Ato da Mesa nº 17/2023, art. 56, IV.

---

## 5. `supplierScore.ts` — Score de Fornecedor

```ts
function calcularScore(dados: {
  totalCotacoes: number
  totalRespostas: number
  historicoRespostas: Array<{
    dataEnvio: Date
    dataResposta?: Date
  }>
}): DomainResult<{
  score: number
  taxaResposta: number
  velocidadeMedia: number
  breakdown: { pontosResposta: number, pontosVelocidade: number }
}>
```

**Fórmula:**
- `taxaResposta = (totalRespostas / totalCotacoes) * 100` (0–100%).
- `pontosResposta = taxaResposta * 0.60` (máx 60 pontos).
- `velocidadeMedia` = média de dias entre `dataEnvio` e `dataResposta` apenas das respondidas.
- `pontosVelocidade`: linear entre 0 dias (40 pts) e ≥ 10 dias (0 pts).
  - `pontosVelocidade = max(0, 40 - (velocidadeMedia * 4))`.
- `score = round(pontosResposta + pontosVelocidade)` — inteiro 0–100.
- `totalCotacoes = 0` → `score = 0`, `valid: true` (sem cotações não é violação).

---

## 6. `proposalValidator.ts` — Validação de Proposta

```ts
function validarProposta(proposta: {
  cnpj?: string
  descricaoObjeto?: string
  valorUnitario?: number
  valorTotal?: number
  dataEmissao?: Date
  nomeResponsavel?: string
},
dataReferenciaCalculo: Date
): DomainResult<{
  itens: Array<{
    campo: string
    status: "valido" | "ressalva" | "invalido"
    motivo?: string
  }>
  statusGeral: "valida" | "com_ressalva" | "invalida"
}>
```

**Checklist mínimo** (Ato da Mesa nº 17/2023, art. 56, II):
| Campo | Ausente | Fora do prazo |
|---|---|---|
| `cnpj` | `invalido` / block | — |
| `descricaoObjeto` | `invalido` / block | — |
| `valorUnitario` | `invalido` / block | — |
| `valorTotal` | `invalido` / block | — |
| `dataEmissao` | `invalido` / block | `ressalva` / warn se > 180 dias |
| `nomeResponsavel` | `invalido` / block | — |

- `statusGeral = "invalida"` se qualquer campo `invalido`.
- `statusGeral = "com_ressalva"` se nenhum `invalido` mas algum `ressalva`.
- `statusGeral = "valida"` se todos `valido`.
- Violation para `dataEmissao > 180 dias`:
  ```
  code: "OP-SLA-03"
  rule: "Proposta com data de emissão superior a 180 dias — validade expirada"
  severity: "warn"
  ```

---

## 7. Testes Unitários — Casos Obrigatórios

### `priceStats.test.ts`
- `excluirDiscrepantes`: preço 31% acima da mediana → excluído (aquisição)
- `excluirDiscrepantes`: preço 29% acima da mediana → incluído (aquisição)
- `excluirDiscrepantes`: preço 74% acima da mediana → incluído (obra)
- `excluirDiscrepantes`: preço 76% acima da mediana → excluído (obra)
- `calcularEstatisticas`: lista com 2 preços → `valid: false`, violation `OP-ADH-04`
- `calcularEstatisticas`: CV > 30% → `valid: true` com violation `warn` R-06
- `calcularEstatisticas`: mediana de lista par = média dos dois centrais
- `validarEvidenciasFontes`: fonte sem evidência → `valid: false`, violation `R-02`
- `validarEvidenciasFontes`: todas com evidência → `valid: true`

### `in65Rules.test.ts`
- `validarMinFornecedores`: 2 fornecedores sem justificativa → `block` R-03
- `validarMinFornecedores`: 2 fornecedores com justificativa → `warn` OP-EXC-01
- `validarMinFornecedores`: 0 fornecedores com justificativa → `block` R-03
- `validarMinFornecedores`: 3 fornecedores → `valid: true`
- `validarFontePublica`: não usou sem justificativa → `block` R-07
- `validarFontePublica`: não usou com justificativa → `warn` OP-EXC-02
- `validarValidadeFontes`: contratação com 366 dias → `block` OP-SLA-06
- `validarValidadeFontes`: contratação com 364 dias → `valid: true`
- `validarValidadeFontes`: site com 91 dias → `block` OP-SLA-04
- `validarValidadeFontes`: fornecedor com 181 dias → `block` OP-SLA-03
- `validarRegistroNaoRespondentes`: 1 não respondente → violation `warn` R-04

### `supplierScore.test.ts`
- Taxa 100%, velocidade 0 dias → score 100
- Taxa 0%, qualquer velocidade → score 0
- Taxa 50%, velocidade 5 dias → score 50 (30 + 20)
- Taxa 100%, velocidade 10 dias → score 60 (60 + 0)
- 0 cotações → score 0, `valid: true`

### `proposalValidator.test.ts`
- Todos os campos presentes e válidos → `statusGeral: "valida"`
- `cnpj` ausente → `statusGeral: "invalida"`, violation `block`
- `dataEmissao` com 181 dias → `statusGeral: "com_ressalva"`, violation `warn` OP-SLA-03
- `valorUnitario` ausente + `dataEmissao` vencida → `statusGeral: "invalida"`

---

## 8. Contrato com Server Actions

As Server Actions (implementadas na próxima etapa do M7) consomem o domínio assim:

```ts
// Exemplo: consolidar série de preços
const estatResult = calcularEstatisticas(precos, metodo)
if (!estatResult.valid) {
  // violations "block" → retornar erro para a UI
  return { error: estatResult.violations.filter(v => v.severity === "block") }
}
if (estatResult.violations.some(v => v.severity === "warn")) {
  // exigir justificativa do usuário antes de persistir
}
// persistir via Prisma
```

O domínio **nunca** decide o que persistir — só informa o resultado. A decisão é da Server Action.

---

## 9. Critério de Aceite do Domínio

- Todos os testes unitários listados na Seção 7 passam (`pnpm test`).
- Nenhum arquivo de `lib/domain/` importa Prisma ou módulos Next.js.
- `pnpm typecheck` passa sem erros.
- Cada função tem ao menos um teste para o caminho feliz e um para cada violation.
