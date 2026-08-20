import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    categoriaSugeridaPorCnae: { count: vi.fn(), create: vi.fn() },
    fornecedor: { findMany: vi.fn() },
  },
  sugerirCategoriasParaObjeto: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/ia/categorizarObjeto", () => ({
  sugerirCategoriasParaObjeto: mocks.sugerirCategoriasParaObjeto,
}));

import { categorizarCandidatosCnae } from "../categorizarCandidatosCnae";

function sqlDaChamada(call: unknown[] | undefined): string {
  return ((call?.[0] as string[] | undefined) ?? []).join("");
}

const CNAE_FERRAGENS = {
  cnaeCodigo: "4744001",
  cnaeDescricao: "Comercio varejista de ferragens",
};
const CNAE_LIMPEZA = {
  cnaeCodigo: "8121400",
  cnaeDescricao: "Limpeza em predios e em domicilios",
};

describe("categorizarCandidatosCnae", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.categoriaSugeridaPorCnae.count.mockResolvedValue(0);
    mocks.db.categoriaSugeridaPorCnae.create.mockResolvedValue({});
    mocks.db.fornecedor.findMany.mockResolvedValue([
      { categoria: ["ferragens"] },
      { categoria: ["limpeza"] },
    ]);
    mocks.db.$queryRaw.mockResolvedValue([]);
    mocks.db.$executeRaw.mockResolvedValue(0);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);
  });

  it("não importa server-only — o script tsx chama este módulo fora do bundler (CLAUDE.md §9.62)", () => {
    const fonte = readFileSync(
      join(process.cwd(), "src/lib/ingestao/categorizarCandidatosCnae.ts"),
      "utf8",
    );
    expect(fonte).not.toMatch(/import\s+["']server-only["']/);
  });

  it("lista CNAEs distintos ainda fora do cache (GROUP BY + NOT EXISTS), nunca empresa a empresa", async () => {
    await categorizarCandidatosCnae();

    expect(mocks.db.$queryRaw).toHaveBeenCalled();
    const sql = sqlDaChamada(mocks.db.$queryRaw.mock.calls[0]);
    expect(sql).toMatch(/GROUP BY e\."cnaePrincipalCodigo"/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/categorias_sugeridas_por_cnae/);
  });

  it("sugere categorias via IA pela descrição do CNAE, só entre as Tags já cadastradas", async () => {
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS]);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["ferragens"]);

    await categorizarCandidatosCnae();

    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledWith(
      "Comercio varejista de ferragens",
      expect.arrayContaining(["ferragens", "limpeza"]),
    );
    expect(mocks.db.categoriaSugeridaPorCnae.create).toHaveBeenCalledWith({
      data: {
        cnaeCodigo: "4744001",
        cnaeDescricao: "Comercio varejista de ferragens",
        categorias: ["ferragens"],
      },
    });
  });

  it("não chama a IA quando não há categoria cadastrada para escolher", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([{ categoria: [] }]);
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS]);

    await categorizarCandidatosCnae();

    expect(mocks.sugerirCategoriasParaObjeto).not.toHaveBeenCalled();
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
  });

  it("não chama a IA de novo para CNAE já em cache — a query de pendentes é que exclui", async () => {
    mocks.db.categoriaSugeridaPorCnae.count.mockResolvedValue(10);
    mocks.db.$queryRaw.mockResolvedValue([]);

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.cnaesJaEmCache).toBe(10);
    expect(resultado.cnaesEnviadosParaIa).toBe(0);
    expect(mocks.sugerirCategoriasParaObjeto).not.toHaveBeenCalled();
  });

  it("aplica o cache em massa com UPDATE ... FROM e nunca sobrescreve categoriaSugerida já preenchida", async () => {
    mocks.db.$executeRaw.mockResolvedValue(42);

    const resultado = await categorizarCandidatosCnae();

    const sql = sqlDaChamada(mocks.db.$executeRaw.mock.calls[0]);
    expect(sql).toMatch(/UPDATE "empresas_candidatas_fornecedor" AS e/);
    expect(sql).toMatch(/SET "categoriaSugerida" = c\."categorias"/);
    expect(sql).toMatch(/FROM "categorias_sugeridas_por_cnae" AS c/);
    expect(sql).toMatch(/e\."cnaePrincipalCodigo" = c\."cnaeCodigo"/);
    expect(sql).toMatch(/cardinality\(e\."categoriaSugerida"\) = 0/);
    expect(sql).toMatch(/cardinality\(c\."categorias"\) > 0/);
    expect(resultado.candidatosAtualizados).toBe(42);
  });

  it("não grava cache nem aplica UPDATE em dry-run, mas ainda conta o que a IA devolveria", async () => {
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS]);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["ferragens"]);

    const resultado = await categorizarCandidatosCnae({ dryRun: true });

    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalled();
    expect(mocks.db.categoriaSugeridaPorCnae.create).not.toHaveBeenCalled();
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    expect(resultado.cnaesGravados).toBe(1);
    expect(resultado.candidatosAtualizados).toBe(0);
  });

  it("com --apenas-aplicar não chama a IA e só executa o UPDATE do cache", async () => {
    mocks.db.$executeRaw.mockResolvedValue(7);

    const resultado = await categorizarCandidatosCnae({ apenasAplicar: true });

    expect(mocks.db.fornecedor.findMany).not.toHaveBeenCalled();
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.sugerirCategoriasParaObjeto).not.toHaveBeenCalled();
    expect(mocks.db.categoriaSugeridaPorCnae.create).not.toHaveBeenCalled();
    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(resultado.candidatosAtualizados).toBe(7);
  });

  it("isola falha da IA num CNAE sem interromper os demais", async () => {
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS, CNAE_LIMPEZA]);
    mocks.sugerirCategoriasParaObjeto.mockImplementation(async (descricao: string) => {
      if (descricao.includes("ferragens")) throw new Error("timeout OpenAI");
      return ["limpeza"];
    });

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.erros).toEqual([{ cnaeCodigo: "4744001", motivo: "timeout OpenAI" }]);
    expect(mocks.db.categoriaSugeridaPorCnae.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.categoriaSugeridaPorCnae.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cnaeCodigo: "8121400", categorias: ["limpeza"] }),
    });
  });

  it("conta CNAE cuja IA não achou categoria pertinente, e mesmo assim grava o cache vazio (write-once)", async () => {
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS]);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.cnaesSemCategoriaPertinente).toBe(1);
    expect(mocks.db.categoriaSugeridaPorCnae.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cnaeCodigo: "4744001", categorias: [] }),
    });
  });

  it("trata corrida no cache (P2002) como já gravado, sem contar como erro", async () => {
    mocks.db.$queryRaw.mockResolvedValue([CNAE_FERRAGENS]);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["ferragens"]);
    mocks.db.categoriaSugeridaPorCnae.create.mockRejectedValue({ code: "P2002" });

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.erros).toEqual([]);
    expect(resultado.cnaesGravados).toBe(1);
  });

  it("repassa o limite de CNAEs pendentes à query (LIMIT), para amostrar sem varrer todos", async () => {
    await categorizarCandidatosCnae({ limite: 20 });

    const sql = sqlDaChamada(mocks.db.$queryRaw.mock.calls[0]);
    expect(sql).toMatch(/LIMIT/);
  });
});
