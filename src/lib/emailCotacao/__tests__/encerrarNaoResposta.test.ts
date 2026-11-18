import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    respostaEmailPendente: { findMany: vi.fn(), updateMany: vi.fn() },
    classificacaoIaResposta: { findMany: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { encerrarNaoRespostaEmLote, listarEncerraveisNaoResposta } from "../encerrarNaoResposta";

describe("encerrar não-resposta sem fornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([
      { id: "p1", gmailMensagemId: "m1" },
      { id: "p2", gmailMensagemId: "m2" },
      { id: "p3", gmailMensagemId: "m3" },
    ]);
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }, { gmailMensagemId: "m3" }]);
    mocks.db.respostaEmailPendente.updateMany.mockResolvedValue({ count: 2 });
  });

  it("só entra pendente aberta, SEM fornecedor ligado, dos 3 motivos sem fornecedor", async () => {
    await listarEncerraveisNaoResposta();
    expect(mocks.db.respostaEmailPendente.findMany.mock.calls[0][0].where).toEqual({
      resolvidaEm: null,
      sugestaoConsultaId: null,
      motivo: { in: ["remetente_desconhecido", "dominio_ambiguo", "dominio_generico"] },
    });
  });

  it("só a leitura 'não é resposta' com confiança ALTA conta", async () => {
    await listarEncerraveisNaoResposta();
    expect(mocks.db.classificacaoIaResposta.findMany.mock.calls[0][0].where).toEqual({
      gmailMensagemId: { in: ["m1", "m2", "m3"] },
      classeIa: "nao_e_resposta",
      confianca: "alta",
    });
  });

  it("devolve só os ids que a IA confirmou", async () => {
    expect(await listarEncerraveisNaoResposta()).toEqual(["p1", "p3"]);
  });

  it("sem pendentes abertas nem consulta à IA", async () => {
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
    expect(await listarEncerraveisNaoResposta()).toEqual([]);
    expect(mocks.db.classificacaoIaResposta.findMany).not.toHaveBeenCalled();
  });

  it("encerra com guarda atômica (resolvidaEm null no WHERE) e não toca consulta nenhuma", async () => {
    const r = await encerrarNaoRespostaEmLote();
    expect(r).toEqual({ ids: ["p1", "p3"], encerradas: 2 });
    const arg = mocks.db.respostaEmailPendente.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: { in: ["p1", "p3"] }, resolvidaEm: null });
    expect(Object.keys(arg.data)).toEqual(["resolvidaEm"]);
  });

  it("nada a encerrar: não escreve", async () => {
    mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
    expect(await encerrarNaoRespostaEmLote()).toEqual({ ids: [], encerradas: 0 });
    expect(mocks.db.respostaEmailPendente.updateMany).not.toHaveBeenCalled();
  });
});
