import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lerAba = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/sheets/googleAuth", () => ({ lerAbaAutenticado: lerAba }));

const ID = "1aXZqYWNer-ZcF9G37DAtAU2Jr40H7XPUN1pEQuPFXng";
const CAB = ["Mês", "E-mails enviados", "Destinatários", "Orçamento", "Recusa", "Dúvida", "Só confirmou/outra", "Sem resposta", "Endereço errado", "Devolvido (outro)", "% retorno útil"];
const JAN = ["2026-01", "33", "1.895", "16", "28", "3", "4", "1.838", "3", "3", "2,6%"];

async function carregar() {
  vi.resetModules(); // cache é estado de módulo (§9.34)
  return (await import("../fornecedores")).carregarFornecedores;
}

describe("carregarFornecedores", () => {
  const antes = process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID;
  beforeEach(() => {
    lerAba.mockReset();
    process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID = ID;
  });
  afterEach(() => {
    vi.useRealTimers();
    if (antes === undefined) delete process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID;
    else process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID = antes;
  });

  it("sem id configurado: não configurada, sem tocar no Google", async () => {
    delete process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID;
    expect(await (await carregar())()).toEqual({ estado: "nao_configurada" });
    expect(lerAba).not.toHaveBeenCalled();
  });

  it("id com formato inválido: indisponível, sem tocar no Google", async () => {
    process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID = "curto";
    expect(await (await carregar())()).toMatchObject({ estado: "indisponivel" });
    expect(lerAba).not.toHaveBeenCalled();
  });

  it.each([
    [ID],
    [`  ${ID}  `],
    [`"${ID}"`],
    [`'${ID}'`],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`],
    [`https://docs.google.com/spreadsheets/d/${ID}`],
  ])("aceita o id colado de jeitos comuns (%s) e lê a planilha pelo id limpo", async (valor) => {
    process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID = valor;
    lerAba.mockResolvedValue([CAB, JAN]);
    const r = await (await carregar())();
    expect(r.estado).toBe("ok");
    expect(lerAba).toHaveBeenCalledWith(ID, "Por mês");
  });

  it.each(["https://example.com/outra-coisa", "a b c", "curto"])("valor inválido (%s) ensina o que colocar", async (valor) => {
    process.env.LEVANTAMENTO_GMAIL_PLANILHA_ID = valor;
    const r = await (await carregar())();
    expect(r).toMatchObject({ estado: "indisponivel", motivo: expect.stringContaining("entre /d/ e /edit") });
    expect(lerAba).not.toHaveBeenCalled();
  });

  it("lê a aba “Por mês” pelo nome", async () => {
    lerAba.mockResolvedValue([CAB, JAN]);
    const r = await (await carregar())();
    expect(lerAba).toHaveBeenCalledWith(ID, "Por mês");
    expect(r).toMatchObject({ estado: "ok", inconsistentes: [] });
  });

  it("falha de acesso e cabeçalho ilegível viram indisponível com motivo (nunca zero)", async () => {
    lerAba.mockRejectedValueOnce(new Error("403"));
    expect(await (await carregar())()).toMatchObject({ estado: "indisponivel", motivo: expect.stringContaining("conta de serviço") });
    lerAba.mockResolvedValueOnce([["x"], ["y"]]);
    expect(await (await carregar())()).toMatchObject({ estado: "indisponivel", motivo: expect.stringContaining("Cabeçalho") });
  });

  it("guarda 1 hora, não guarda falha e junta leituras simultâneas", async () => {
    vi.useFakeTimers();
    const carregarFornecedores = await carregar();
    lerAba.mockRejectedValueOnce(new Error("503")).mockResolvedValue([CAB, JAN]);
    expect((await carregarFornecedores()).estado).toBe("indisponivel");
    expect((await carregarFornecedores()).estado).toBe("ok"); // a falha não ficou no cache
    expect(lerAba).toHaveBeenCalledTimes(2);
    await carregarFornecedores();
    expect(lerAba).toHaveBeenCalledTimes(2); // dentro da hora: do cache
    vi.advanceTimersByTime(3_600_000 - 1);
    await carregarFornecedores();
    expect(lerAba).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await carregarFornecedores();
    expect(lerAba).toHaveBeenCalledTimes(3); // no limite exato, relê
  });

  it("duas telas pedindo juntas fazem uma leitura só", async () => {
    const carregarFornecedores = await carregar();
    lerAba.mockResolvedValue([CAB, JAN]);
    await Promise.all([carregarFornecedores(), carregarFornecedores()]);
    expect(lerAba).toHaveBeenCalledTimes(1);
  });
});
