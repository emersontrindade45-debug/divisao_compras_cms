import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lerAba: vi.fn(), localizarAba: vi.fn(), client: vi.fn() }));

vi.mock("../googleAuth", () => ({
  lerAbaAutenticado: mocks.lerAba,
  getSheetsClient: mocks.client,
}));
vi.mock("../escreverCandidatoNaPlanilha", () => ({
  localizarAbaDeDados: mocks.localizarAba,
  getSheetsClientCompartilhado: mocks.client,
}));

import { lerCnpjsJaConsultadosNoProcesso } from "../lerConsultasPorProcesso";

const CABECALHO = ["#", "Nome/Razão Social", "CPF/CNPJ", "Situação", "Processos Cotação"];

function planilha(linhas: string[][]) {
  mocks.lerAba.mockResolvedValue([CABECALHO, ...linhas]);
}

describe("lerCnpjsJaConsultadosNoProcesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FORNECEDORES_SHEETS_URL =
      "https://docs.google.com/spreadsheets/d/abc123/edit";
    mocks.localizarAba.mockResolvedValue("Fornecedores");
  });

  it("devolve os CNPJs que já têm aquele processo na célula", async () => {
    planilha([
      ["1", "Alfa", "11.111.111/0001-11", "Ativa", "908/2024"],
      ["2", "Bravo", "22.222.222/0001-22", "Ativa", "13137/2024"],
      ["3", "Charlie", "33.333.333/0001-33", "Ativa", "908/2024, 105/2026"],
    ]);

    const r = await lerCnpjsJaConsultadosNoProcesso("908/2024");

    expect([...r].sort()).toEqual(["11.111.111/0001-11", "33.333.333/0001-33"]);
  });

  it("NÃO exclui empresa trabalhada em outro processo (exclusão é por processo)", async () => {
    planilha([["1", "Alfa", "11.111.111/0001-11", "Ativa", "908/2024"]]);

    const r = await lerCnpjsJaConsultadosNoProcesso("13137/2024");

    expect(r.size).toBe(0);
  });

  it("não casa por prefixo: '908/2024' não é excluído ao buscar '8/2024'", async () => {
    planilha([["1", "Alfa", "11.111.111/0001-11", "Ativa", "908/2024"]]);

    const r = await lerCnpjsJaConsultadosNoProcesso("8/2024");

    expect(r.size).toBe(0);
  });

  it("ignora a linha de cabeçalho", async () => {
    planilha([["1", "Alfa", "11.111.111/0001-11", "Ativa", "908/2024"]]);

    const r = await lerCnpjsJaConsultadosNoProcesso("908/2024");

    expect(r.has("CPF/CNPJ")).toBe(false);
  });

  it("devolve vazio quando não há processo informado (não filtra nada)", async () => {
    const r = await lerCnpjsJaConsultadosNoProcesso("   ");

    expect(r.size).toBe(0);
    expect(mocks.lerAba).not.toHaveBeenCalled();
  });

  it("devolve vazio quando a planilha não está configurada", async () => {
    delete process.env.FORNECEDORES_SHEETS_URL;

    const r = await lerCnpjsJaConsultadosNoProcesso("908/2024");

    expect(r.size).toBe(0);
  });

  it("tolera célula de processos vazia ou com vírgulas soltas", async () => {
    planilha([
      ["1", "Alfa", "11.111.111/0001-11", "Ativa", ""],
      ["2", "Bravo", "22.222.222/0001-22", "Ativa", " , 908/2024 , "],
    ]);

    const r = await lerCnpjsJaConsultadosNoProcesso("908/2024");

    expect([...r]).toEqual(["22.222.222/0001-22"]);
  });
});
