import { describe, expect, it } from "vitest";
import { escopoPadrao, resumirCamadaAcao, type ProcessoAcaoInput } from "../camadaAcao";

const AGORA = new Date("2026-11-16T12:00:00Z");

function proc(over: Partial<ProcessoAcaoInput> = {}): ProcessoAcaoInput {
  return {
    status: "pendente",
    faseAndamento: "em_andamento",
    responsavelId: "u1",
    temPrecoPublico: true,
    ...over,
  };
}

describe("resumirCamadaAcao", () => {
  it("sem fonte pública conta processos ativos sem preço público — não o status nao_aderente", () => {
    const r = resumirCamadaAcao(
      [
        proc({ temPrecoPublico: false }),
        proc({ status: "parcial", temPrecoPublico: false }),
        // Não aderente MAS com preço público: não é "sem fonte pública".
        proc({ status: "nao_aderente", temPrecoPublico: true }),
        // Sem preço público mas concluído: não é pendência.
        proc({ faseAndamento: "concluido", temPrecoPublico: false }),
        proc({ status: "aderente", temPrecoPublico: false }),
      ],
      [],
      AGORA,
    );
    // Contagens escolhidas para a definição antiga (status nao_aderente = 1)
    // NÃO coincidir com a correta (2) — senão o teste não distingue as duas.
    expect(r.ativos).toBe(3);
    expect(r.semFontePublica).toBe(2);
  });

  it("sem responsável conta só processos ativos", () => {
    const r = resumirCamadaAcao(
      [proc({ responsavelId: null }), proc({ responsavelId: null, faseAndamento: "concluido" })],
      [],
      AGORA,
    );
    expect(r.semResponsavel).toBe(1);
  });

  it("cotações: sem resposta e vencidas pelo prazo", () => {
    const r = resumirCamadaAcao(
      [],
      [
        { status: "silenciosa", dataLimite: new Date("2026-11-10") },
        { status: "silenciosa", dataLimite: new Date("2026-11-20") },
        { status: "positiva", dataLimite: new Date("2026-11-01") },
      ],
      AGORA,
    );
    expect(r.semResposta).toBe(2);
    expect(r.vencidas).toBe(1);
  });
});

describe("escopoPadrao", () => {
  it("analista com processos vê os seus", () => {
    expect(escopoPadrao("pesquisa", 2)).toBe("meus");
  });
  it("analista sem nenhum processo atribuído vê todos (tela não abre vazia)", () => {
    expect(escopoPadrao("pesquisa", 0)).toBe("todos");
  });
  it("chefia vê todos", () => {
    expect(escopoPadrao("aprovacao", 5)).toBe("todos");
    expect(escopoPadrao("revisao", 5)).toBe("todos");
  });
});
