import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { $executeRaw: vi.fn(), $queryRaw: vi.fn() } as {
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/lib/dbCandidatos", () => ({ dbCandidatos: mocks.db }));

import { enriquecerCandidatosSicaf } from "../enriquecerCandidatosSicaf";

interface FornecedorSicafFixture {
  cnpj: string | null;
  cpf: string | null;
  ativo: boolean;
  habilitadoLicitar: boolean;
}

function fornecedor(cnpj: string, habilitadoLicitar = true): FornecedorSicafFixture {
  return { cnpj, cpf: null, ativo: true, habilitadoLicitar };
}

function respostaOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** Mocka `$queryRaw` (lista de CNAEs) e `fetch` (SICAF por CNAE) juntos. `porCnae` mapeia
 * `codigoCnae -> páginas` (cada página é um array de fornecedores); CNAE sem entrada = 0 registros. */
function montarCenario(cnaes: string[], porCnae: Record<string, FornecedorSicafFixture[][]> = {}) {
  mocks.db.$queryRaw.mockResolvedValue(cnaes.map((c) => ({ cnaePrincipalCodigo: c })));

  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const codigoCnae = url.searchParams.get("codigoCnae")!;
    const pagina = Number(url.searchParams.get("pagina"));
    const paginas = porCnae[codigoCnae] ?? [];
    const resultado = paginas[pagina - 1] ?? [];
    const totalRegistros = paginas.flat().length;
    return respostaOk({ resultado, totalRegistros, totalPaginas: paginas.length });
  });
}

describe("enriquecerCandidatosSicaf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$executeRaw.mockResolvedValue(0);
  });

  it("consulta o SICAF particionado por CNAE (um por vez, várias páginas cada) e cruza por CNPJ", async () => {
    montarCenario(["4321500", "6201500"], {
      "4321500": [[fornecedor("11111111000101"), fornecedor("22222222000102")]],
      "6201500": [[fornecedor("33333333000103")], [fornecedor("44444444000104")]],
    });

    const resultado = await enriquecerCandidatosSicaf();

    expect(resultado.cnaesConsultados).toBe(2);
    expect(resultado.cnpjsHabilitadosEncontrados).toBe(4);
  });

  it("nunca pagina o dataset inteiro sem filtro de CNAE — toda chamada ao SICAF leva codigoCnae", async () => {
    montarCenario(["4321500"], { "4321500": [[fornecedor("11111111000101")]] });

    await enriquecerCandidatosSicaf();

    const chamadas = vi.mocked(global.fetch).mock.calls;
    expect(chamadas.length).toBeGreaterThan(0);
    for (const [input] of chamadas) {
      const url = new URL(String(input));
      expect(url.searchParams.get("codigoCnae")).toBeTruthy();
    }
  });

  it("ignora fornecedor pessoa física (sem CNPJ) e fornecedor não habilitado a licitar", async () => {
    montarCenario(["4321500"], {
      "4321500": [
        [
          fornecedor("11111111000101"),
          { cnpj: null, cpf: "11122233344", ativo: true, habilitadoLicitar: false },
          fornecedor("22222222000102", false),
        ],
      ],
    });

    const resultado = await enriquecerCandidatosSicaf();

    expect(resultado.cnpjsHabilitadosEncontrados).toBe(1);
  });

  it("reporta progresso a cada CNAE processado", async () => {
    montarCenario(["4321500", "6201500"], {
      "4321500": [[fornecedor("11111111000101")]],
      "6201500": [[fornecedor("22222222000102")]],
    });
    const progresso: number[] = [];

    await enriquecerCandidatosSicaf({
      concorrencia: 1,
      onProgresso: (p) => progresso.push(p.cnaesProcessados),
    });

    expect(progresso).toEqual([1, 2]);
  });

  it("em dry-run não grava nada no banco", async () => {
    montarCenario(["4321500"], { "4321500": [[fornecedor("11111111000101")]] });

    const resultado = await enriquecerCandidatosSicaf({ dryRun: true });

    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    expect(resultado.linhasMarcadas).toBe(0);
    expect(resultado.linhasDesmarcadas).toBe(0);
  });

  it("desmarca quem não apareceu nesta rodada e marca quem apareceu, cada um em sua própria query", async () => {
    montarCenario(["4321500"], { "4321500": [[fornecedor("11111111000101")]] });
    mocks.db.$executeRaw.mockResolvedValueOnce(5).mockResolvedValueOnce(1);

    const resultado = await enriquecerCandidatosSicaf();

    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(2);

    const sqlDesmarcar = (mocks.db.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join("?");
    expect(sqlDesmarcar).toContain('SET "sicafHabilitado" = false');
    expect(sqlDesmarcar).toContain("NOT (");

    const sqlMarcar = (mocks.db.$executeRaw.mock.calls[1]![0] as TemplateStringsArray).join("?");
    expect(sqlMarcar).toContain('SET "sicafHabilitado" = true');
    expect(mocks.db.$executeRaw.mock.calls[1]![1]).toEqual(["11111111000101"]);

    expect(resultado.linhasDesmarcadas).toBe(5);
    expect(resultado.linhasMarcadas).toBe(1);
  });

  it("quebra a marcação em lotes de 20.000 CNPJs por UPDATE", async () => {
    // 1 CNAE com 41 páginas de 500 = 20.500 CNPJs distintos > 1 lote (20.000).
    const paginas: FornecedorSicafFixture[][] = Array.from({ length: 41 }, (_, p) =>
      Array.from({ length: 500 }, (_, i) => fornecedor(String(p * 500 + i).padStart(14, "0"))),
    );
    montarCenario(["4321500"], { "4321500": paginas });

    const resultado = await enriquecerCandidatosSicaf({ concorrencia: 10 });

    expect(resultado.cnpjsHabilitadosEncontrados).toBe(20_500);
    // 1 UPDATE de desmarcação + 2 UPDATEs de marcação (20.000 + 500).
    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(3);
    expect((mocks.db.$executeRaw.mock.calls[1]![1] as string[]).length).toBe(20_000);
    expect((mocks.db.$executeRaw.mock.calls[2]![1] as string[]).length).toBe(500);
  });

  it("tenta de novo em falha transitória e ainda assim completa", async () => {
    mocks.db.$queryRaw.mockResolvedValue([{ cnaePrincipalCodigo: "4321500" }]);
    let chamadas = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      chamadas++;
      if (chamadas < 2) throw new Error("falha de rede simulada");
      return respostaOk({
        resultado: [fornecedor("11111111000101")],
        totalRegistros: 1,
        totalPaginas: 1,
      });
    });

    const resultado = await enriquecerCandidatosSicaf();

    expect(resultado.cnpjsHabilitadosEncontrados).toBe(1);
    expect(chamadas).toBeGreaterThanOrEqual(2);
  });

  it("se um CNAE falhar mesmo após as tentativas, não grava nada (tudo ou nada)", async () => {
    mocks.db.$queryRaw.mockResolvedValue([
      { cnaePrincipalCodigo: "4321500" },
      { cnaePrincipalCodigo: "6201500" },
    ]);
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("codigoCnae") === "6201500") {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return respostaOk({
        resultado: [fornecedor("11111111000101")],
        totalRegistros: 1,
        totalPaginas: 1,
      });
    });

    await expect(enriquecerCandidatosSicaf()).rejects.toThrow();
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
  });

  // Rate limit (HTTP 429) foi o que derrubou a rodagem real de 2026-08-28 depois de 340s de coleta.
  // Ele precisa de tratamento próprio: backoff longo (não os 800ms do erro comum) e — crítico —
  // pausa GLOBAL, senão os outros workers seguem martelando e renovam o bloqueio.
  describe("rate limit (HTTP 429)", () => {
    function resposta429(headers: Record<string, string> = {}): Response {
      return {
        ok: false,
        status: 429,
        headers: { get: (nome: string) => headers[nome.toLowerCase()] ?? null },
        json: async () => ({}),
      } as unknown as Response;
    }

    it("respeita o Retry-After em segundos antes de tentar de novo, e conclui", async () => {
      mocks.db.$queryRaw.mockResolvedValue([{ cnaePrincipalCodigo: "4321500" }]);
      let chamadas = 0;
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        chamadas++;
        if (chamadas === 1) return resposta429({ "retry-after": "1" });
        return respostaOk({
          resultado: [fornecedor("11111111000101")],
          totalRegistros: 1,
          totalPaginas: 1,
        });
      });

      const inicio = Date.now();
      const resultado = await enriquecerCandidatosSicaf();
      const decorrido = Date.now() - inicio;

      expect(resultado.cnpjsHabilitadosEncontrados).toBe(1);
      // Esperou ~1s (o Retry-After), não os 800ms do backoff genérico nem 20s do padrão de 429.
      expect(decorrido).toBeGreaterThanOrEqual(900);
      expect(decorrido).toBeLessThan(5_000);
    });

    // Este teste precisa de trabalho AINDA PENDENTE quando o 429 chega — senão ele passa sem
    // testar nada. Uma primeira versão usava 2 CNAEs com concorrência 2: os dois workers disparavam
    // juntos em t≈0, não sobrava requisição posterior ao bloqueio para a pausa segurar, e desativar
    // a pausa global inteira mantinha a suíte verde (confirmado por mutação). Com 3 CNAEs e
    // concorrência 2, o terceiro só começa depois que um worker libera — e é ele que prova a
    // garantia.
    it("a pausa por 429 é global: um worker bloqueado segura os demais", async () => {
      mocks.db.$queryRaw.mockResolvedValue([
        { cnaePrincipalCodigo: "1111111" }, // toma 429 e registra a pausa
        { cnaePrincipalCodigo: "2222222" }, // rápido, mas ocupa o 2º worker por 100ms
        { cnaePrincipalCodigo: "3333333" }, // só começa depois — deve respeitar a pausa
      ]);
      const momentos: Array<{ cnae: string; t: number }> = [];
      const inicio = Date.now();
      let jaDeu429 = false;

      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const cnae = new URL(String(input)).searchParams.get("codigoCnae")!;
        momentos.push({ cnae, t: Date.now() - inicio });
        if (cnae === "1111111" && !jaDeu429) {
          jaDeu429 = true;
          return resposta429({ "retry-after": "1" });
        }
        // Segura o 2º worker o suficiente para o 429 já ter registrado a pausa quando ele
        // for buscar o próximo CNAE da fila.
        if (cnae === "2222222") await new Promise((r) => setTimeout(r, 100));
        return respostaOk({ resultado: [fornecedor(`${cnae}0000001`)], totalRegistros: 1, totalPaginas: 1 });
      });

      await enriquecerCandidatosSicaf({ concorrencia: 2 });

      // Sem pausa global, o 3º CNAE sairia assim que o worker liberasse (~100ms). Com ela, espera
      // o fim da janela de rate limit (~1s), mesmo tendo sido outro worker que tomou o 429.
      const terceiro = momentos.find((m) => m.cnae === "3333333");
      expect(terceiro).toBeDefined();
      expect(terceiro!.t).toBeGreaterThanOrEqual(900);
    });
  });

  // Sem checkpoint, um 429 no CNAE 400 de 1.321 descarta tudo que já foi baixado — foi exatamente
  // o que aconteceu na rodagem real, custando 340s e ~99 mil CNPJs já coletados.
  describe("checkpoint da coleta", () => {
    async function arquivoTemporario(): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), "sicaf-checkpoint-"));
      return join(dir, "checkpoint.json");
    }

    it("grava o progresso da coleta no arquivo ao terminar", async () => {
      const caminho = await arquivoTemporario();
      montarCenario(["4321500"], { "4321500": [[fornecedor("11111111000101")]] });

      await enriquecerCandidatosSicaf({ caminhoCheckpoint: caminho });

      const conteudo = JSON.parse(await readFile(caminho, "utf8"));
      expect(conteudo.cnaesConcluidos).toEqual(["4321500"]);
      expect(conteudo.cnpjs).toEqual(["11111111000101"]);
    });

    it("retoma de um checkpoint existente: não rebusca CNAE já concluído e mantém os CNPJs dele", async () => {
      const caminho = await arquivoTemporario();
      await writeFile(
        caminho,
        JSON.stringify({ cnaesConcluidos: ["4321500"], cnpjs: ["99999999000199"] }),
        "utf8",
      );
      montarCenario(["4321500", "6201500"], {
        "4321500": [[fornecedor("11111111000101")]],
        "6201500": [[fornecedor("22222222000102")]],
      });

      const resultado = await enriquecerCandidatosSicaf({ caminhoCheckpoint: caminho });

      // O CNAE já concluído não foi consultado de novo.
      const cnaesBuscados = vi
        .mocked(global.fetch)
        .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("codigoCnae"));
      expect(cnaesBuscados).not.toContain("4321500");
      expect(cnaesBuscados).toContain("6201500");

      // O CNPJ do checkpoint sobrevive e soma com o novo.
      expect(resultado.cnpjsHabilitadosEncontrados).toBe(2);
      expect(mocks.db.$executeRaw.mock.calls[1]![1]).toEqual(
        expect.arrayContaining(["99999999000199", "22222222000102"]),
      );
    });

    it("checkpoint corrompido não derruba a rodagem — recomeça do zero", async () => {
      const caminho = await arquivoTemporario();
      await writeFile(caminho, "{ isto não é json válido", "utf8");
      montarCenario(["4321500"], { "4321500": [[fornecedor("11111111000101")]] });

      const resultado = await enriquecerCandidatosSicaf({ caminhoCheckpoint: caminho });

      expect(resultado.cnpjsHabilitadosEncontrados).toBe(1);
    });
  });
});
