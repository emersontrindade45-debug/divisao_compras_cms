import { describe, expect, it } from "vitest";
import { classificarResposta, type MarcadoresResposta } from "../classificarResposta";

const base: MarcadoresResposta = {
  devolucao: false,
  automatica: false,
  temAnexoOrcamento: false,
  contemRecusa: false,
  contemValor: false,
};
const c = (o: Partial<MarcadoresResposta>) => classificarResposta({ ...base, ...o });

describe("classificarResposta", () => {
  it("anexo de orçamento aplica 'orcamento'", () => {
    expect(c({ temAnexoOrcamento: true })).toEqual({
      acao: "aplicar",
      situacao: "orcamento",
      regra: "anexo_orcamento",
    });
  });

  it("frase de recusa aplica 'recusa'", () => {
    expect(c({ contemRecusa: true })).toEqual({
      acao: "aplicar",
      situacao: "recusa",
      regra: "frase_recusa",
    });
  });

  it("anexo E recusa se contradizem: vai para a fila", () => {
    expect(c({ temAnexoOrcamento: true, contemRecusa: true }).acao).toBe("fila");
  });

  it("recusa que cita valor em R$ não é aplicada sozinha", () => {
    expect(c({ contemRecusa: true, contemValor: true }).acao).toBe("fila");
  });

  it("valor no texto sem anexo nem recusa vai para a fila (não é prova de orçamento)", () => {
    expect(c({ contemValor: true }).acao).toBe("fila");
  });

  it("sem nenhum sinal vai para a fila", () => {
    expect(c({})).toEqual({ acao: "fila", motivo: "sinais_ambiguos" });
  });

  it("devolução tem prioridade sobre qualquer outro sinal", () => {
    expect(c({ devolucao: true, temAnexoOrcamento: true, contemRecusa: true }).acao).toBe("devolucao");
  });

  it("resposta automática é ignorada, mesmo com anexo", () => {
    expect(c({ automatica: true, temAnexoOrcamento: true })).toEqual({
      acao: "ignorar",
      motivo: "automatica",
    });
  });
});
