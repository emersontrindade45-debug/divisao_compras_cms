import { describe, expect, it } from "vitest";
import { filtrarProcessos } from "../processoFilter";
import { PROCESSOS } from "@/lib/fixtures/processos";
import type { FiltrosProcesso } from "@/components/processos/ProcessoFilters";

const VAZIO: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

describe("filtrarProcessos", () => {
  it("sem filtros retorna todos", () => {
    expect(filtrarProcessos(PROCESSOS, VAZIO)).toHaveLength(PROCESSOS.length);
  });

  it("filtra por texto no objeto (case-insensitive)", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, busca: "CADEIRA" });
    expect(r).toHaveLength(1);
    expect(r[0].numero).toBe("2026/001");
  });

  it("filtra por número do processo", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, busca: "2026/004" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("proc-004");
  });

  it("filtra por status", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, status: "pendente" });
    expect(r.every((p) => p.status === "pendente")).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it("filtra por responsável", () => {
    const r = filtrarProcessos(PROCESSOS, { ...VAZIO, responsavel: "Ana Souza" });
    expect(r.every((p) => p.responsavel === "Ana Souza")).toBe(true);
  });

  it("filtra por data de abertura no intervalo", () => {
    const r = filtrarProcessos(PROCESSOS, {
      ...VAZIO,
      dataInicio: "2026-01-01",
      dataFim: "2026-12-31",
    });
    expect(r.every((p) => p.dataAbertura >= "2026-01-01" && p.dataAbertura <= "2026-12-31")).toBe(
      true
    );
    expect(r.some((p) => p.dataAbertura.startsWith("2025"))).toBe(false);
  });

  it("combina múltiplos filtros (AND)", () => {
    const r = filtrarProcessos(PROCESSOS, {
      ...VAZIO,
      status: "nao-aderente",
      responsavel: "Diego Alves",
    });
    expect(r.every((p) => p.status === "nao-aderente" && p.responsavel === "Diego Alves")).toBe(
      true
    );
  });
});
