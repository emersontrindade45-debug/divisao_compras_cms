import { describe, it, expect } from "vitest";
import { priorizarFilaTrabalho, type FilaInput } from "../filaTrabalho";

function proc(overrides: Partial<FilaInput> = {}): FilaInput {
  return {
    processoId: "p1",
    numero: "2026/001",
    objeto: "Aquisição de material",
    status: "pendente",
    temFontePublica: true,
    cotacoesVencidas: 0,
    propostasPendentes: 0,
    precosIncluidos: 3,
    coeficienteVariacao: 10,
    temPesquisaIniciada: true,
    ...overrides,
  };
}

describe("priorizarFilaTrabalho", () => {
  it("processo aderente (concluído) não entra na fila", () => {
    const fila = priorizarFilaTrabalho([
      proc({ status: "aderente", cotacoesVencidas: 2 }),
    ]);
    expect(fila).toHaveLength(0);
  });

  it("processo sem pendência não entra na fila", () => {
    const fila = priorizarFilaTrabalho([proc()]);
    expect(fila).toHaveLength(0);
  });

  it("cotação vencida é a maior urgência", () => {
    const fila = priorizarFilaTrabalho([
      proc({ processoId: "a", numero: "2026/001", temFontePublica: false }),
      proc({ processoId: "b", numero: "2026/002", cotacoesVencidas: 1 }),
    ]);
    expect(fila[0]?.processoId).toBe("b");
    expect(fila[0]?.urgencia).toBe(1);
    expect(fila[0]?.proximaAcao).toContain("vencida");
  });

  it("ordem completa de urgência: vencida > sem fonte pública > proposta pendente > série incompleta > CV alto", () => {
    const fila = priorizarFilaTrabalho([
      proc({ processoId: "cv", numero: "2026/005", coeficienteVariacao: 35 }),
      proc({ processoId: "serie", numero: "2026/004", precosIncluidos: 1 }),
      proc({ processoId: "proposta", numero: "2026/003", propostasPendentes: 2 }),
      proc({ processoId: "fonte", numero: "2026/002", temFontePublica: false }),
      proc({ processoId: "vencida", numero: "2026/001", cotacoesVencidas: 1 }),
    ]);
    expect(fila.map((f) => f.processoId)).toEqual([
      "vencida",
      "fonte",
      "proposta",
      "serie",
      "cv",
    ]);
  });

  it("cada regra gera href com a etapa correspondente", () => {
    const fila = priorizarFilaTrabalho([
      proc({ processoId: "x", cotacoesVencidas: 1 }),
      proc({ processoId: "y", numero: "2026/002", temFontePublica: false }),
      proc({ processoId: "z", numero: "2026/003", coeficienteVariacao: 40 }),
    ]);
    expect(fila.find((f) => f.processoId === "x")?.href).toBe(
      "/processos/x?etapa=validacao",
    );
    expect(fila.find((f) => f.processoId === "y")?.href).toBe(
      "/processos/y?etapa=pesquisa",
    );
    expect(fila.find((f) => f.processoId === "z")?.href).toBe(
      "/processos/z?etapa=consolidacao",
    );
  });

  it("série incompleta só conta com pesquisa iniciada", () => {
    const fila = priorizarFilaTrabalho([
      proc({ precosIncluidos: 1, temPesquisaIniciada: false }),
    ]);
    expect(fila).toHaveLength(0);
  });

  it("CV no limiar exato (30) não dispara; 30.1 dispara", () => {
    const noLimiar = priorizarFilaTrabalho([proc({ coeficienteVariacao: 30 })]);
    const acima = priorizarFilaTrabalho([proc({ coeficienteVariacao: 30.1 })]);
    expect(noLimiar).toHaveLength(0);
    expect(acima).toHaveLength(1);
  });

  it("empate de urgência ordena por número do processo", () => {
    const fila = priorizarFilaTrabalho([
      proc({ processoId: "b", numero: "2026/010", temFontePublica: false }),
      proc({ processoId: "a", numero: "2026/002", temFontePublica: false }),
    ]);
    expect(fila.map((f) => f.numero)).toEqual(["2026/002", "2026/010"]);
  });
});
