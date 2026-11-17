import { describe, expect, it } from "vitest";
import { INICIO_HISTORICO, diasDesde, lerHistorico, planejarFatias, type FatiaLeitura, type ResultadoFatia } from "../historico";

describe("planejarFatias", () => {
  it("divide de hoje para trás em fatias de 30 dias, a última com o resto", () => {
    expect(planejarFatias(75)).toEqual([
      { desdeDias: 0, dias: 30 },
      { desdeDias: 30, dias: 30 },
      { desdeDias: 60, dias: 15 },
    ]);
  });
});

describe("lerHistorico", () => {
  it("lê as fatias na ordem, da mais recente para a mais antiga", async () => {
    const vistas: FatiaLeitura[] = [];
    await lerHistorico(60, async (f) => { vistas.push(f); return {}; });
    expect(vistas).toEqual([{ desdeDias: 0, dias: 30 }, { desdeDias: 30, dias: 30 }]);
  });

  it("fatia truncada é dividida ao meio e relida, sem pular nenhum dia", async () => {
    const vistas: FatiaLeitura[] = [];
    const r = await lerHistorico(30, async (f) => {
      vistas.push(f);
      return { truncada: f.dias === 30 };
    });
    expect(vistas).toEqual([
      { desdeDias: 0, dias: 30 },
      { desdeDias: 0, dias: 15 },
      { desdeDias: 15, dias: 15 },
    ]);
    expect(r.fatiaSemSolucao).toBeUndefined();
  });

  it("soma só o que é incremental; o estado (fila, sem processo) fica o último valor", async () => {
    const respostas: ResultadoFatia[] = [
      { contagens: { enviosNovos: 2, respostasNaFila: 5, envios: 10, enviosSemProcesso: 4 } },
      { contagens: { enviosNovos: 3, respostasNaFila: 7, envios: 6, enviosSemProcesso: 1 } },
    ];
    const r = await lerHistorico(60, async () => respostas.shift()!);
    expect(r.totais).toEqual({ enviosNovos: 5, respostasNaFila: 7, envios: 6, enviosSemProcesso: 1 });
  });

  it("erro numa fatia interrompe, mantendo o que já foi lido", async () => {
    let n = 0;
    const r = await lerHistorico(90, async () => (++n === 2 ? { erro: "Falhou." } : { contagens: { enviosNovos: 1 } }));
    expect(r.erro).toBe("Falhou.");
    expect(r.fatiasLidas).toBe(1);
    expect(r.totais.enviosNovos).toBe(1);
    expect(n).toBe(2);
  });

  it("dia único ainda truncado é reportado, não aceito em silêncio", async () => {
    const r = await lerHistorico(1, async () => ({ truncada: true }));
    expect(r.fatiaSemSolucao).toEqual({ desdeDias: 0, dias: 1 });
  });
});

describe("diasDesde", () => {
  it("cobre o 1º de janeiro de 2026: de 17/11/2026 são 320 dias e uma fração, arredondado para cima", () => {
    expect(diasDesde(INICIO_HISTORICO, new Date("2026-11-17T12:00:00-03:00"))).toBe(321);
  });

  it("arredonda para cima, nunca para baixo (um dia a menos deixaria 1º de janeiro de fora)", () => {
    expect(diasDesde(INICIO_HISTORICO, new Date("2026-01-02T00:00:01-03:00"))).toBe(2);
    expect(diasDesde(INICIO_HISTORICO, new Date("2026-01-02T00:00:00-03:00"))).toBe(1);
  });

  it("nunca devolve menos de 1", () => {
    expect(diasDesde(INICIO_HISTORICO, new Date("2025-12-01T00:00:00-03:00"))).toBe(1);
  });
});
