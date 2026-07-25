import { describe, it, expect } from "vitest";
import {
  avaliarConformidade,
  MIN_FONTES_SUFICIENCIA,
  type ConformidadeInput,
} from "../conformidade";

const AGORA = new Date("2026-07-25T12:00:00Z");
const RECENTE = new Date("2026-07-01T12:00:00Z");

function base(overrides: Partial<ConformidadeInput> = {}): ConformidadeInput {
  return {
    temItens: true,
    fontes: [],
    capturas: 0,
    resultadosSimilaridade: 0,
    cotacoes: [],
    dataReferencia: AGORA,
    ...overrides,
  };
}

function fonte(
  id: string,
  overrides: Partial<ConformidadeInput["fontes"][number]> = {},
): ConformidadeInput["fontes"][number] {
  return {
    id,
    tipo: "contratacao_publica",
    status: "incluido",
    dataReferencia: RECENTE,
    totalEvidencias: 1,
    ...overrides,
  };
}

describe("avaliarConformidade — etapas", () => {
  it("processo vazio: estratégia pendente sem itens, tudo pendente", () => {
    const r = avaliarConformidade(base({ temItens: false }));
    const porId = Object.fromEntries(r.etapas.map((e) => [e.id, e.estado]));
    expect(porId["estrategia"]).toBe("pendente");
    expect(porId["pesquisa"]).toBe("pendente");
    expect(porId["validacao"]).toBe("nao_aplicavel");
    expect(porId["consolidacao"]).toBe("pendente");
    expect(r.etapaAtual).toBe("estrategia");
    expect(r.suficienciaAtingida).toBe(false);
  });

  it("estratégia concluída quando há itens", () => {
    const r = avaliarConformidade(base());
    expect(r.etapas.find((e) => e.id === "estrategia")?.estado).toBe("concluida");
    expect(r.etapaAtual).toBe("pesquisa");
  });

  it("pesquisa em andamento com 2 fontes (abaixo da suficiência)", () => {
    const r = avaliarConformidade(base({ fontes: [fonte("f1"), fonte("f2")] }));
    expect(r.etapas.find((e) => e.id === "pesquisa")?.estado).toBe("em_andamento");
    expect(r.suficienciaAtingida).toBe(false);
  });

  it("pesquisa concluída com 3 fontes com evidência (suficiência)", () => {
    const r = avaliarConformidade(
      base({ fontes: [fonte("f1"), fonte("f2"), fonte("f3")] }),
    );
    expect(r.etapas.find((e) => e.id === "pesquisa")?.estado).toBe("concluida");
    expect(r.suficienciaAtingida).toBe(true);
  });

  it("fonte sem evidência não conta para a suficiência", () => {
    const r = avaliarConformidade(
      base({
        fontes: [fonte("f1"), fonte("f2"), fonte("f3", { totalEvidencias: 0 })],
      }),
    );
    expect(r.suficienciaAtingida).toBe(false);
  });

  it("fonte excluída não conta para a suficiência", () => {
    const r = avaliarConformidade(
      base({
        fontes: [fonte("f1"), fonte("f2"), fonte("f3", { status: "excluido" })],
      }),
    );
    expect(r.suficienciaAtingida).toBe(false);
  });

  it("pesquisa com bloqueio (fonte sem evidência) fica em atenção", () => {
    const r = avaliarConformidade(
      base({ fontes: [fonte("f1", { totalEvidencias: 0 })] }),
    );
    expect(r.etapas.find((e) => e.id === "pesquisa")?.estado).toBe("atencao");
  });

  it("validação não se aplica sem pesquisa direta", () => {
    const r = avaliarConformidade(base({ fontes: [fonte("f1")] }));
    expect(r.etapas.find((e) => e.id === "validacao")?.estado).toBe("nao_aplicavel");
  });

  it("validação em atenção quando cotação respondida não tem proposta", () => {
    const r = avaliarConformidade(
      base({
        cotacoes: [{ id: "c1", status: "positiva", temProposta: false }],
      }),
    );
    expect(r.etapas.find((e) => e.id === "validacao")?.estado).toBe("atencao");
  });

  it("validação concluída com todas as propostas avaliadas", () => {
    const r = avaliarConformidade(
      base({
        cotacoes: [
          { id: "c1", status: "positiva", temProposta: true, propostaStatus: "valida" },
          { id: "c2", status: "negativa", temProposta: true, propostaStatus: "valida" },
          { id: "c3", status: "positiva", temProposta: true, propostaStatus: "valida" },
        ],
      }),
    );
    expect(r.etapas.find((e) => e.id === "validacao")?.estado).toBe("concluida");
  });

  it("consolidação concluída com 3 preços e valor estimado", () => {
    const r = avaliarConformidade(
      base({
        serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 10 },
      }),
    );
    expect(r.etapas.find((e) => e.id === "consolidacao")?.estado).toBe("concluida");
  });

  it("consolidação em andamento com apenas 2 preços", () => {
    const r = avaliarConformidade(
      base({
        serie: { precosIncluidos: 2, valorEstimado: 100, coeficienteVariacao: 10 },
      }),
    );
    expect(r.etapas.find((e) => e.id === "consolidacao")?.estado).toBe("em_andamento");
  });

  it("consolidação em atenção quando CV exige análise crítica (31%)", () => {
    const r = avaliarConformidade(
      base({
        serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 31 },
      }),
    );
    expect(r.etapas.find((e) => e.id === "consolidacao")?.estado).toBe("atencao");
  });

  it("CV 28% (entre pré-alerta e crítico) não trava a consolidação", () => {
    const r = avaliarConformidade(
      base({
        serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 28 },
      }),
    );
    expect(r.etapas.find((e) => e.id === "consolidacao")?.estado).toBe("concluida");
  });
});

describe("avaliarConformidade — checklist", () => {
  it("R-07 em atenção quando não há fonte pública", () => {
    const r = avaliarConformidade(
      base({ fontes: [fonte("f1", { tipo: "fornecedor_direto" })] }),
    );
    const item = r.itens.find((i) => i.codigo === "R-07");
    expect(item?.estado).toBe("atencao");
    expect(item?.detalhe).toContain("justificativa");
  });

  it("R-07 ok com fonte pública incluída", () => {
    const r = avaliarConformidade(base({ fontes: [fonte("f1")] }));
    expect(r.itens.find((i) => i.codigo === "R-07")?.estado).toBe("ok");
  });

  it("R-02 bloqueio quando fonte incluída não tem evidência", () => {
    const r = avaliarConformidade(
      base({ fontes: [fonte("f1", { totalEvidencias: 0 })] }),
    );
    expect(r.itens.find((i) => i.codigo === "R-02")?.estado).toBe("bloqueio");
  });

  it("OP-SLA bloqueio quando fonte está fora da janela de validade", () => {
    const r = avaliarConformidade(
      base({
        fontes: [
          fonte("f1", {
            tipo: "site_eletronico",
            dataReferencia: new Date("2026-01-01T12:00:00Z"), // > 90 dias
          }),
        ],
      }),
    );
    expect(r.itens.find((i) => i.codigo === "OP-SLA")?.estado).toBe("bloqueio");
  });

  it("R-03 em atenção com 2 cotações (abaixo do mínimo)", () => {
    const r = avaliarConformidade(
      base({
        cotacoes: [
          { id: "c1", status: "positiva", temProposta: true, propostaStatus: "valida" },
          { id: "c2", status: "silenciosa", temProposta: false },
        ],
      }),
    );
    expect(r.itens.find((i) => i.codigo === "R-03")?.estado).toBe("atencao");
  });

  it("R-03 ok com 3 cotações", () => {
    const cotacao = (id: string) =>
      ({ id, status: "positiva", temProposta: true, propostaStatus: "valida" }) as const;
    const r = avaliarConformidade(
      base({ cotacoes: [cotacao("c1"), cotacao("c2"), cotacao("c3")] }),
    );
    expect(r.itens.find((i) => i.codigo === "R-03")?.estado).toBe("ok");
  });

  it("R-04 em atenção quando há cotação silenciosa", () => {
    const r = avaliarConformidade(
      base({
        cotacoes: [
          { id: "c1", status: "positiva", temProposta: true, propostaStatus: "valida" },
          { id: "c2", status: "silenciosa", temProposta: false },
        ],
      }),
    );
    const item = r.itens.find((i) => i.codigo === "R-04");
    expect(item?.estado).toBe("atencao");
    expect(item?.detalhe).toContain("1 fornecedor");
  });

  it("R-03 não se aplica sem pesquisa direta", () => {
    const r = avaliarConformidade(base());
    expect(r.itens.find((i) => i.codigo === "R-03")?.estado).toBe("nao_aplicavel");
  });

  it("R-06 em atenção acima do limiar crítico e ok abaixo do pré-alerta", () => {
    const alto = avaliarConformidade(
      base({ serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 31 } }),
    );
    const baixo = avaliarConformidade(
      base({ serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 10 } }),
    );
    expect(alto.itens.find((i) => i.codigo === "R-06")?.estado).toBe("atencao");
    expect(alto.itens.find((i) => i.codigo === "R-06")?.detalhe).toContain(
      "análise crítica",
    );
    expect(baixo.itens.find((i) => i.codigo === "R-06")?.estado).toBe("ok");
  });

  it("OP-ADH-04 em atenção sem série consolidada", () => {
    const r = avaliarConformidade(base());
    expect(r.itens.find((i) => i.codigo === "OP-ADH-04")?.estado).toBe("atencao");
  });

  it("todo item aponta para uma etapa válida", () => {
    const r = avaliarConformidade(
      base({
        fontes: [fonte("f1")],
        cotacoes: [{ id: "c1", status: "silenciosa", temProposta: false }],
        serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 40 },
      }),
    );
    const etapasValidas = new Set(["estrategia", "pesquisa", "validacao", "consolidacao"]);
    for (const item of r.itens) {
      expect(etapasValidas.has(item.etapaAlvo)).toBe(true);
    }
  });

  it("constante de suficiência é 3 (exigida pela IN 65/2021)", () => {
    expect(MIN_FONTES_SUFICIENCIA).toBe(3);
  });
});
