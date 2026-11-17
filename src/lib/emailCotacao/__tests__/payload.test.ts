import { describe, expect, it } from "vitest";
import { payloadScriptSchema } from "../payload";

const envio = {
  id: "19a1",
  fio: "19a0",
  data: "2026-11-16T15:00:00.000Z",
  destinatarios: ["a@b.com.br"],
  processo: "382",
  prazo: "2026-11-23",
  prazoOrigem: "assunto",
};
const resposta = {
  id: "19a2",
  fio: "19a0",
  envioId: "19a1",
  data: "2026-11-17T10:00:00.000Z",
  remetente: "a@b.com.br",
  processo: "382",
  remetenteEraDestinatario: true,
  devolucao: false,
  enderecosDevolvidos: [],
  automatica: false,
  temAnexoOrcamento: true,
  contemRecusa: false,
  contemValor: false,
};

describe("payloadScriptSchema", () => {
  it("aceita o formato combinado", () => {
    expect(payloadScriptSchema.safeParse({ envios: [envio], respostas: [resposta] }).success).toBe(true);
  });

  it("recusa um campo de conteúdo que o script não deveria devolver (trava de sigilo)", () => {
    const comAssunto = { envios: [{ ...envio, assunto: "texto do assunto" }], respostas: [] };
    expect(payloadScriptSchema.safeParse(comAssunto).success).toBe(false);
    const comCorpo = { envios: [], respostas: [{ ...resposta, corpo: "texto" }] };
    expect(payloadScriptSchema.safeParse(comCorpo).success).toBe(false);
  });

  it("o campo 'processo' não carrega texto livre", () => {
    const r = payloadScriptSchema.safeParse({
      envios: [{ ...envio, processo: "382 - Manutenção Predial" }],
      respostas: [],
    });
    expect(r.success).toBe(false);
  });

  it("recusa a resposta de erro do script", () => {
    expect(payloadScriptSchema.safeParse({ erro: "nao_autorizado" }).success).toBe(false);
  });

  it("recusa data que não é um instante ISO", () => {
    expect(payloadScriptSchema.safeParse({ envios: [{ ...envio, data: "16/11/2026" }], respostas: [] }).success).toBe(false);
  });

  it("aceita o diagnóstico do script", () => {
    const r = payloadScriptSchema.safeParse({
      envios: [],
      respostas: [],
      diagnostico: { versao: "efetivo-1", contaEfetiva: "x@y.gov.br", contaAtiva: "(vazia)", fiosEncontrados: 24 },
    });
    expect(r.success).toBe(true);
  });

  it("aceita o campo opcional provavelRecusa e recusa um valor que não é booleano", () => {
    const base = { envios: [envio], respostas: [{ ...resposta, provavelRecusa: true }] };
    expect(payloadScriptSchema.safeParse(base).success).toBe(true);
    const ruim = { envios: [envio], respostas: [{ ...resposta, provavelRecusa: "sim" }] };
    expect(payloadScriptSchema.safeParse(ruim).success).toBe(false);
  });
});
