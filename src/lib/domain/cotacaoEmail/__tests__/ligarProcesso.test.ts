import { describe, expect, it } from "vitest";
import { lerNumeroProcesso, ligarProcesso } from "../ligarProcesso";

describe("lerNumeroProcesso", () => {
  it("lê número/ano, tirando zeros à esquerda", () => {
    expect(lerNumeroProcesso("0382/2026")).toEqual({ numero: "382", ano: 2026 });
  });
  it("lê ano/número (formato dos dados de exemplo)", () => {
    expect(lerNumeroProcesso("2026/001")).toEqual({ numero: "1", ano: 2026 });
  });
  it("lê só o número, como vem do assunto", () => {
    expect(lerNumeroProcesso("382")).toEqual({ numero: "382", ano: null });
  });
  it("texto que não é número devolve null", () => {
    expect(lerNumeroProcesso("abc")).toBeNull();
  });
});

describe("ligarProcesso", () => {
  const P = [
    { id: "a", numero: "0382/2026" },
    { id: "b", numero: "05515/2026" },
  ];

  it("liga por número ignorando zeros e ano", () => {
    expect(ligarProcesso("382", 2026, P)).toBe("a");
    expect(ligarProcesso("5515", 2026, P)).toBe("b");
  });

  it("número inexistente fica sem ligação (aguardando o processo)", () => {
    expect(ligarProcesso("999", 2026, P)).toBeNull();
  });

  it("dois processos com o mesmo número: vale o do ano do envio", () => {
    const dois = [...P, { id: "c", numero: "0382/2025" }];
    expect(ligarProcesso("382", 2025, dois)).toBe("c");
    expect(ligarProcesso("382", 2026, dois)).toBe("a");
  });

  it("dois processos e nenhum do ano do envio: não adivinha", () => {
    const dois = [{ id: "c", numero: "0382/2025" }, { id: "d", numero: "0382/2024" }];
    expect(ligarProcesso("382", 2026, dois)).toBeNull();
  });

  it("sem número no assunto, sem ligação", () => {
    expect(ligarProcesso(null, 2026, P)).toBeNull();
  });
});
