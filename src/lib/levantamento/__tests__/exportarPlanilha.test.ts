import { beforeEach, describe, expect, it, vi } from "vitest";

interface PropsGrade { sheetId?: number; title?: string; gridProperties: { rowCount: number; columnCount: number } }
interface PedidoGrade { addSheet?: { properties: PropsGrade }; updateSheetProperties?: { properties: PropsGrade } }

const mocks = vi.hoisted(() => {
  const store: Record<string, (string | number)[][]> = {};
  const chamadas: { tipo: string; aba?: string; args: Record<string, unknown> }[] = [];
  const abas = new Map<string, { sheetId: number; rowCount: number; columnCount: number }>();
  const aba = (range: string) => range.match(/^'([^']+)'/)![1]!;
  const sheets = {
    spreadsheets: {
      get: vi.fn(async () => ({
        data: {
          sheets: [...abas.entries()].map(([title, g]) => ({
            properties: { sheetId: g.sheetId, title, gridProperties: { rowCount: g.rowCount, columnCount: g.columnCount } },
          })),
        },
      })),
      batchUpdate: vi.fn(async (a: { requestBody: { requests: PedidoGrade[] } }) => {
        chamadas.push({ tipo: "batchUpdate", args: a as unknown as Record<string, unknown> });
        for (const r of a.requestBody.requests) {
          if (r.addSheet) abas.set(r.addSheet.properties.title as string, { sheetId: abas.size + 1, rowCount: r.addSheet.properties.gridProperties.rowCount, columnCount: r.addSheet.properties.gridProperties.columnCount });
          const u = r.updateSheetProperties;
          if (u) {
            const t = [...abas.entries()].find(([, g]) => g.sheetId === u.properties.sheetId)!;
            t[1].rowCount = u.properties.gridProperties.rowCount;
            t[1].columnCount = u.properties.gridProperties.columnCount;
          }
        }
      }),
      values: {
        update: vi.fn(async (a: { range: string; valueInputOption: string; requestBody: { values: (string | number)[][] } }) => {
          const nome = aba(a.range);
          chamadas.push({ tipo: "update", aba: nome, args: a as unknown as Record<string, unknown> });
          if (a.range.endsWith("!A1")) {
            // Como a API real: sobrescreve só a faixa escrita; o que estava abaixo continua lá.
            const atual = store[nome] ?? [];
            a.requestBody.values.forEach((l, i) => { atual[i] = [...l]; });
            store[nome] = atual;
          } else {
            const celula = a.range.match(/!([A-Z]+)(\d+)$/)!;
            const col = celula[1]!.charCodeAt(0) - 65;
            const lin = Number(celula[2]) - 1;
            (store[nome] ??= [])[lin] ??= [];
            store[nome]![lin]![col] = a.requestBody.values[0]![0]!;
          }
        }),
        clear: vi.fn(async (a: { range: string }) => {
          const nome = aba(a.range);
          chamadas.push({ tipo: "clear", aba: nome, args: a as unknown as Record<string, unknown> });
          const desde = Number(a.range.match(/!A(\d+):Z$/)![1]);
          store[nome] = (store[nome] ?? []).slice(0, desde - 1);
        }),
        get: vi.fn(async (a: { range: string; valueRenderOption?: string }) => {
          chamadas.push({ tipo: "get", aba: aba(a.range), args: a as unknown as Record<string, unknown> });
          return { data: { values: mocks.lido(aba(a.range)) } };
        }),
      },
    },
  };
  return {
    store,
    chamadas,
    abas,
    sheets,
    /** Pode ser trocado por um teste para simular uma planilha que não guardou o que foi escrito. */
    lido: (nome: string): (string | number)[][] => store[nome] ?? [],
    lerAba: vi.fn(),
    carregar: vi.fn(),
    envios: vi.fn(),
    consultas: vi.fn(),
    audit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    envioCotacao: { findMany: mocks.envios },
    consultaCotacao: { findMany: mocks.consultas },
    auditLog: { create: mocks.audit },
  },
}));
vi.mock("@/lib/sheets/googleAuth", () => ({ getSheetsClient: () => mocks.sheets, lerAbaAutenticado: mocks.lerAba }));
vi.mock("@/lib/indicadores/desempenho", () => ({ carregarConsultasComSemFornecedor: mocks.carregar }));

import { exportarLevantamento, planilhaDoLevantamento } from "../exportarPlanilha";

const AGORA = new Date("2026-11-24T13:00:00Z");
const d = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
const consulta = (situacao: string, envio = "2026-03-05") => ({
  dataEnvio: d(envio),
  dataResposta: situacao === "sem_resposta" ? null : d(envio),
  situacao,
  processo: { chave: "sem-processo", rotulo: "Sem processo no assunto" },
});

function cenarioPadrao() {
  mocks.carregar.mockResolvedValue([consulta("orcamento"), consulta("recusa"), consulta("sem_resposta"), consulta("sem_resposta")]);
  mocks.envios.mockResolvedValue([{ dataEnvio: d("2026-03-05"), totalDestinatarios: 4 }]);
  mocks.consultas.mockResolvedValue([
    { email: "a@x.com", situacao: "orcamento", regra: "ia", dataResposta: d("2026-03-06"), gmailRespostaId: "r1", envio: { gmailMensagemId: "e1" } },
    { email: "b@x.com", situacao: "recusa", regra: "manual", dataResposta: d("2026-03-07"), gmailRespostaId: "r2", envio: { gmailMensagemId: "e1" } },
  ]);
  mocks.lerAba.mockImplementation(async (_id: string, aba: string) =>
    aba === "Lev_Envios" ? [["envioId"], ["e1"]] : [["envioId", "email"], ["e1", "a"], ["e1", "b"], ["e1", "c"], ["e1", "d"]],
  );
}

describe("exportarLevantamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chamadas.length = 0;
    for (const k of Object.keys(mocks.store)) delete mocks.store[k];
    mocks.abas.clear();
    mocks.lido = (nome) => mocks.store[nome] ?? [];
    process.env.LEVANTAMENTO_PLANILHA_ID = "planilha-1";
    mocks.audit.mockResolvedValue({});
    cenarioPadrao();
  });

  it("sem LEVANTAMENTO_PLANILHA_ID: não faz nada", async () => {
    delete process.env.LEVANTAMENTO_PLANILHA_ID;
    expect(planilhaDoLevantamento()).toBeNull();
    await expect(exportarLevantamento("u1", AGORA)).rejects.toThrow(/LEVANTAMENTO_PLANILHA_ID/);
    expect(mocks.chamadas).toHaveLength(0);
    expect(mocks.carregar).not.toHaveBeenCalled();
  });

  it("cria as três abas que faltam e grava cada uma; a releitura confirma", async () => {
    const r = await exportarLevantamento("u1", AGORA);
    expect([...mocks.abas.keys()].sort()).toEqual(["Plataforma_Consultas", "Plataforma_Por_mes", "Plataforma_Resumo"]);
    expect(Object.keys(mocks.store).sort()).toEqual(["Plataforma_Consultas", "Plataforma_Por_mes", "Plataforma_Resumo"]);
    expect(r.releituraOk).toBe(true);
    expect(r.envios).toBe(1);
    expect(r.linhasConsultas).toBe(2);
  });

  it("a célula de conferência termina 'OK (…)' e não 'gravando' quando a releitura bate", async () => {
    await exportarLevantamento("u1", AGORA);
    const c = mocks.store["Plataforma_Resumo"]![2]![1];
    expect(String(c)).toMatch(/^OK \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)$/);
  });

  it("releitura que NÃO bate: releituraOk=false e a célula diz DIVERGE, nomeando a aba", async () => {
    mocks.lido = (nome) =>
      nome === "Plataforma_Por_mes" ? (mocks.store[nome] ?? []).map((l, i) => (i === 3 ? [...l.slice(0, 1), 999, ...l.slice(2)] : l)) : (mocks.store[nome] ?? []);
    const r = await exportarLevantamento("u1", AGORA);
    expect(r.releituraOk).toBe(false);
    expect(String(mocks.store["Plataforma_Resumo"]![2]![1])).toMatch(/^DIVERGE: Plataforma_Por_mes linha 4, coluna 2/);
  });

  it("sobra de uma gravação anterior mais longa é detectada (a limpeza abaixo da matriz é conferida)", async () => {
    mocks.sheets.spreadsheets.values.clear.mockImplementationOnce(async () => undefined);
    mocks.sheets.spreadsheets.values.clear.mockImplementationOnce(async () => undefined);
    mocks.sheets.spreadsheets.values.clear.mockImplementationOnce(async () => undefined);
    mocks.store["Plataforma_Consultas"] = Array.from({ length: 30 }, (_, i) => [`velha ${i}`]);
    mocks.abas.set("Plataforma_Consultas", { sheetId: 9, rowCount: 1000, columnCount: 26 });
    const r = await exportarLevantamento("u1", AGORA);
    expect(r.releituraOk).toBe(false); // sem a limpeza, 28 linhas antigas ficariam sob os dados novos
  });

  it("com a limpeza funcionando, a sobra antiga some", async () => {
    mocks.store["Plataforma_Consultas"] = Array.from({ length: 30 }, (_, i) => [`velha ${i}`]);
    mocks.abas.set("Plataforma_Consultas", { sheetId: 9, rowCount: 1000, columnCount: 26 });
    const r = await exportarLevantamento("u1", AGORA);
    expect(r.releituraOk).toBe(true);
    expect(mocks.store["Plataforma_Consultas"]).toHaveLength(3); // cabeçalho + 2 linhas
  });

  it("ESCREVE ANTES de limpar: nunca existe instante com a aba vazia", async () => {
    await exportarLevantamento("u1", AGORA);
    for (const aba of ["Plataforma_Resumo", "Plataforma_Por_mes", "Plataforma_Consultas"]) {
      const seq = mocks.chamadas.filter((c) => c.aba === aba && (c.tipo === "update" || c.tipo === "clear")).map((c) => c.tipo);
      expect(seq.slice(0, 2)).toEqual(["update", "clear"]);
    }
  });

  it("a limpeza começa na linha logo abaixo da matriz gravada", async () => {
    await exportarLevantamento("u1", AGORA);
    const clear = mocks.chamadas.find((c) => c.tipo === "clear" && c.aba === "Plataforma_Consultas")!;
    expect((clear.args as { range: string }).range).toBe("'Plataforma_Consultas'!A4:Z"); // 3 linhas gravadas
  });

  it("grava sempre em RAW: texto vindo de e-mail nunca vira fórmula", async () => {
    mocks.consultas.mockResolvedValue([
      { email: "=HYPERLINK(\"http://evil\")@x.com", situacao: "recusa", regra: "manual", dataResposta: d("2026-03-07"), gmailRespostaId: "r2", envio: { gmailMensagemId: "e1" } },
    ]);
    await exportarLevantamento("u1", AGORA);
    const updates = mocks.chamadas.filter((c) => c.tipo === "update");
    expect(updates.length).toBeGreaterThanOrEqual(4);
    for (const u of updates) expect((u.args as { valueInputOption: string }).valueInputOption).toBe("RAW");
  });

  it("amplia a grade quando a matriz passa das 1.000 linhas da aba padrão", async () => {
    mocks.abas.set("Plataforma_Consultas", { sheetId: 7, rowCount: 1000, columnCount: 26 });
    mocks.consultas.mockResolvedValue(
      Array.from({ length: 1300 }, (_, i) => ({
        email: `f${i}@x.com`, situacao: "recusa", regra: "ia", dataResposta: d("2026-03-07"), gmailRespostaId: `r${i}`, envio: { gmailMensagemId: "e1" },
      })),
    );
    await exportarLevantamento("u1", AGORA);
    expect(mocks.abas.get("Plataforma_Consultas")!.rowCount).toBeGreaterThanOrEqual(1301);
  });

  it("leitura do banco vazia COM envios no banco: aborta e NÃO toca na planilha", async () => {
    mocks.carregar.mockResolvedValue([]);
    await expect(exportarLevantamento("u1", AGORA)).rejects.toThrow(/NÃO foi alterada/);
    expect(mocks.chamadas.filter((c) => c.tipo === "update" || c.tipo === "clear" || c.tipo === "batchUpdate")).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("aba Lev_* ilegível: NÃO CONFERIDO, e a exportação segue", async () => {
    mocks.lerAba.mockRejectedValue(new Error("sem aba"));
    const r = await exportarLevantamento("u1", AGORA);
    expect(r.releituraOk).toBe(true);
    expect(r.verificacoes.filter((v) => v.resultado === "NÃO CONFERIDO").map((v) => v.nome)).toEqual([
      "Envios × abas do Gmail (Lev_Envios)",
      "Destinatários × abas do Gmail (Lev_Destinatarios)",
    ]);
  });

  it("cruzamento com o Gmail: conta as linhas de dado (sem o cabeçalho) das abas Lev_*", async () => {
    const r = await exportarLevantamento("u1", AGORA);
    const v = (parte: string) => r.verificacoes.find((x) => x.nome.includes(parte))!;
    expect(v("Lev_Envios")).toMatchObject({ resultado: "OK", detalhe: "1 na plataforma × 1 no Gmail" });
    expect(v("Lev_Destinatarios")).toMatchObject({ resultado: "OK", detalhe: "4 na plataforma × 4 no Gmail" });
  });

  it("divergência com o Gmail é reportada como DIVERGE (e não escondida)", async () => {
    mocks.lerAba.mockImplementation(async (_id: string, aba: string) => (aba === "Lev_Envios" ? [["envioId"], ["e1"], ["e2"]] : [["envioId"], ["e1"]]));
    const r = await exportarLevantamento("u1", AGORA);
    expect(r.verificacoes.filter((v) => v.resultado === "DIVERGE")).toHaveLength(2);
  });

  it("a releitura é SEM formatação (a planilha em pt-BR devolveria '64,7' e '17.804')", async () => {
    await exportarLevantamento("u1", AGORA);
    const leituras = mocks.chamadas.filter((c) => c.tipo === "get");
    expect(leituras).toHaveLength(3);
    for (const l of leituras) expect((l.args as { valueRenderOption: string }).valueRenderOption).toBe("UNFORMATTED_VALUE");
  });

  it("consulta ao banco: só do ano, sem as 'sem resposta', com select explícito (§9.46)", async () => {
    await exportarLevantamento("u1", AGORA);
    expect(mocks.envios).toHaveBeenCalledWith({
      where: { dataEnvio: { gte: new Date("2026-01-01T00:00:00-03:00") } },
      select: { dataEnvio: true, totalDestinatarios: true },
    });
    expect(mocks.consultas).toHaveBeenCalledWith({
      where: { envio: { dataEnvio: { gte: new Date("2026-01-01T00:00:00-03:00") } }, situacao: { not: "sem_resposta" } },
      select: {
        email: true, situacao: true, regra: true, dataResposta: true, gmailRespostaId: true,
        envio: { select: { gmailMensagemId: true } },
      },
    });
    expect(mocks.carregar).toHaveBeenCalledWith(new Date("2026-01-01T00:00:00-03:00"), null);
  });

  it("o ano é o de Brasília: 31/12 às 22h (Brasília) ainda é o ano que acaba", async () => {
    await exportarLevantamento("u1", new Date("2027-01-01T01:30:00Z")); // 22:30 de 31/12/2026 em Brasília
    expect(mocks.carregar).toHaveBeenCalledWith(new Date("2026-01-01T00:00:00-03:00"), null);
  });

  it("audita só contagens e nomes fixos de conferência (nenhum e-mail)", async () => {
    await exportarLevantamento("u1", AGORA);
    const dados = mocks.audit.mock.calls[0]![0] as { data: { userId: string; acao: string; detalhes: Record<string, unknown> } };
    expect(dados.data.userId).toBe("u1");
    expect(dados.data.acao).toBe("exportar_levantamento_planilha");
    expect(dados.data.detalhes).toEqual({ ano: 2026, envios: 1, consultas: 4, linhasConsultas: 2, releituraOk: true, divergencias: [] });
    expect(JSON.stringify(dados)).not.toContain("@x.com");
  });

  it("nunca escreve nas abas do script do Gmail (só lê Lev_*)", async () => {
    await exportarLevantamento("u1", AGORA);
    const escritas = mocks.chamadas.filter((c) => c.tipo === "update" || c.tipo === "clear").map((c) => c.aba);
    expect(escritas.every((a) => a?.startsWith("Plataforma_"))).toBe(true);
  });
});
