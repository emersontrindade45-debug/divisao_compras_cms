import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    processo: { upsert: vi.fn() },
    item: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    seriePreco: { deleteMany: vi.fn(), create: vi.fn() },
  },
  requireAuth: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  carregarPlanilha: vi.fn(),
  registrarMarcosProcesso: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/indicadores/marcos", () => ({
  registrarMarcosProcesso: mocks.registrarMarcosProcesso,
}));
vi.mock("@/lib/sheets/googleSheets", () => ({
  carregarPlanilha: mocks.carregarPlanilha,
  extrairObjetoDoTitulo: (titulo: string | null) => titulo,
}));

import { parseCsv } from "@/lib/sheets/csv";
import { sincronizarPlanilha } from "../sincronizarPlanilha";

const USER = { id: "user-1", role: "pesquisa", email: "u@e.com", name: "Ana Analista" };

const CSV_MEDIANA_VAZIA = [
  '"","","","","","QTDE.\nMÍN","","MATERIAL","PREÇO PÚBLICO I"',
  '"","","","","1","","15","e-CPF Tipo A3 c/ Token",""',
  '"","","","","2","","6","e-CNPJ Tipo A3 c/ Token",""',
].join("\n");

describe("sincronizarPlanilha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.db.processo.upsert.mockResolvedValue({
      id: "proc-1",
      numero: "2433/2025",
      dataAbertura: new Date("2025-01-01"),
    });
    mocks.db.item.findMany.mockResolvedValue([]);
    mocks.db.item.create.mockImplementation(async ({ data }: { data: { descricao: string } }) => ({
      id: `item-${data.descricao.slice(0, 8)}`,
    }));
  });

  it("devolve erro descritivo quando a aba tem MATERIAL mas nenhuma linha de item", async () => {
    mocks.carregarPlanilha.mockResolvedValue({
      numeroProcesso: "2433/2025",
      titulo: "Proc_2433/2025",
      rows: parseCsv('"LIMITE INFERIOR","MEDIANA","MATERIAL"\n"LOTE 01","",""'),
      abaNome: "Modelo",
    });

    const res = await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit");

    expect(res.data).toBeUndefined();
    expect(res.error).toMatch(/nenhuma linha com texto nessa coluna/i);
    expect(mocks.db.processo.upsert).not.toHaveBeenCalled();
  });

  it("importa itens mesmo com mediana vazia (planilha nova, pesquisa ainda não feita)", async () => {
    mocks.carregarPlanilha.mockResolvedValue({
      numeroProcesso: "2433/2025",
      titulo: "e-CPF e e-CNPJ - Proc_2433/2025",
      rows: parseCsv(CSV_MEDIANA_VAZIA),
      abaNome: "Modelo",
    });

    const res = await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit");

    expect(res.error).toBeUndefined();
    expect(res.data).toEqual({
      numero: "2433/2025",
      itensImportados: 2,
      precosImportados: 0,
    });
    expect(mocks.db.item.create).toHaveBeenCalledTimes(2);
    expect(mocks.db.item.create.mock.calls[0]![0].data.descricao).toContain("e-CPF");
    expect(mocks.db.item.create.mock.calls[1]![0].data.descricao).toContain("e-CNPJ");
  });
});

describe("sincronizarPlanilha — dados de origem do dashboard (M30.0)", () => {
  const CSV_COM_PRECO = [
    '"LIMITE INFERIOR","MEDIANA","MATERIAL","PREÇO PÚBLICO I"',
    '"","10,00","Caneta azul","10,00"',
  ].join("\n");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.db.processo.upsert.mockResolvedValue({
      id: "proc-1",
      numero: "2433/2025",
      dataAbertura: new Date("2025-01-01"),
    });
    mocks.db.item.findMany.mockResolvedValue([]);
    mocks.db.item.create.mockResolvedValue({ id: "item-1" });
    mocks.carregarPlanilha.mockResolvedValue({
      numeroProcesso: "2433/2025",
      titulo: "Proc_2433/2025",
      rows: parseCsv(CSV_MEDIANA_VAZIA),
      abaNome: "Modelo",
    });
  });

  function argCreate() {
    return (mocks.db.processo.upsert.mock.calls[0]![0] as { create: Record<string, unknown> })
      .create;
  }

  it("usa a data informada, marca a origem e define quem importou como responsável", async () => {
    await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit", "2026-03-10");

    const create = argCreate();
    expect((create.dataAbertura as Date).toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(create.dataAberturaOrigem).toBe("informada");
    expect(create.responsavelId).toBe("user-1");
    expect(create.responsavel).toBe("Ana Analista");
    expect(create.marcosIncertos).toBe(false);
  });

  it("sem data informada, nasce com origem `importacao` (fora das métricas de tempo)", async () => {
    await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit");

    expect(argCreate().dataAberturaOrigem).toBe("importacao");
  });

  it("planilha que já chega com preço deixa os marcos incertos", async () => {
    mocks.carregarPlanilha.mockResolvedValue({
      numeroProcesso: "2433/2025",
      titulo: "Proc_2433/2025",
      rows: parseCsv(CSV_COM_PRECO),
      abaNome: "Modelo",
    });

    await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit", "2026-03-10");

    expect(argCreate().marcosIncertos).toBe(true);
  });

  it("não sobrescreve data, origem nem responsável numa ressincronização", async () => {
    await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit", "2026-03-10");

    const update = (mocks.db.processo.upsert.mock.calls[0]![0] as { update: Record<string, unknown> })
      .update;
    expect(update).not.toHaveProperty("dataAbertura");
    expect(update).not.toHaveProperty("dataAberturaOrigem");
    expect(update).not.toHaveProperty("responsavelId");
  });

  it("recusa data futura sem gravar nada", async () => {
    const res = await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit", "2999-01-01");

    expect(res.error).toMatch(/futuro/);
    expect(mocks.db.processo.upsert).not.toHaveBeenCalled();
  });

  it("grava os marcos do processo ao fim da sincronização", async () => {
    await sincronizarPlanilha("https://docs.google.com/spreadsheets/d/abc/edit", "2026-03-10");

    expect(mocks.registrarMarcosProcesso).toHaveBeenCalledWith(mocks.db, "proc-1", expect.any(Date));
  });
});
