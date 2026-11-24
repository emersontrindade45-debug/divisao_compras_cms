import { describe, expect, it } from "vitest";
import { AMOSTRA_MINIMA, compararAcerto, type CasoMedido } from "../medicaoExemplos";
import type { ClasseExemplo } from "../exemplosIa";

let n = 0;
const caso = (classeCorreta: ClasseExemplo, sem: ClasseExemplo | null, com: ClasseExemplo | null): CasoMedido => ({
  id: `c${n++}`,
  classeCorreta,
  semExemplos: sem,
  comExemplos: com,
});
/** `k` casos iguais, para chegar na amostra mínima sem poluir o teste. */
const muitos = (k: number, ...args: Parameters<typeof caso>) => Array.from({ length: k }, () => caso(...args));

describe("compararAcerto", () => {
  it("conta acerto sem e com exemplos, geral e por classe", () => {
    const r = compararAcerto([
      caso("recusa", "recusa", "recusa"),
      caso("recusa", "duvida", "recusa"), // melhorou
      caso("duvida", "duvida", "recusa"), // piorou
      caso("orcamento", "orcamento", "orcamento"),
    ]);
    expect(r.geral).toEqual({ total: 4, semCertos: 3, comCertos: 3 });
    expect(r.porClasse.recusa).toEqual({ total: 2, semCertos: 1, comCertos: 2 });
    expect(r.porClasse.duvida).toEqual({ total: 1, semCertos: 1, comCertos: 0 });
    expect(r.melhoraram).toHaveLength(1);
    expect(r.pioraram).toHaveLength(1);
  });

  it("leitura que falhou numa das versões sai da conta DAS DUAS (mesmas mensagens nas duas colunas)", () => {
    const r = compararAcerto([caso("recusa", "recusa", null), caso("recusa", null, "recusa"), caso("recusa", "recusa", "recusa")]);
    expect(r.indeterminados).toBe(2);
    expect(r.geral).toEqual({ total: 1, semCertos: 1, comCertos: 1 });
  });

  it("amostra pequena: nunca libera, mesmo com 100% de acerto", () => {
    const r = compararAcerto(muitos(AMOSTRA_MINIMA - 1, "recusa", "recusa", "recusa"));
    expect(r.veredito.podeLigar).toBe(false);
    expect(r.veredito.motivos[0]).toMatch(/amostra pequena/);
  });

  it("não piorar o geral nem nenhuma classe libera", () => {
    const r = compararAcerto([...muitos(20, "recusa", "recusa", "recusa"), ...muitos(10, "duvida", "recusa", "duvida")]);
    expect(r.geral.comCertos).toBe(30);
    expect(r.veredito).toEqual({ podeLigar: true, motivos: [] });
  });

  it("igual (sem ganho) também libera: o critério é NÃO piorar; quem decide se vale a pena é o usuário", () => {
    const r = compararAcerto(muitos(AMOSTRA_MINIMA, "recusa", "recusa", "recusa"));
    expect(r.veredito.podeLigar).toBe(true);
    expect(r.melhoraram).toHaveLength(0);
  });

  it("geral pior: não libera e diz quanto", () => {
    const r = compararAcerto([...muitos(25, "recusa", "recusa", "recusa"), ...muitos(5, "recusa", "recusa", "duvida")]);
    expect(r.veredito.podeLigar).toBe(false);
    expect(r.veredito.motivos.join(" ")).toMatch(/acerto geral piorou \(30 → 25 de 30\)/);
  });

  it("uma classe pior trava mesmo que o geral melhore (ganhar em uma classe e perder em outra)", () => {
    const r = compararAcerto([
      ...muitos(30, "recusa", "duvida", "recusa"), // +30 em recusa
      ...muitos(6, "orcamento", "orcamento", "recusa"), // −6 em orçamento
    ]);
    expect(r.geral.comCertos).toBeGreaterThan(r.geral.semCertos);
    expect(r.veredito.podeLigar).toBe(false);
    expect(r.veredito.motivos.join(" ")).toMatch(/classe orcamento piorou \(6 → 0 de 6\)/);
  });

  it("classe com poucos casos não trava sozinha (um caso é 20%)", () => {
    // O geral empata (uma melhora em recusa, um caso piora em nao_e_resposta): só a classe pequena piorou.
    const r = compararAcerto([
      ...muitos(29, "recusa", "recusa", "recusa"),
      caso("recusa", "duvida", "recusa"),
      caso("nao_e_resposta", "nao_e_resposta", "recusa"),
    ]);
    expect(r.geral.comCertos).toBe(r.geral.semCertos);
    expect(r.porClasse.nao_e_resposta.comCertos).toBeLessThan(r.porClasse.nao_e_resposta.semCertos);
    expect(r.veredito.podeLigar).toBe(true);
  });

  it("sem casos: não libera e não divide por zero", () => {
    const r = compararAcerto([]);
    expect(r.geral).toEqual({ total: 0, semCertos: 0, comCertos: 0 });
    expect(r.veredito.podeLigar).toBe(false);
  });
});
