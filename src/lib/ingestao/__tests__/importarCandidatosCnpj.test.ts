import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    importacaoCandidatosCnpj: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { importarCandidatosCnpj } from "../importarCandidatosCnpj";

const CABECALHO =
  "cnpj,razaoSocial,nomeFantasia,situacaoCadastral,situacaoCadastralData,municipio,estado,cnaePrincipalCodigo,cnaePrincipalDescricao,email,telefone,logradouro,numero,bairro,cep";

function linha(over: Partial<Record<string, string>> = {}): string {
  const campos: Record<string, string> = {
    cnpj: "12345678000199",
    razaoSocial: "EMPRESA TESTE LTDA",
    nomeFantasia: "TESTE",
    situacaoCadastral: "02",
    situacaoCadastralData: "20200115",
    municipio: "SAO VICENTE",
    estado: "SP",
    cnaePrincipalCodigo: "4744001",
    cnaePrincipalDescricao: "Comercio varejista de ferragens",
    email: "contato@teste.com.br",
    telefone: "1332221100",
    logradouro: "RUA DAS FLORES",
    numero: "100",
    bairro: "CENTRO",
    cep: "11310000",
    ...over,
  };
  return CABECALHO.split(",")
    .map((c) => campos[c] ?? "")
    .join(",");
}

let dir: string;

function escreverCsv(conteudo: string): string {
  const caminho = join(dir, "candidatos.csv");
  writeFileSync(caminho, conteudo, "utf8");
  return caminho;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "m27-"));
  vi.clearAllMocks();
  mocks.db.$executeRaw.mockResolvedValue(0);
  mocks.db.importacaoCandidatosCnpj.create.mockResolvedValue({ id: "imp-1" });
  mocks.db.importacaoCandidatosCnpj.update.mockResolvedValue({});
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("importarCandidatosCnpj", () => {
  it("importa uma linha válida e conta lidas/importadas", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n`);

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasLidas).toBe(1);
    expect(r.linhasImportadas).toBe(1);
    expect(r.linhasRejeitadas).toBe(0);
  });

  it("mapeia colunas por NOME do header, tolerando ordem diferente e coluna extra", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(
      "estado,colunaExtra,cnpj,razaoSocial,situacaoCadastral,municipio,cnaePrincipalCodigo,cnaePrincipalDescricao,nomeFantasia,situacaoCadastralData,email,telefone,logradouro,numero,bairro,cep\n" +
        "SP,ignorar,12345678000199,EMPRESA TESTE LTDA,02,SAO VICENTE,4744001,Comercio varejista,TESTE,20200115,a@b.c,1332221100,RUA,1,CENTRO,11310000\n",
    );

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasImportadas).toBe(1);
    expect(r.linhasRejeitadas).toBe(0);
  });

  it("normaliza o município para a grafia canônica de CAMADAS_GEOGRAFICAS", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(`${CABECALHO}\n${linha({ municipio: "SAO VICENTE" })}\n`);

    await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    const joined = mocks.db.$executeRaw.mock.calls[0]![1] as { values: unknown[] };
    expect(joined.values).toContain("São Vicente");
    expect(joined.values).not.toContain("SAO VICENTE");
  });

  it("rejeita linha com CNPJ inválido sem derrubar o processo, e segue importando as demais", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(
      `${CABECALHO}\n${linha({ cnpj: "123" })}\n${linha({ cnpj: "98765432000188" })}\n`,
    );

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasLidas).toBe(2);
    expect(r.linhasRejeitadas).toBe(1);
    expect(r.linhasImportadas).toBe(1);
  });

  it("rejeita linha com situação cadastral diferente de 02 (só empresa ativa entra)", async () => {
    const caminho = escreverCsv(`${CABECALHO}\n${linha({ situacaoCadastral: "08" })}\n`);

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasRejeitadas).toBe(1);
    expect(r.linhasImportadas).toBe(0);
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejeita linha com aspas não fechadas (quebra de linha embutida) em vez de corromper o parse", async () => {
    const caminho = escreverCsv(`${CABECALHO}\n12345678000199,"EMPRESA SEM FECHAR,SP\n`);

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasRejeitadas).toBe(1);
    expect(r.linhasImportadas).toBe(0);
  });

  it("rejeita linha com número de campos diferente do header", async () => {
    const caminho = escreverCsv(`${CABECALHO}\n12345678000199,SO,DOIS,CAMPOS\n`);

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasRejeitadas).toBe(1);
    expect(r.linhasImportadas).toBe(0);
  });

  it("ignora linhas em branco sem contá-las como lidas nem rejeitadas", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n\n\n`);

    const r = await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(r.linhasLidas).toBe(1);
    expect(r.linhasRejeitadas).toBe(0);
  });

  it("falha explicitamente quando o header não tem uma coluna obrigatória", async () => {
    const caminho = escreverCsv("cnpj,razaoSocial\n12345678000199,EMPRESA\n");

    await expect(importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" })).rejects.toThrow(
      /coluna/i,
    );
  });

  it("grava em lote com ON CONFLICT (cnpj) DO UPDATE — createMany/skipDuplicates nunca atualizaria linha existente", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n`);

    await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    const sql = mocks.db.$executeRaw.mock.calls[0]![0]!.join("?");
    expect(sql).toMatch(/ON CONFLICT \("cnpj"\) DO UPDATE/);
    expect(sql).toMatch(/"razaoSocial" = EXCLUDED\."razaoSocial"/);
  });

  it("quebra a escrita em lotes do tamanho configurado, em vez de um INSERT gigante", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const linhas = Array.from({ length: 5 }, (_, i) =>
      linha({ cnpj: String(10000000000000 + i) }),
    ).join("\n");
    const caminho = escreverCsv(`${CABECALHO}\n${linhas}\n`);

    await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07", tamanhoLote: 2 });

    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("converte situacaoCadastralData AAAAMMDD para Date e descarta data implausível", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(
      `${CABECALHO}\n${linha({ situacaoCadastralData: "00010101" })}\n`,
    );

    await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    const valores = mocks.db.$executeRaw.mock.calls[0]!.flat(3);
    expect(valores.some((v) => v instanceof Date)).toBe(false);
  });

  it("registra a importação em ImportacaoCandidatosCnpj com os totais ao concluir", async () => {
    mocks.db.$executeRaw.mockResolvedValue(1);
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n`);

    await importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" });

    expect(mocks.db.importacaoCandidatosCnpj.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competenciaRfb: "2026-07", arquivoOrigem: caminho }),
      }),
    );
    expect(mocks.db.importacaoCandidatosCnpj.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "imp-1" },
        data: expect.objectContaining({
          linhasLidas: 1,
          linhasImportadas: 1,
          linhasRejeitadas: 0,
          concluidoEm: expect.any(Date),
        }),
      }),
    );
  });

  it("grava o erro no log de importação quando a escrita falha, e propaga", async () => {
    mocks.db.$executeRaw.mockRejectedValue(new Error("conexão perdida"));
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n`);

    await expect(
      importarCandidatosCnpj({ caminho, competenciaRfb: "2026-07" }),
    ).rejects.toThrow("conexão perdida");

    expect(mocks.db.importacaoCandidatosCnpj.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ erro: expect.stringContaining("conexão perdida") }),
      }),
    );
  });

  it("dryRun não escreve candidato nenhum, mas ainda conta o que seria importado", async () => {
    const caminho = escreverCsv(`${CABECALHO}\n${linha()}\n`);

    const r = await importarCandidatosCnpj({
      caminho,
      competenciaRfb: "2026-07",
      dryRun: true,
    });

    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    expect(r.linhasImportadas).toBe(1);
  });
});
