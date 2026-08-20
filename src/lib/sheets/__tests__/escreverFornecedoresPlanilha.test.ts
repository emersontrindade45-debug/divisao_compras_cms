import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  valuesGet: vi.fn(),
  valuesBatchUpdate: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../googleAuth", () => ({
  getSheetsClient: () => ({
    spreadsheets: {
      get: mocks.get,
      values: { get: mocks.valuesGet, batchUpdate: mocks.valuesBatchUpdate },
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: { fornecedor: { findMany: mocks.findMany } },
}));

import { escreverFornecedoresPlanilha } from "../escreverFornecedoresPlanilha";

const CABECALHO = [
  "#",
  "Tags",
  "Nome/Razão Social",
  "CPF/CNPJ",
  "Telefone",
  "Telefone 2",
  "E-mail",
  "Contato",
  "Município",
  "UF",
];

const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/abc123xyz/edit?gid=0#gid=0";

function linha(linhaId: string, parcial: { cidade?: string; razaoSocial?: string } = {}): string[] {
  const row = Array.from({ length: CABECALHO.length }, () => "");
  row[0] = linhaId;
  row[2] = parcial.razaoSocial ?? "EMPRESA EXEMPLO LTDA";
  row[8] = parcial.cidade ?? "";
  return row;
}

function fornecedorDb(linhaId: string, cidade: string) {
  return {
    id: `id-${linhaId}`,
    origemPlanilhaLinhaId: linhaId,
    razaoSocial: "EMPRESA EXEMPLO LTDA",
    categoria: [] as string[],
    cidade,
    estado: "",
    email: "",
    emailsAdicionais: [] as string[],
    telefone: null as string | null,
  };
}

describe("escreverFornecedoresPlanilha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FORNECEDORES_SHEETS_URL", URL_PLANILHA);
    mocks.get.mockResolvedValue({
      data: { sheets: [{ properties: { title: "Fornecedores", sheetId: 0 } }] },
    });
    mocks.valuesGet.mockResolvedValue({
      data: { values: [CABECALHO, linha("1")] },
    });
    mocks.findMany.mockResolvedValue([fornecedorDb("1", "Santos")]);
    mocks.valuesBatchUpdate.mockResolvedValue({ data: {} });
  });

  it("não importa server-only — o script tsx chama este módulo fora do bundler (CLAUDE.md §9.62)", () => {
    for (const relativo of [
      "src/lib/sheets/escreverFornecedoresPlanilha.ts",
      "src/lib/sheets/googleAuth.ts",
      "src/lib/sheets/planejarEscritaFornecedoresPlanilha.ts",
    ]) {
      const fonte = readFileSync(join(process.cwd(), relativo), "utf8");
      expect(fonte, relativo).not.toMatch(/^\s*import\s+["']server-only["']/m);
    }
  });

  it("lê Fornecedor com select explícito (sem include) só de quem tem origemPlanilhaLinhaId", async () => {
    await escreverFornecedoresPlanilha({ dryRun: true });

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    const argumento = mocks.findMany.mock.calls[0]![0] as {
      where: unknown;
      select: unknown;
      include?: unknown;
    };
    expect(argumento.where).toEqual({ origemPlanilhaLinhaId: { not: null } });
    expect(argumento.include).toBeUndefined();
    expect(argumento.select).toEqual({
      id: true,
      origemPlanilhaLinhaId: true,
      razaoSocial: true,
      categoria: true,
      cidade: true,
      estado: true,
      email: true,
      emailsAdicionais: true,
      telefone: true,
    });
  });

  it("em dry-run planeja as células mas não chama batchUpdate", async () => {
    const resultado = await escreverFornecedoresPlanilha({ dryRun: true });

    expect(resultado.dryRun).toBe(true);
    expect(resultado.celulasEscritas).toBe(0);
    expect(resultado.lotesEnviados).toBe(0);
    expect(resultado.atualizacoes).toEqual([
      expect.objectContaining({ campo: "cidade", valorNovo: "Santos", linhaPlanilha: 2 }),
    ]);
    expect(mocks.valuesBatchUpdate).not.toHaveBeenCalled();
  });

  it("grava via values.batchUpdate com USER_ENTERED e o range A1 da célula", async () => {
    const resultado = await escreverFornecedoresPlanilha();

    expect(resultado.dryRun).toBe(false);
    expect(resultado.celulasEscritas).toBe(1);
    expect(resultado.lotesEnviados).toBe(1);
    expect(mocks.valuesBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.valuesBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "abc123xyz",
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [{ range: "'Fornecedores'!I2", values: [["Santos"]] }],
      },
    });
  });

  it("não chama batchUpdate quando não há célula a preencher, mesmo fora de dry-run", async () => {
    mocks.findMany.mockResolvedValue([fornecedorDb("1", "")]);

    const resultado = await escreverFornecedoresPlanilha();

    expect(resultado.celulasEscritas).toBe(0);
    expect(mocks.valuesBatchUpdate).not.toHaveBeenCalled();
  });

  it("parte a escrita em lotes quando há mais células que o tamanho configurado", async () => {
    mocks.valuesGet.mockResolvedValue({
      data: { values: [CABECALHO, linha("1"), linha("2"), linha("3")] },
    });
    mocks.findMany.mockResolvedValue([
      fornecedorDb("1", "Santos"),
      fornecedorDb("2", "São Vicente"),
      fornecedorDb("3", "Guarujá"),
    ]);

    const resultado = await escreverFornecedoresPlanilha({ tamanhoLote: 2 });

    expect(resultado.celulasEscritas).toBe(3);
    expect(resultado.lotesEnviados).toBe(2);
    expect(mocks.valuesBatchUpdate).toHaveBeenCalledTimes(2);
    const tamanhos = mocks.valuesBatchUpdate.mock.calls.map(
      (call) => (call[0] as { requestBody: { data: unknown[] } }).requestBody.data.length,
    );
    expect(tamanhos).toEqual([2, 1]);
  });

  it("falha sem chamar a API quando FORNECEDORES_SHEETS_URL está ausente", async () => {
    vi.stubEnv("FORNECEDORES_SHEETS_URL", "");

    await expect(escreverFornecedoresPlanilha({ dryRun: true })).rejects.toThrow(
      /FORNECEDORES_SHEETS_URL/,
    );
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
