import { describe, it, expect } from "vitest";
import { NAV_GROUPS, NAV_ITEMS } from "../navigation";

describe("NAV_GROUPS", () => {
  it("agrupa a navegação em Operação, Cadastros e Consulta", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Operação",
      "Cadastros",
      "Consulta",
    ]);
  });

  it("Operação contém o trabalho diário (dashboard, processos, cotações)", () => {
    const operacao = NAV_GROUPS.find((g) => g.label === "Operação");
    expect(operacao?.items.map((i) => i.href)).toEqual([
      "/dashboard",
      "/processos",
      "/cotacoes",
    ]);
  });

  it("Guia de uso não aparece na sidebar (vive no menu do usuário)", () => {
    const hrefsNaSidebar = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href);
    expect(hrefsNaSidebar).not.toContain("/onboarding");
  });

  it("nenhum destino se repete entre grupos", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("NAV_ITEMS", () => {
  it("mantém a lista plana com todos os destinos, incluindo o guia de uso", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toContain("/onboarding");
    expect(NAV_ITEMS).toHaveLength(NAV_GROUPS.flatMap((g) => g.items).length + 1);
  });

  it("todo item tem label e ícone", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
    }
  });
});
