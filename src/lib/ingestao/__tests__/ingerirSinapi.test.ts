import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => {
  const db = {
    fonteReferencia: { findUnique: vi.fn(), upsert: vi.fn() },
    loteIngestao: { create: vi.fn(), update: vi.fn() },
    precoReferencia: { createMany: vi.fn() },
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { ingerirSinapi } from "../ingerirSinapi";

const FONTE_ID = "fonte-sinapi";
const LOTE_ID = "lote-1";

function montarXlsxSinapiValido(): Buffer {
  const linhas = [
    ["PCI.817.01 - CUSTO DE COMPOSIÇÕES - SINTÉTICO"],
    ["ENCARGOS SOCIAIS SOBRE PREÇOS DA MÃO-DE-OBRA: 115,54%(HORA)   71,46%(MÊS)"],
    [
      "ABRANGÊNCIA : NACIONAL" +
        " ".repeat(20) +
        "LOCALIDADE  : SAO PAULO" +
        " ".repeat(20) +
        "DATA DE PREÇO   : 12/2024 REFERÊNCIA COLETA : MEDIANO",
    ],
    [],
    [
      "DESCRICAO DA CLASSE",
      "SIGLA DA CLASSE",
      "DESCRICAO DO TIPO 1",
      "SIGLA DO TIPO 1",
      "CODIGO DO AGRUPADOR",
      "DESCRICAO DO AGRUPADOR",
      "CODIGO  DA COMPOSICAO",
      "DESCRICAO DA COMPOSICAO",
      "UNIDADE",
      "ORIGEM DE PREÇO",
      "CUSTO TOTAL",
      "VINCULO",
    ],
    [],
    [
      "ASSENTAMENTO DE TUBOS E PECAS",
      "ASTU",
      "FORNEC E/OU ASSENT",
      "0045",
      "",
      "",
      "97141",
      "ASSENTAMENTO DE TUBO DE FERRO FUNDIDO PARA REDE DE ÁGUA, DN 80 MM",
      "M",
      "COEFICIENTE DE REPRESENTATIVIDADE",
      "5,40",
      "CAIXA REFERENCIAL",
    ],
    [
      "SERVICOS DIVERSOS",
      "SEDI",
      "OUTROS",
      "0318",
      "",
      "",
      "101460",
      "VIGIA DIURNO COM ENCARGOS COMPLEMENTARES",
      "MES",
      "COEFICIENTE DE REPRESENTATIVIDADE",
      "5.602,92",
      "ENCARGOS COMPLEMENTARES REFERENCIAL",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function montarXlsxCabecalhoInvalido(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["título"],
    ["encargos"],
    ["LOCALIDADE : SAO PAULO   DATA DE PREÇO   : 12/2024"],
    [],
    ["COLUNA ERRADA"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function montarXlsxZeradoEmMassa(): Buffer {
  const linhasDados = Array.from({ length: 10 }, (_, i) => [
    "CLASSE",
    "SIGLA",
    "TIPO",
    "0001",
    "",
    "",
    String(1000 + i),
    "DESCRICAO",
    "UN",
    "COEFICIENTE DE REPRESENTATIVIDADE",
    "0,00",
    "CAIXA REFERENCIAL",
  ]);
  const linhas = [
    ["título"],
    ["encargos"],
    ["LOCALIDADE : SAO PAULO   DATA DE PREÇO   : 10/2025"],
    [],
    [
      "DESCRICAO DA CLASSE",
      "SIGLA DA CLASSE",
      "DESCRICAO DO TIPO 1",
      "SIGLA DO TIPO 1",
      "CODIGO DO AGRUPADOR",
      "DESCRICAO DO AGRUPADOR",
      "CODIGO  DA COMPOSICAO",
      "DESCRICAO DA COMPOSICAO",
      "UNIDADE",
      "ORIGEM DE PREÇO",
      "CUSTO TOTAL",
      "VINCULO",
    ],
    [],
    ...linhasDados,
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("ingerirSinapi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.fonteReferencia.findUnique.mockResolvedValue({ id: FONTE_ID, ativa: true });
    mocks.db.fonteReferencia.upsert.mockResolvedValue({ id: FONTE_ID });
    mocks.db.loteIngestao.create.mockResolvedValue({ id: LOTE_ID });
    mocks.db.loteIngestao.update.mockResolvedValue({});
    mocks.db.precoReferencia.createMany.mockResolvedValue({ count: 2 });
  });

  it("garante a FonteReferencia sinapi antes de ingerir", async () => {
    await ingerirSinapi({ conteudo: montarXlsxSinapiValido(), regime: "nao_desonerado" });

    expect(mocks.db.fonteReferencia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chave: "sinapi" } }),
    );
  });

  it("ingere um arquivo válido e grava as duas linhas com o regime informado", async () => {
    const resumo = await ingerirSinapi({
      conteudo: montarXlsxSinapiValido(),
      regime: "nao_desonerado",
    });

    expect(resumo.sucesso).toBe(true);
    expect(resumo.linhasLidas).toBe(2);
    expect(mocks.db.precoReferencia.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ codigo: "97141", regime: "nao_desonerado" }),
        expect.objectContaining({ codigo: "101460", regime: "nao_desonerado" }),
      ],
      skipDuplicates: true,
    });
  });

  it("usa a competência extraída do arquivo (não uma passada manualmente)", async () => {
    await ingerirSinapi({ conteudo: montarXlsxSinapiValido(), regime: "desonerado" });

    expect(mocks.db.loteIngestao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ competencia: "2024-12" }) }),
    );
  });

  it("rejeita o lote quando o cabeçalho não corresponde ao layout esperado", async () => {
    const resumo = await ingerirSinapi({
      conteudo: montarXlsxCabecalhoInvalido(),
      regime: "nao_desonerado",
    });

    expect(resumo.sucesso).toBe(false);
    expect(mocks.db.precoReferencia.createMany).not.toHaveBeenCalled();
  });

  it("rejeita o lote quando as linhas estão zeradas em massa (precedente out-nov/2025)", async () => {
    const resumo = await ingerirSinapi({
      conteudo: montarXlsxZeradoEmMassa(),
      regime: "nao_desonerado",
    });

    expect(resumo.sucesso).toBe(false);
    expect(resumo.erro).toMatch(/zeramento/i);
    expect(mocks.db.precoReferencia.createMany).not.toHaveBeenCalled();
  });

  it("ingere o arquivo real de dezembro/2024 de ponta a ponta (7.829 linhas)", async () => {
    const caminho = join(
      __dirname,
      "../__fixtures__/sinapi_composicoes_sintetico_sp_202412.xlsx",
    );
    const conteudo = readFileSync(caminho);

    const resumo = await ingerirSinapi({ conteudo, regime: "nao_desonerado" });

    expect(resumo.sucesso).toBe(true);
    expect(resumo.linhasLidas).toBe(7829);
    expect(mocks.db.loteIngestao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ competencia: "2024-12" }) }),
    );
  });
});
