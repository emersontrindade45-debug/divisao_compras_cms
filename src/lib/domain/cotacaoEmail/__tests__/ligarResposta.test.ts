import { describe, expect, it } from "vitest";
import { ligarRemetente } from "../ligarResposta";

const DEST = [
  "vendas@acmelimpeza.com.br",
  "comercial@betaservicos.com.br",
  "contato.gama@gmail.com",
  "orcamento@deltapredial.com.br",
  "compras@deltapredial.com.br",
];

describe("ligarRemetente", () => {
  it("mesmo endereço é ligação exata, ignorando caixa", () => {
    expect(ligarRemetente("Vendas@AcmeLimpeza.com.br", DEST)).toEqual({
      tipo: "exato",
      email: "vendas@acmelimpeza.com.br",
    });
  });

  it("outro endereço do mesmo domínio liga quando só um destinatário usa o domínio", () => {
    expect(ligarRemetente("joao.silva@acmelimpeza.com.br", DEST)).toEqual({
      tipo: "dominio",
      email: "vendas@acmelimpeza.com.br",
    });
  });

  it("domínio genérico nunca liga por domínio", () => {
    // gmail.com ESTÁ entre os destinatários (contato.gama@gmail.com) — se a lista de genéricos
    // sumisse, este caso ligaria à Gama por engano.
    expect(ligarRemetente("gama.orcamentos@gmail.com", DEST)).toEqual({
      tipo: "fila",
      motivo: "dominio_generico",
    });
  });

  it("domínio com dois destinatários é ambíguo", () => {
    expect(ligarRemetente("diretoria@deltapredial.com.br", DEST)).toEqual({
      tipo: "fila",
      motivo: "dominio_ambiguo",
    });
  });

  it("domínio que não está no envio é remetente desconhecido", () => {
    expect(ligarRemetente("ana@empresadesconhecida.com.br", DEST)).toEqual({
      tipo: "fila",
      motivo: "remetente_desconhecido",
    });
  });

  it("endereço exato vale mesmo em domínio genérico", () => {
    expect(ligarRemetente("contato.gama@gmail.com", DEST)).toEqual({
      tipo: "exato",
      email: "contato.gama@gmail.com",
    });
  });

  it("destinatário repetido no envio (Para e Cc) não vira ambiguidade", () => {
    expect(ligarRemetente("x@acme.com.br", ["vendas@acme.com.br", "VENDAS@acme.com.br"])).toEqual({
      tipo: "dominio",
      email: "vendas@acme.com.br",
    });
  });

  it("subdomínio não é o mesmo domínio", () => {
    expect(ligarRemetente("x@mail.acmelimpeza.com.br", DEST).tipo).toBe("fila");
  });

  it("remetente sem arroba vai para a fila", () => {
    expect(ligarRemetente("lixo", DEST)).toEqual({ tipo: "fila", motivo: "remetente_desconhecido" });
  });
});
