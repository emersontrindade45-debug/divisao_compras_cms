import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { cotacao: { findMany: mocks.findMany } },
}));

import { GET } from "../route";

function requisicao(authorization?: string): Request {
  return new Request("https://exemplo.test/api/jobs/lembretes", {
    headers: authorization ? { authorization } : {},
  });
}

const COTACAO = {
  id: "cot-1",
  dataLimite: new Date("2026-08-01T12:00:00Z"),
  fornecedor: { razaoSocial: "Fornecedora Exemplo LTDA" },
  processo: { numero: "2026/0042", objeto: "Cadeiras" },
};

describe("GET /api/jobs/lembretes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.findMany.mockResolvedValue([COTACAO]);
  });

  // Este é o caso que estava quebrado em produção: sem CRON_SECRET a guarda
  // anterior (`if (cronSecret && ...)`) curto-circuitava e a rota respondia 200
  // a qualquer requisição anônima. Guarda de autenticação não pode depender de a
  // configuração existir — configuração ausente fecha a porta.
  it("nega acesso quando CRON_SECRET não está configurado (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(requisicao());

    expect(res.status).toBe(401);
    // Nem sequer consulta o banco: requisição anônima não deve custar query.
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("nega acesso sem CRON_SECRET mesmo com um Bearer qualquer", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(requisicao("Bearer chute"));

    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("nega acesso quando o header está ausente", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao());

    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("nega acesso quando o segredo não confere", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao("Bearer segredo-errado"));

    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("não vaza dado de fornecedor na resposta de negação", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao("Bearer errado"));
    const corpo = await res.text();

    expect(corpo).not.toContain("Fornecedora Exemplo");
    expect(corpo).not.toContain("2026/0042");
  });

  it("autoriza com o Bearer correto e devolve as cotações pendentes", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    const res = await GET(requisicao("Bearer segredo-correto"));
    const corpo = (await res.json()) as {
      pendentes: Array<Record<string, unknown>>;
      executadoEm: string;
    };

    expect(res.status).toBe(200);
    expect(corpo.pendentes).toHaveLength(1);
    expect(corpo.pendentes[0]).toMatchObject({
      cotacaoId: "cot-1",
      fornecedor: "Fornecedora Exemplo LTDA",
      processoNumero: "2026/0042",
    });
    expect(corpo.executadoEm).toBeTruthy();
  });

  // A §9.3 proíbe o sistema de enviar e-mail: o job só relata.
  it("apenas consulta — a janela é de 3 dias e status silenciosa", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-correto");

    await GET(requisicao("Bearer segredo-correto"));

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    const argumento = mocks.findMany.mock.calls[0]![0] as {
      where: { status: string; dataLimite: { gt: Date; lte: Date } };
    };
    expect(argumento.where.status).toBe("silenciosa");
    const janelaMs =
      argumento.where.dataLimite.lte.getTime() - argumento.where.dataLimite.gt.getTime();
    expect(janelaMs).toBe(3 * 24 * 60 * 60 * 1000);
  });
});
