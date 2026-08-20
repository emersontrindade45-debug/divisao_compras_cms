import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const METODOS_DE_ESCRITA = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
] as const;

const MODELS_MOCK = ["empresaCandidataFornecedor", "categoriaSugeridaPorCnae", "fornecedor"] as const;

const mocks = vi.hoisted(() => {
  const METODOS_ESCRITA = [
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "updateManyAndReturn",
    "upsert",
    "delete",
    "deleteMany",
  ];
  const MODELS = ["empresaCandidataFornecedor", "categoriaSugeridaPorCnae", "fornecedor"];

  const db: Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
    $executeRaw: ReturnType<typeof vi.fn>;
  } = { $executeRaw: vi.fn() } as never;

  for (const model of MODELS) {
    db[model] = { findMany: vi.fn(), groupBy: vi.fn() };
    for (const metodo of METODOS_ESCRITA) db[model]![metodo] = vi.fn();
  }

  return { db, sugerirCategoriasParaObjeto: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/ia/categorizarObjeto", () => ({
  sugerirCategoriasParaObjeto: mocks.sugerirCategoriasParaObjeto,
}));

import { categorizarCandidatosCnae } from "../categorizarCandidatosCnae";

const CNAE_A = { cnaePrincipalCodigo: "4744001", cnaePrincipalDescricao: "Comércio varejista de ferragens" };
const CNAE_B = { cnaePrincipalCodigo: "4321500", cnaePrincipalDescricao: "Instalações elétricas" };

describe("categorizarCandidatosCnae", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([CNAE_A, CNAE_B]);
    mocks.db.categoriaSugeridaPorCnae.findMany.mockResolvedValue([]);
    mocks.db.fornecedor.findMany.mockResolvedValue([{ categoria: ["ferragens"] }, { categoria: ["elétrica"] }]);
    mocks.db.categoriaSugeridaPorCnae.upsert.mockResolvedValue({});
    mocks.db.$executeRaw.mockResolvedValue(0);
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue([]);
  });

  it("não chama a IA de novo para CNAE já cacheado (evita custo repetido)", async () => {
    mocks.db.categoriaSugeridaPorCnae.findMany.mockResolvedValue([{ cnaeCodigo: CNAE_A.cnaePrincipalCodigo }]);

    const resultado = await categorizarCandidatosCnae();

    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledTimes(1);
    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledWith(
      CNAE_B.cnaePrincipalDescricao,
      expect.arrayContaining(["ferragens", "elétrica"]),
    );
    expect(resultado.cnaesEncontrados).toBe(2);
    expect(resultado.cnaesJaCacheados).toBe(1);
    expect(resultado.cnaesProcessados).toBe(1);
  });

  it("chama a IA para CNAE novo e grava o resultado no cache via upsert", async () => {
    mocks.sugerirCategoriasParaObjeto.mockImplementation(async (descricao: string) =>
      descricao === CNAE_A.cnaePrincipalDescricao ? ["ferragens"] : [],
    );

    const resultado = await categorizarCandidatosCnae();

    expect(mocks.db.categoriaSugeridaPorCnae.upsert).toHaveBeenCalledWith({
      where: { cnaeCodigo: CNAE_A.cnaePrincipalCodigo },
      create: {
        cnaeCodigo: CNAE_A.cnaePrincipalCodigo,
        cnaeDescricao: CNAE_A.cnaePrincipalDescricao,
        categorias: ["ferragens"],
      },
      update: { cnaeDescricao: CNAE_A.cnaePrincipalDescricao, categorias: ["ferragens"] },
    });
    expect(resultado.cnaesComCategoria).toBe(1);
    expect(resultado.cnaesSemCategoria).toBe(1);
  });

  it("aplica o cache com um único UPDATE...FROM que só preenche categoriaSugerida vazia — mutação: remover a condição quebraria esta garantia", async () => {
    mocks.db.$executeRaw.mockResolvedValue(37);

    const resultado = await categorizarCandidatosCnae();

    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (mocks.db.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join("?");
    expect(sql).toMatch(/UPDATE "empresas_candidatas_fornecedor"/);
    expect(sql).toMatch(/FROM "categorias_sugeridas_por_cnae"/);
    expect(sql).toMatch(/e\."cnaePrincipalCodigo"\s*=\s*c\."cnaeCodigo"/);
    // A garantia de "nunca sobrescrever" mora nesta cláusula do WHERE — se ela sumir do SQL, este
    // teste precisa cair (CLAUDE.md §9.35/§9.39). Confirmado por mutação: comentar a linha
    // `AND e."categoriaSugerida" = '{}'` na implementação faz esta asserção falhar.
    expect(sql).toMatch(/e\."categoriaSugerida"\s*=\s*'\{\}'/);
    expect(sql).toMatch(/c\."categorias"\s*<>\s*'\{\}'/);
    expect(resultado.linhasAtualizadas).toBe(37);
  });

  it("dry-run não grava nada — varre toda a superfície de escrita do Prisma usada pelo módulo", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["ferragens"]);

    await categorizarCandidatosCnae({ dryRun: true });

    const escritas: string[] = [];
    for (const model of MODELS_MOCK) {
      for (const metodo of METODOS_DE_ESCRITA) {
        const espiao = mocks.db[model]?.[metodo];
        if (espiao && espiao.mock.calls.length > 0) escritas.push(`db.${model}.${metodo}`);
      }
    }
    expect(escritas).toEqual([]);
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
  });

  it("dry-run ainda reporta quantos CNAEs seriam processados", async () => {
    mocks.sugerirCategoriasParaObjeto.mockResolvedValue(["ferragens"]);

    const resultado = await categorizarCandidatosCnae({ dryRun: true });

    expect(resultado.cnaesProcessados).toBe(2);
    expect(resultado.linhasAtualizadas).toBe(0);
  });

  it("respeita --limite amostrando só os primeiros CNAEs novos", async () => {
    const resultado = await categorizarCandidatosCnae({ limite: 1 });

    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledTimes(1);
    expect(resultado.cnaesProcessados).toBe(1);
  });

  it("registra erro por CNAE sem interromper os demais", async () => {
    mocks.sugerirCategoriasParaObjeto.mockImplementation(async (descricao: string) => {
      if (descricao === CNAE_A.cnaePrincipalDescricao) throw new Error("falha simulada da IA");
      return ["elétrica"];
    });

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.erros).toEqual([
      { cnaeCodigo: CNAE_A.cnaePrincipalCodigo, motivo: "falha simulada da IA" },
    ]);
    expect(resultado.cnaesComCategoria).toBe(1);
  });

  it("dedupa CNAE que aparece com descrições diferentes no groupBy, mantendo a primeira", async () => {
    mocks.db.empresaCandidataFornecedor.groupBy.mockResolvedValue([
      CNAE_A,
      { cnaePrincipalCodigo: CNAE_A.cnaePrincipalCodigo, cnaePrincipalDescricao: "Ferragens (variação)" },
    ]);

    const resultado = await categorizarCandidatosCnae();

    expect(resultado.cnaesEncontrados).toBe(1);
    expect(mocks.sugerirCategoriasParaObjeto).toHaveBeenCalledWith(
      CNAE_A.cnaePrincipalDescricao,
      expect.any(Array),
    );
  });
});

describe("categorizarCandidatosCnae.ts não importa server-only", () => {
  it("não tem `import \"server-only\"` — o script administrativo precisa importar este módulo fora do bundler do Next (CLAUDE.md §9.62)", () => {
    const caminho = join(__dirname, "..", "categorizarCandidatosCnae.ts");
    const conteudo = readFileSync(caminho, "utf8");

    // Âncora em início de linha: o comentário do próprio arquivo cita `import "server-only"`
    // entre crases só para explicar a decisão (mesmo padrão de `enriquecerFornecedoresPorCnpj.ts`)
    // — um regex sem âncora casaria com essa citação e daria falso positivo.
    expect(conteudo).not.toMatch(/^import\s+["']server-only["'];?\s*$/m);
  });
});
