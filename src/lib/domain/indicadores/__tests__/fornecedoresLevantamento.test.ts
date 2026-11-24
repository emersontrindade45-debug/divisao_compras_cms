import { describe, expect, it } from "vitest";
import { inteiro, lerPorMes, resumirFornecedores } from "../fornecedoresLevantamento";

const CAB = ["Mês", "E-mails enviados", "Destinatários", "Orçamento", "Recusa", "Dúvida", "Só confirmou/outra", "Sem resposta", "Endereço errado", "Devolvido (outro)", "% retorno útil"];
const JAN = ["2026-01", "33", "1.895", "16", "28", "3", "4", "1.838", "3", "3", "2,6%"];
const FEV = ["2026-02", "28", "897", "24", "22", "3", "5", "830", "5", "8", "5,5%"];

describe("inteiro", () => {
  it("trata ponto como milhar e rejeita o que não é número", () => {
    expect(inteiro("1.895")).toBe(1895);
    expect(inteiro(" 12 ")).toBe(12);
    expect(inteiro("")).toBeNull();
    expect(inteiro("2,6%")).toBeNull();
    expect(inteiro(undefined)).toBeNull();
  });
});

describe("lerPorMes", () => {
  it("lê os meses e confere que as partes fecham com os destinatários", () => {
    const r = lerPorMes([CAB, JAN, FEV]);
    expect(r.ok && r.meses.map((m) => m.destinatarios)).toEqual([1895, 897]);
    expect(r.ok && r.inconsistentes).toEqual([]);
  });
  it("aponta o mês cujas partes não fecham (não corrige em silêncio)", () => {
    const quebrado = [...JAN];
    quebrado[7] = "1.800";
    const r = lerPorMes([CAB, quebrado, FEV]);
    expect(r.ok && r.inconsistentes).toEqual(["2026-01"]);
  });
  it("ignora linha de total e em branco, e ordena por mês", () => {
    const r = lerPorMes([CAB, FEV, [], ["Total", "61", "2.792"], JAN]);
    expect(r.ok && r.meses.map((m) => m.mes)).toEqual(["2026-01", "2026-02"]);
  });
  it("cabeçalho ausente, coluna faltando e valor não numérico viram erro com motivo", () => {
    expect(lerPorMes([["a", "b"], ["1", "2"]])).toMatchObject({ ok: false });
    const semRecusa = CAB.filter((c) => c !== "Recusa");
    expect(lerPorMes([semRecusa, JAN])).toMatchObject({ ok: false, motivo: expect.stringContaining("recusa") });
    const ruim = [...JAN];
    ruim[3] = "muitos";
    expect(lerPorMes([CAB, ruim])).toMatchObject({ ok: false, motivo: expect.stringContaining("2026-01") });
    expect(lerPorMes([CAB])).toMatchObject({ ok: false });
  });
});

describe("resumirFornecedores", () => {
  const meses = (() => {
    const r = lerPorMes([CAB, JAN, FEV]);
    if (!r.ok) throw new Error("fixture");
    return r.meses;
  })();
  it("retorno firme é recusa + dúvida sobre destinatários; orçamento fica à parte", () => {
    const r = resumirFornecedores(meses, 2026)!;
    expect(r.destinatarios).toBe(2792);
    expect(r.retornoFirme).toBeCloseTo((28 + 3 + 22 + 3) / 2792, 10);
    expect(r.retornoOrcamento).toBeCloseTo(40 / 2792, 10);
  });
  it("ano sem mês na planilha é null, não zero", () => {
    expect(resumirFornecedores(meses, 2025)).toBeNull();
  });
  it("pico de endereço errado: o mês com mais; nenhum se todos zeraram", () => {
    expect(resumirFornecedores(meses, 2026)!.picoEnderecoErrado).toEqual({ mes: "2026-02", quantidade: 5 });
    const zerado = meses.map((m) => ({ ...m, enderecoErrado: 0 }));
    expect(resumirFornecedores(zerado, 2026)!.picoEnderecoErrado).toBeNull();
  });
  it("sem destinatários as taxas são null (evita divisão por zero)", () => {
    const vazio = meses.map((m) => ({ ...m, destinatarios: 0 }));
    expect(resumirFornecedores(vazio, 2026)!.retornoFirme).toBeNull();
  });
  it("não mistura anos", () => {
    const outro = [...meses, { ...meses[0]!, mes: "2025-12", destinatarios: 999 }];
    expect(resumirFornecedores(outro, 2026)!.destinatarios).toBe(2792);
  });
});
