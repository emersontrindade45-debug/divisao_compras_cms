import { describe, expect, it } from "vitest";
import { CAIXA_DA_DIVISAO, linkDoGmail } from "../gmail";

describe("linkDoGmail", () => {
  it("abre a mensagem na conta da Divisão, não na conta que estiver em primeiro no navegador", () => {
    const url = new URL(linkDoGmail("18c1fabc"));
    expect(url.origin).toBe("https://mail.google.com");
    expect(url.searchParams.get("authuser")).toBe(CAIXA_DA_DIVISAO);
    expect(url.hash).toBe("#all/18c1fabc");
  });

  it("um id com caracteres estranhos não escapa do fragmento", () => {
    expect(linkDoGmail("a/b?c#d")).toContain("#all/a%2Fb%3Fc%23d");
  });
});
