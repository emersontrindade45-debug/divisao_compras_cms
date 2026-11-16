import { describe, expect, it } from "vitest";
import { definirPrazo, somarDiasUteis } from "../prazo";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("somarDiasUteis", () => {
  it("segunda + 5 dias úteis = segunda seguinte", () => {
    expect(iso(somarDiasUteis(new Date("2026-11-16T15:00:00Z"), 5))).toBe("2026-11-23");
  });

  it("quinta + 5 pula o fim de semana: vence na quinta seguinte", () => {
    // 19/11 (qui) → sex 20(1) seg 23(2) ter 24(3) qua 25(4) qui 26(5)
    expect(iso(somarDiasUteis(new Date("2026-11-19T15:00:00Z"), 5))).toBe("2026-11-26");
  });

  it("enviado no sábado conta a partir de segunda", () => {
    // sáb 21/11 → seg 23(1) ter 24(2) qua 25(3) qui 26(4) sex 27(5)
    expect(iso(somarDiasUteis(new Date("2026-11-21T15:00:00Z"), 5))).toBe("2026-11-27");
  });

  it("usa o dia civil de Santos, não o de UTC", () => {
    // 22/11 (domingo) 22h00 em Santos = 23/11 01:00 UTC. Em Santos ainda é domingo, então +1 dia
    // útil é segunda 23/11; em UTC já seria segunda e +1 daria terça 24/11. Sexta/sábado não
    // distinguem os dois fusos (ambos chegam a segunda) — por isso este caso.
    expect(iso(somarDiasUteis(new Date("2026-11-23T01:00:00Z"), 1))).toBe("2026-11-23");
  });

  it("zero dias devolve o próprio dia", () => {
    expect(iso(somarDiasUteis(new Date("2026-11-16T15:00:00Z"), 0))).toBe("2026-11-16");
  });
});

describe("definirPrazo", () => {
  const envio = new Date("2026-11-16T15:00:00Z");

  it("data do assunto vale como está", () => {
    const r = definirPrazo({ prazo: "2026-11-30", prazoOrigem: "assunto", dataEnvio: envio });
    expect(r.origem).toBe("assunto");
    expect(iso(r.prazo)).toBe("2026-11-30");
  });

  it("data do texto mantém a origem 'corpo'", () => {
    expect(definirPrazo({ prazo: "2026-11-27", prazoOrigem: "corpo", dataEnvio: envio }).origem).toBe("corpo");
  });

  it("sem data, vale envio + 5 dias úteis", () => {
    const r = definirPrazo({ prazo: null, prazoOrigem: null, dataEnvio: envio });
    expect(r.origem).toBe("padrao");
    expect(iso(r.prazo)).toBe("2026-11-23");
  });

  it("prazo antes do envio é erro de digitação: cai no padrão", () => {
    const r = definirPrazo({ prazo: "2026-10-16", prazoOrigem: "assunto", dataEnvio: envio });
    expect(r.origem).toBe("padrao");
  });

  it("prazo absurdamente longe cai no padrão", () => {
    expect(definirPrazo({ prazo: "2027-11-16", prazoOrigem: "assunto", dataEnvio: envio }).origem).toBe("padrao");
  });

  it("data inexistente (30/02) cai no padrão", () => {
    expect(definirPrazo({ prazo: "2026-02-30", prazoOrigem: "assunto", dataEnvio: envio }).origem).toBe("padrao");
  });

  it("prazo no mesmo dia do envio é aceito (fronteira)", () => {
    expect(definirPrazo({ prazo: "2026-11-16", prazoOrigem: "assunto", dataEnvio: envio }).origem).toBe("assunto");
  });
});
