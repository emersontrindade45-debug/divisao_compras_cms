import { describe, expect, it } from "vitest";
import { resumirVerificacao, type ResumoVerificacao } from "../resumo";

const zero: ResumoVerificacao = {
  envios: 5, enviosNovos: 0, consultasNovas: 0, respostasClassificadas: 0,
  respostasNaFila: 0, emailsInvalidos: 0, enviosSemProcesso: 0,
};

describe("resumirVerificacao", () => {
  it("sem novidade, diz isso em vez de uma lista de zeros", () => {
    expect(resumirVerificacao(zero)).toBe("E-mails lidos: nada novo desde a última verificação.");
  });
  it("só menciona o que mudou, com singular e plural", () => {
    expect(resumirVerificacao({ ...zero, enviosNovos: 1, respostasClassificadas: 2 })).toBe(
      "E-mails lidos: 1 envio novo, 2 respostas classificadas.",
    );
  });
  it("formata milhares em pt-BR", () => {
    expect(resumirVerificacao({ ...zero, consultasNovas: 2330 })).toContain("2.330 fornecedores consultados");
  });
});
