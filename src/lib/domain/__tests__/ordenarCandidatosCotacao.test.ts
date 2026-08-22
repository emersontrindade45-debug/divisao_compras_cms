import { describe, expect, it } from "vitest";
import { ordenarCandidatosCotacao, type CandidatoOrdenavel } from "../ordenarCandidatosCotacao";

function c(over: Partial<CandidatoOrdenavel> & { cnpj: string }): CandidatoOrdenavel {
  return {
    municipio: "Campinas",
    email: "a@b.com",
    empresasComMesmoEmail: 0,
    ...over,
  };
}

describe("ordenarCandidatosCotacao", () => {
  it("põe a Baixada Santista antes do resto do estado", () => {
    const r = ordenarCandidatosCotacao([
      c({ cnpj: "1", municipio: "Campinas" }),
      c({ cnpj: "2", municipio: "Santos" }),
    ]);

    expect(r.map((x) => x.cnpj)).toEqual(["2", "1"]);
  });

  it("trata todas as cidades da Baixada como locais, não só Santos", () => {
    const r = ordenarCandidatosCotacao([
      c({ cnpj: "1", municipio: "Ribeirão Preto" }),
      c({ cnpj: "2", municipio: "Guarujá" }),
      c({ cnpj: "3", municipio: "Peruíbe" }),
    ]);

    expect(r.map((x) => x.municipio).slice(0, 2)).toEqual(["Guarujá", "Peruíbe"]);
  });

  it("desprioriza e-mail compartilhado, mas NÃO o remove da lista", () => {
    const entrada = [
      c({ cnpj: "1", municipio: "Santos", empresasComMesmoEmail: 12 }),
      c({ cnpj: "2", municipio: "Santos", empresasComMesmoEmail: 0 }),
    ];
    const r = ordenarCandidatosCotacao(entrada);

    expect(r.map((x) => x.cnpj)).toEqual(["2", "1"]);
    expect(r).toHaveLength(entrada.length);
  });

  it("prioriza localidade acima de e-mail exclusivo", () => {
    // Um candidato local com e-mail de contador vem antes de um distante com e-mail próprio:
    // a proximidade pesa mais que a qualidade do contato.
    const r = ordenarCandidatosCotacao([
      c({ cnpj: "1", municipio: "Campinas", empresasComMesmoEmail: 0 }),
      c({ cnpj: "2", municipio: "Santos", empresasComMesmoEmail: 9 }),
    ]);

    expect(r[0].cnpj).toBe("2");
  });

  it("é determinística: mesma entrada em ordens diferentes produz a mesma saída", () => {
    const base = [
      c({ cnpj: "33", municipio: "Santos" }),
      c({ cnpj: "11", municipio: "Santos" }),
      c({ cnpj: "22", municipio: "Santos" }),
    ];

    const a = ordenarCandidatosCotacao(base).map((x) => x.cnpj);
    const b = ordenarCandidatosCotacao([...base].reverse()).map((x) => x.cnpj);

    expect(a).toEqual(b);
    expect(a).toEqual(["11", "22", "33"]);
  });

  it("não modifica o array recebido", () => {
    const entrada = [c({ cnpj: "2", municipio: "Campinas" }), c({ cnpj: "1", municipio: "Santos" })];
    const copia = [...entrada];
    ordenarCandidatosCotacao(entrada);

    expect(entrada).toEqual(copia);
  });
});
