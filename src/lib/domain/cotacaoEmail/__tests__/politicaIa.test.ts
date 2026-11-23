import { describe, expect, it } from "vitest";
import { adotavelPelaPolitica } from "../politicaIa";

describe("adotavelPelaPolitica", () => {
  it.each(["a_confirmar", "sem_resposta"])("adota recusa e dúvida em consulta aberta (%s)", (situacaoConsulta) => {
    expect(adotavelPelaPolitica({ classeIa: "recusa", situacaoConsulta })).toBe(true);
    expect(adotavelPelaPolitica({ classeIa: "duvida", situacaoConsulta })).toBe(true);
  });

  it("NUNCA adota orçamento nem 'não é resposta' (a IA discordou do analista em quase todos os casos medidos)", () => {
    for (const classeIa of ["orcamento", "nao_e_resposta"]) {
      expect(adotavelPelaPolitica({ classeIa, situacaoConsulta: "a_confirmar" })).toBe(false);
    }
  });

  it.each(["orcamento", "recusa", "duvida", "email_invalido"])(
    "NUNCA sobrescreve consulta já decidida (%s)",
    (situacaoConsulta) => {
      expect(adotavelPelaPolitica({ classeIa: "recusa", situacaoConsulta })).toBe(false);
      expect(adotavelPelaPolitica({ classeIa: "duvida", situacaoConsulta })).toBe(false);
    },
  );

  it("classe desconhecida não entra", () => {
    expect(adotavelPelaPolitica({ classeIa: "outra", situacaoConsulta: "a_confirmar" })).toBe(false);
    expect(adotavelPelaPolitica({ classeIa: "", situacaoConsulta: "a_confirmar" })).toBe(false);
  });
});
