import { describe, expect, it } from "vitest";
import { calcularTaxa, ehClasse, ordenarAmostra, resumirConferencias, type LinhaConferida } from "../conferenciaIa";

const L = (classeIa: string, classeCorreta: string, extra: Partial<LinhaConferida> = {}): LinhaConferida => ({
  classeIa,
  classeCorreta,
  confianca: "alta",
  aplicada: false,
  ...extra,
});

describe("calcularTaxa", () => {
  it("sem conferência não há taxa (nunca 0%)", () => {
    expect(calcularTaxa(0, 0)).toEqual({ conferidas: 0, certas: 0, taxa: null, intervalo: null });
  });

  it("amostra pequena tem intervalo largo: 3 de 3 não é 100% de confiança", () => {
    const t = calcularTaxa(3, 3);
    expect(t.taxa).toBe(1);
    expect(t.intervalo!.de).toBeGreaterThan(0.4);
    expect(t.intervalo!.de).toBeLessThan(0.5);
    expect(t.intervalo!.ate).toBe(1);
  });

  it("amostra grande estreita o intervalo em torno da taxa", () => {
    const t = calcularTaxa(90, 100);
    expect(t.taxa).toBeCloseTo(0.9, 5);
    expect(t.intervalo!.de).toBeCloseTo(0.826, 2);
    expect(t.intervalo!.ate).toBeCloseTo(0.945, 2);
  });
});

describe("ordenarAmostra", () => {
  const ids = Array.from({ length: 50 }, (_, i) => ({ gmailMensagemId: `19c0${(1000 + i).toString(16)}` }));

  it("é estável: a mesma entrada sai sempre na mesma ordem", () => {
    expect(ordenarAmostra(ids)).toEqual(ordenarAmostra([...ids].reverse()));
  });

  it("não segue a ordem de entrada (ids sequenciais não saem em sequência)", () => {
    const saida = ordenarAmostra(ids).map((x) => x.gmailMensagemId);
    expect(saida).not.toEqual(ids.map((x) => x.gmailMensagemId));
    expect([...saida].sort()).toEqual(ids.map((x) => x.gmailMensagemId).sort());
  });

  it("não altera o vetor recebido", () => {
    const copia = [...ids];
    ordenarAmostra(ids);
    expect(ids).toEqual(copia);
  });
});

describe("resumirConferencias", () => {
  const linhas = [
    L("recusa", "recusa", { aplicada: true }),
    L("recusa", "recusa", { aplicada: true }),
    L("recusa", "duvida", { aplicada: true, confianca: "media" }),
    L("orcamento", "orcamento"),
    L("duvida", "nao_e_resposta", { confianca: "baixa" }),
  ];
  const r = resumirConferencias(linhas);

  it("taxa geral e por classe da IA", () => {
    expect(r.geral).toMatchObject({ conferidas: 5, certas: 3 });
    expect(r.porClasse.recusa).toMatchObject({ conferidas: 3, certas: 2 });
    expect(r.porClasse.orcamento).toMatchObject({ conferidas: 1, certas: 1 });
    expect(r.porClasse.duvida).toMatchObject({ conferidas: 1, certas: 0 });
  });

  it("taxa por confiança declarada", () => {
    expect(r.porConfianca.alta).toMatchObject({ conferidas: 3, certas: 3 });
    expect(r.porConfianca.media).toMatchObject({ conferidas: 1, certas: 0 });
    expect(r.porConfianca.baixa).toMatchObject({ conferidas: 1, certas: 0 });
  });

  it("'aplicadas' conta só o que a IA aplicou na consulta", () => {
    expect(r.aplicadas).toMatchObject({ conferidas: 3, certas: 2 });
  });

  it("lista as confusões, mais frequentes primeiro", () => {
    expect(r.confusoes).toEqual([
      { classeIa: "duvida", classeCorreta: "nao_e_resposta", quantidade: 1 },
      { classeIa: "recusa", classeCorreta: "duvida", quantidade: 1 },
    ]);
  });

  it("sem linhas: tudo sem dado, nada de 0%", () => {
    const v = resumirConferencias([]);
    expect(v.geral.taxa).toBeNull();
    expect(v.aplicadas.taxa).toBeNull();
    expect(v.confusoes).toEqual([]);
  });
});

describe("ehClasse", () => {
  it("aceita só as quatro classes", () => {
    for (const c of ["orcamento", "recusa", "duvida", "nao_e_resposta"]) expect(ehClasse(c)).toBe(true);
    for (const c of ["outra", "", null, 3, undefined]) expect(ehClasse(c)).toBe(false);
  });
});
