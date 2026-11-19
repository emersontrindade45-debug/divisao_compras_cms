import { describe, expect, it } from "vitest";
import { calcularDemanda, chaveDoProcesso, lerRemessas, type Remessa } from "../demanda";

const CAB = ["ID Remessa", "Data", "Horário", "Mês", "Processo Encaminhado", "ID do E-mail"];
const linha = (data: string, proc: string, email = "", id = "1") => [id, data, "10:00", "x", proc, email];

function ler(corpo: string[][], cab: string[] = CAB) {
  const r = lerRemessas([cab, ...corpo]);
  if (!r.ok) throw new Error(r.motivo);
  return r;
}

describe("chaveDoProcesso", () => {
  it.each([
    ["Aquisição de Bens Nº 210/2025 - volume 1", "210/2025"],
    ["Geral Nº 110/2026 - volume 1", "110/2026"],
    ["Geral N° 0092/2026 - volume 3", "92/2026"],
    ["Manutenção Nº 7 / 2024", "7/2024"],
  ])("%s → %s", (rotulo, chave) => {
    expect(chaveDoProcesso(rotulo)).toBe(chave);
  });

  it("o tipo e o volume não mudam o processo", () => {
    expect(chaveDoProcesso("Aquisição de Bens Nº 5/2026 - volume 1")).toBe(chaveDoProcesso("Geral Nº 5/2026 - volume 2"));
  });

  it("sem número/ano usa o rótulo normalizado (não some)", () => {
    expect(chaveDoProcesso("Reserva Orçamentária SEM NÚMERO")).toBe("reserva orcamentaria sem numero");
  });
});

describe("lerRemessas", () => {
  it("acha as colunas pelo nome, sem acento nem caixa e em qualquer ordem", () => {
    const r = ler([["Geral Nº 1/2026", "01/02/2026", "ABC"]], ["PROCESSO encaminhado", "DATA", "id do e-mail"]);
    expect(r.remessas).toEqual([
      { data: "2026-02-01", ano: 2026, mes: 2, chave: "1/2026", rotulo: "Geral Nº 1/2026", idEmail: "ABC" },
    ]);
  });

  it("tolera título e linhas em branco acima do cabeçalho", () => {
    const r = lerRemessas([["Remessas 2026"], [""], CAB, linha("05/01/2026", "Geral Nº 1/2026")]);
    expect(r.ok && r.remessas.length).toBe(1);
  });

  it("ignora colunas extras e funciona sem a coluna de e-mail", () => {
    const r = ler([["x", "05/01/2026", "Geral Nº 1/2026", "extra"]], ["a", "Data", "Processo", "b"]);
    expect(r.remessas).toHaveLength(1);
    expect(r.remessas[0]!.idEmail).toBeNull();
  });

  it("sem as colunas Data e Processo devolve erro explicativo, não lista vazia", () => {
    const r = lerRemessas([["Nome", "Valor"], ["a", "b"]]);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("Cabeçalho") });
  });

  it("data inválida ou processo vazio: descarta e CONTA", () => {
    const r = ler([
      linha("31/02/2026", "Geral Nº 1/2026"),
      linha("texto", "Geral Nº 2/2026"),
      linha("05/01/2026", ""),
      linha("05/01/2026", "Geral Nº 3/2026"),
    ]);
    expect(r.remessas).toHaveLength(1);
    expect(r.descartadas).toBe(3);
  });

  it("linha totalmente em branco não é remessa nem descarte", () => {
    const r = ler([["", "", "", "", "", ""], linha("05/01/2026", "Geral Nº 1/2026")]);
    expect(r.remessas).toHaveLength(1);
    expect(r.descartadas).toBe(0);
  });

  it("mesmo e-mail + mesmo processo = uma remessa; mesmo e-mail com OUTRO processo = duas", () => {
    const r = ler([
      linha("05/01/2026", "Geral Nº 1/2026", "E1"),
      linha("05/01/2026", "Geral Nº 1/2026", "E1"),
      linha("05/01/2026", "Geral Nº 2/2026", "E1"),
    ]);
    expect(r.remessas).toHaveLength(2);
    expect(r.duplicadas).toBe(1);
  });

  it("sem id de e-mail, linhas iguais NÃO são fundidas (cada linha é uma remessa)", () => {
    const r = ler([linha("05/01/2026", "Geral Nº 1/2026"), linha("05/01/2026", "Geral Nº 1/2026")]);
    expect(r.remessas).toHaveLength(2);
    expect(r.duplicadas).toBe(0);
  });
});

const R = (data: string, chave: string, rotulo = chave): Remessa => {
  const [a, m] = data.split("-");
  return { data, ano: Number(a), mes: Number(m), chave, rotulo, idEmail: null };
};

describe("calcularDemanda", () => {
  const remessas = [
    R("2026-01-05", "1/2026"),
    R("2026-01-06", "1/2026"),
    R("2026-01-06", "1/2026"), // mesmo dia: conta como outra remessa (decisão do usuário)
    R("2026-01-20", "2/2026"),
    R("2026-03-02", "3/2025"),
    R("2025-12-30", "9/2025"), // outro ano: fora
  ];

  it("conta remessas, distintos, voltaram, extras e média", () => {
    const d = calcularDemanda(remessas, 2026);
    expect(d).toMatchObject({
      remessas: 5,
      processosDistintos: 3,
      processosQueVoltaram: 1,
      remessasExtras: 2,
      mediaRemessas: 1.7,
    });
  });

  it("filtra pelo ano da DATA da remessa, não pelo ano do número do processo", () => {
    const d = calcularDemanda(remessas, 2026);
    expect(d.processos.map((p) => p.chave)).toContain("3/2025");
    expect(d.processos.map((p) => p.chave)).not.toContain("9/2025");
  });

  it("por mês: vai de janeiro ao último mês com remessa e preenche os vazios com zero", () => {
    const d = calcularDemanda(remessas, 2026);
    expect(d.porMes).toEqual([
      { mes: 1, remessas: 4, distintos: 2 },
      { mes: 2, remessas: 0, distintos: 0 },
      { mes: 3, remessas: 1, distintos: 1 },
    ]);
  });

  it("lista: mais recorrentes primeiro, com primeira e última data, e empate pela chave", () => {
    const d = calcularDemanda(remessas, 2026);
    expect(d.processos.map((p) => [p.chave, p.remessas])).toEqual([
      ["1/2026", 3],
      ["2/2026", 1],
      ["3/2025", 1],
    ]);
    expect(d.processos[0]).toMatchObject({ primeira: "2026-01-05", ultima: "2026-01-06" });
    expect(d.ultimaRemessa).toBe("2026-03-02");
  });

  it("o rótulo exibido é o da remessa mais recente", () => {
    const d = calcularDemanda([R("2026-01-05", "1/2026", "Antigo"), R("2026-02-05", "1/2026", "Novo")], 2026);
    expect(d.processos[0]!.rotulo).toBe("Novo");
  });

  it("ano sem remessa: zeros e sem divisão por zero", () => {
    const d = calcularDemanda(remessas, 2030);
    expect(d).toMatchObject({ remessas: 0, processosDistintos: 0, mediaRemessas: 0, porMes: [], ultimaRemessa: null });
  });
});
