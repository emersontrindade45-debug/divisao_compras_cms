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
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/sheets/googleSheets", () => ({
  carregarPlanilha: mocks.carregarPlanilha,
  extrairObjetoDoTitulo: (titulo: string | null) => titulo,
}));

import { parseCsv } from "@/lib/sheets/csv";
import { sincronizarPlanilha } from "../sincronizarPlanilha";

const USER = { id: "user-1", role: "pesquisa", email: "u@e.com" };

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
