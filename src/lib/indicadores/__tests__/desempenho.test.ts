import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    processo: { findMany: vi.fn() },
    proposta: { findMany: vi.fn() },
    consultaCotacao: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { carregarCamadaDesempenho } from "../desempenho";

const AGORA = new Date("2026-11-16T12:00:00Z");
const ENVIO = new Date("2026-11-10T12:00:00Z");

function linha(over: {
  situacao?: "sem_resposta" | "orcamento" | "recusa" | "a_confirmar" | "email_invalido";
  processoId?: string | null;
  numero?: string | null;
  assunto?: string | null;
}) {
  return {
    situacao: over.situacao ?? "sem_resposta",
    dataResposta: null,
    envio: {
      dataEnvio: ENVIO,
      processoId: over.processoId ?? null,
      numeroProcessoAssunto: over.assunto ?? null,
      processo: over.numero ? { numero: over.numero } : null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.processo.findMany.mockResolvedValue([]);
  dbMock.proposta.findMany.mockResolvedValue([]);
  dbMock.consultaCotacao.findMany.mockResolvedValue([]);
});

describe("carregarCamadaDesempenho — taxa de resposta por processo", () => {
  it("pede ao banco o número do processo e o do assunto, e não o CNAE (select explícito, §9.46)", async () => {
    await carregarCamadaDesempenho("30d", "todos", "u1", AGORA);

    const arg = dbMock.consultaCotacao.findMany.mock.calls[0]![0];
    expect(arg.select.envio.select).toEqual({
      dataEnvio: true,
      processoId: true,
      numeroProcessoAssunto: true,
      processo: { select: { numero: true } },
    });
    expect(arg.select.cnaeDescricao).toBeUndefined();
    expect(arg.select).not.toHaveProperty("include");
  });

  it("agrupa por número do processo; sem vínculo usa o número do assunto; devolvido fica fora", async () => {
    dbMock.consultaCotacao.findMany.mockResolvedValue([
      linha({ situacao: "orcamento", processoId: "p1", numero: "0736/2025" }),
      linha({ situacao: "sem_resposta", processoId: "p1", numero: "0736/2025" }),
      linha({ situacao: "recusa", assunto: "382" }),
      linha({ situacao: "email_invalido", processoId: "p1", numero: "0736/2025" }),
    ]);

    const { porProcesso } = await carregarCamadaDesempenho("30d", "todos", "u1", AGORA);

    expect(porProcesso).toEqual([
      { chave: "p:p1", processo: "0736/2025", enviadas: 2, respondidas: 1, taxa: 50 },
      { chave: "a:382", processo: "Nº 382 · não cadastrado", enviadas: 1, respondidas: 1, taxa: 100 },
    ]);
  });

  it("escopo 'meus' filtra os envios pelo responsável do processo", async () => {
    await carregarCamadaDesempenho("30d", "meus", "u1", AGORA);

    const where = dbMock.consultaCotacao.findMany.mock.calls[0]![0].where;
    expect(where.envio.processo).toEqual({ responsavelId: "u1" });
  });
});
