import { describe, expect, it } from "vitest";
import { mascararCnpj } from "../cnpj";

describe("mascararCnpj", () => {
  it("aplica a máscara XX.XXX.XXX/XXXX-XX a um CNPJ de 14 dígitos", () => {
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve a entrada inalterada quando não tem 14 dígitos", () => {
    expect(mascararCnpj("123")).toBe("123");
    expect(mascararCnpj("")).toBe("");
  });
});
