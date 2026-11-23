import { describe, expect, it } from "vitest";
import { acaoDeFechamento, aplicavelNaConsultaOrfa, dentroDaDispensa } from "../fechamentoIa";

describe("acaoDeFechamento", () => {
  it.each(["orcamento", "recusa", "duvida", "nao_e_resposta"])("consulta aberta: aplica a sugestão da IA (%s)", (classeIa) => {
    expect(acaoDeFechamento({ classeIa, situacaoConsulta: "a_confirmar" })).toBe("aplicar");
    expect(acaoDeFechamento({ classeIa, situacaoConsulta: "sem_resposta" })).toBe("aplicar");
  });

  it.each(["orcamento", "recusa", "duvida", "email_invalido"])(
    "consulta JÁ decidida (%s): só encerra a entrada, NUNCA aplica por cima",
    (situacaoConsulta) => {
      for (const classeIa of ["orcamento", "recusa", "duvida", "nao_e_resposta"]) {
        expect(acaoDeFechamento({ classeIa, situacaoConsulta })).toBe("fechar_sem_alterar");
      }
    },
  );

  it("classe desconhecida em consulta aberta é ignorada; situação desconhecida também", () => {
    expect(acaoDeFechamento({ classeIa: "outra", situacaoConsulta: "a_confirmar" })).toBe("ignorar");
    expect(acaoDeFechamento({ classeIa: "recusa", situacaoConsulta: "qualquer" })).toBe("ignorar");
  });
});

describe("dentroDaDispensa", () => {
  it("vale de 1º/out/2025 a 31/dez/2025, com os limites exatos", () => {
    expect(dentroDaDispensa(new Date("2025-10-01T00:00:00-03:00"))).toBe(true);
    expect(dentroDaDispensa(new Date("2025-12-31T23:59:59-03:00"))).toBe(true);
    expect(dentroDaDispensa(new Date("2025-09-30T23:59:59-03:00"))).toBe(false);
    expect(dentroDaDispensa(new Date("2026-01-01T00:00:00-03:00"))).toBe(false);
  });
});

describe("aplicavelNaConsultaOrfa", () => {
  it.each(["orcamento", "recusa", "duvida", "nao_e_resposta"])("a_confirmar + leitura da IA (%s): aplica na consulta", (classeIa) => {
    expect(aplicavelNaConsultaOrfa({ classeIa, situacaoConsulta: "a_confirmar" })).toBe(true);
  });

  it.each(["sem_resposta", "orcamento", "recusa", "duvida", "email_invalido"])(
    "consulta que NÃO está a confirmar (%s) é preservada",
    (situacaoConsulta) => {
      expect(aplicavelNaConsultaOrfa({ classeIa: "recusa", situacaoConsulta })).toBe(false);
    },
  );

  it("classe desconhecida não entra", () => {
    expect(aplicavelNaConsultaOrfa({ classeIa: "outra", situacaoConsulta: "a_confirmar" })).toBe(false);
  });
});
