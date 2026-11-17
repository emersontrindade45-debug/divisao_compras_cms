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

  describe("recusa provável (script corpo-3)", () => {
    it("sem sinal claro mas com frase de recusa ampla: vai à fila com motivo próprio, nunca é aplicada", () => {
      expect(c({ provavelRecusa: true })).toEqual({ acao: "fila", motivo: "provavel_recusa" });
    });

    it("com anexo de orçamento, vale o anexo: a recusa provável não muda o resultado", () => {
      expect(c({ provavelRecusa: true, temAnexoOrcamento: true })).toEqual({
        acao: "aplicar",
        situacao: "orcamento",
        regra: "anexo_orcamento",
      });
    });

    it("com R$ no texto, não é recusa provável (pode ser proposta)", () => {
      expect(c({ provavelRecusa: true, contemValor: true })).toEqual({
        acao: "fila",
        motivo: "sinais_ambiguos",
      });
    });

    it("a frase de recusa da lista fixa continua sendo aplicada, não só sugerida", () => {
      expect(c({ contemRecusa: true, provavelRecusa: true })).toEqual({
        acao: "aplicar",
        situacao: "recusa",
        regra: "frase_recusa",
      });
    });

    it("payload do script antigo (sem o campo) segue como antes", () => {
      expect(c({})).toEqual({ acao: "fila", motivo: "sinais_ambiguos" });
    });
  });

  describe("possível orçamento e possível dúvida (sugestões, nunca aplicam)", () => {
    it("'segue em anexo…' sem anexo reconhecido: vai à fila como possível orçamento", () => {
      expect(c({ provavelOrcamento: true })).toEqual({ acao: "fila", motivo: "provavel_orcamento" });
    });

    it("pergunta do fornecedor: vai à fila como possível dúvida", () => {
      expect(c({ provavelDuvida: true })).toEqual({ acao: "fila", motivo: "provavel_duvida" });
    });

    it("orçamento vence dúvida quando as duas aparecem", () => {
      expect(c({ provavelOrcamento: true, provavelDuvida: true })).toEqual({
        acao: "fila",
        motivo: "provavel_orcamento",
      });
    });

    it("recusa provável vence dúvida", () => {
      expect(c({ provavelRecusa: true, provavelDuvida: true })).toEqual({
        acao: "fila",
        motivo: "provavel_recusa",
      });
    });

    it("orçamento E recusa prováveis se contradizem: ninguém é sugerido", () => {
      expect(c({ provavelRecusa: true, provavelOrcamento: true })).toEqual({
        acao: "fila",
        motivo: "sinais_ambiguos",
      });
    });

    it("a lista fixa de recusa e o anexo continuam mandando mais que qualquer sugestão", () => {
      expect(c({ contemRecusa: true, provavelDuvida: true })).toMatchObject({ acao: "aplicar", situacao: "recusa" });
      expect(c({ temAnexoOrcamento: true, provavelDuvida: true })).toMatchObject({ acao: "aplicar", situacao: "orcamento" });
    });

    it("dúvida não é sugerida quando há sinal de orçamento e recusa que se contradizem", () => {
      expect(c({ temAnexoOrcamento: true, contemRecusa: true, provavelDuvida: true })).toEqual({
        acao: "fila",
        motivo: "sinais_ambiguos",
      });
    });

    it("script antigo (sem os campos) segue como antes", () => {
      expect(c({ contemValor: true })).toEqual({ acao: "fila", motivo: "sinais_ambiguos" });
    });
  });
});
