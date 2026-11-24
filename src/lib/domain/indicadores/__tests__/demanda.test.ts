import { describe, expect, it } from "vitest";
import { chaveDoProcesso, lerRemessas } from "../demanda";

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


describe("lerRemessas — tabela sem cabeçalho abaixo da principal (planilha de 2026-11-23)", () => {
  // [ID Remessa, "dd/mm/aaaa hh:mm", Mês, Processo, ID do E-mail]
  const semCab = (id: string, dh: string, proc: string, email: string) => [id, dh, "Novembro", proc, email];
  // Registro bruto de e-mails que vem na mesma aba: [id, id, hora, remetente, destinatário, assunto, ...]
  const bruto = (id: string) => [id, id, "15:24", "Câmara <x@y>", "compras@z", "Recebimento de Processos - Remessa 1", "Recebido"];

  it("lê a tabela sem cabeçalho (data e hora na mesma célula) e a junta à principal", () => {
    const r = ler([
      linha("17/11/2026", "Geral Nº 1/2026", "E1", "10"),
      semCab("11", "19/11/2026 15:24", "Aquisição de Serviços Nº 8462/2025", "E2"),
    ]);
    expect(r.remessas.map((x) => [x.data, x.chave, x.idEmail])).toEqual([
      ["2026-11-17", "1/2026", "E1"],
      ["2026-11-19", "8462/2025", "E2"],
    ]);
    expect(r.descartadas).toBe(0);
  });

  it("a mesma remessa nas duas tabelas conta UMA vez (par e-mail + processo)", () => {
    const r = ler([
      linha("17/11/2026", "Geral Nº 1/2026", "E1", "10"),
      semCab("10", "17/11/2026 18:37", "Geral Nº 1/2026 - volume 1", "E1"),
    ]);
    expect(r.remessas).toHaveLength(1);
    expect(r.duplicadas).toBe(1);
  });

  it("o registro bruto de e-mails NÃO vira remessa: é descartado e contado", () => {
    const r = ler([linha("17/11/2026", "Geral Nº 1/2026", "E1", "10"), bruto("E9"), bruto("E8")]);
    expect(r.remessas).toHaveLength(1);
    expect(r.descartadas).toBe(2);
  });

  it.each([
    ["ID de remessa não numérico", ["abc", "19/11/2026 15:24", "x", "Geral Nº 2/2026", "E2"]],
    ["data impossível", ["11", "31/02/2026 15:24", "x", "Geral Nº 2/2026", "E2"]],
    ["só a data, sem hora", ["11", "19/11/2026", "x", "Geral Nº 2/2026", "E2"]],
    ["sem processo", ["11", "19/11/2026 15:24", "x", "", "E2"]],
    ["sem id de e-mail", ["11", "19/11/2026 15:24", "x", "Geral Nº 2/2026", ""]],
  ])("linha fora da forma esperada é descartada (%s)", (_motivo, l) => {
    // Cabeçalho com Data/Processo além da largura da linha: só a forma sem cabeçalho pode aceitá-la.
    const r = ler([l], ["a", "b", "c", "d", "e", "Data", "Processo"]);
    expect(r.remessas).toHaveLength(0);
    expect(r.descartadas).toBe(1);
  });

  it("a linha da tabela principal continua sendo lida pelo cabeçalho (não pela forma nova)", () => {
    const r = ler([linha("05/01/2026", "Geral Nº 1/2026", "E1", "10")]);
    expect(r.remessas).toHaveLength(1);
    expect(r.descartadas).toBe(0);
  });
});
