import { describe, expect, it } from "vitest";
import { validarDataAberturaInformada } from "../dataAbertura";

// 2026-11-16 23:30 em Santos = 2026-11-17 02:30 UTC.
const AGORA = new Date("2026-11-17T02:30:00.000Z");

describe("validarDataAberturaInformada", () => {
  it("aceita data válida e grava ao meio-dia UTC (mesmo dia civil no Brasil)", () => {
    const r = validarDataAberturaInformada("2026-03-10", AGORA);
    expect(r).toEqual({ ok: true, data: new Date("2026-03-10T12:00:00.000Z") });
  });

  it("hoje em Santos é aceito mesmo quando em UTC já é amanhã", () => {
    expect(validarDataAberturaInformada("2026-11-16", AGORA).ok).toBe(true);
  });

  it("amanhã em Santos é futuro", () => {
    const r = validarDataAberturaInformada("2026-11-17", AGORA);
    expect(r).toEqual({ ok: false, erro: "Data de abertura no futuro." });
  });

  it("recusa data inexistente", () => {
    expect(validarDataAberturaInformada("2026-02-30", AGORA).ok).toBe(false);
  });

  it("recusa formato errado", () => {
    expect(validarDataAberturaInformada("10/03/2026", AGORA).ok).toBe(false);
  });

  it("recusa data anterior a 2015", () => {
    expect(validarDataAberturaInformada("2014-12-31", AGORA).ok).toBe(false);
    expect(validarDataAberturaInformada("2015-01-01", AGORA).ok).toBe(true);
  });
});
