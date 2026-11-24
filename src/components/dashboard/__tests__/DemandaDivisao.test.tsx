import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemandaDivisao } from "../DemandaDivisao";
import type { ResultadoDemanda } from "@/lib/indicadores/demanda";

const OK: Extract<ResultadoDemanda, { estado: "ok" }> = {
  estado: "ok",
  descartadas: 0,
  duplicadas: 0,
  noSistema: { "92/2026": { id: "p92", numero: "0092/2026" } },
  demanda: {
    ano: 2026,
    remessas: 584,
    processosDistintos: 117,
    processosQueVoltaram: 81,
    recorrencias: 467,
    mediaRemessas: 5,
    porMes: [
      { mes: 1, remessas: 56, distintos: 26 },
      { mes: 2, remessas: 66, distintos: 32 },
    ],
    processos: [
      { chave: "92/2026", rotulo: "Geral Nº 92/2026 - volume 1", remessas: 23, recorrencias: 20, primeira: "2026-01-05", ultima: "2026-11-17" },
      { chave: "5/2026", rotulo: "Aquisição de Bens Nº 5/2026 - volume 1", remessas: 1, recorrencias: 0, primeira: "2026-02-03", ultima: "2026-02-03" },
    ],
    ultimaRemessa: "2026-11-17",
  },
};

/** Texto do cartão cujo rótulo é `label` (o mesmo texto pode aparecer fora de um cartão, como no cabeçalho da tabela). */
function cartao(label: string): string {
  const el = screen
    .getAllByText(label)
    .map((e) => e.closest('[data-slot="card"]'))
    .find((c): c is Element => c !== null);
  if (!el) throw new Error(`cartão "${label}" não encontrado`);
  return el.textContent ?? "";
}

describe("DemandaDivisao", () => {
  it("não configurada: diz isso, sem inventar números", () => {
    render(<DemandaDivisao resultado={{ estado: "nao_configurada" }} ano={2026} />);
    expect(screen.getByRole("status").textContent).toMatch(/não foi configurada/);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("indisponível: mostra o motivo e NÃO mostra zero como se fosse fato", () => {
    render(<DemandaDivisao resultado={{ estado: "indisponivel", motivo: "O Google não respondeu a tempo." }} ano={2026} />);
    const aviso = screen.getByRole("status");
    expect(aviso.textContent).toMatch(/Não foi possível carregar a demanda/);
    expect(aviso.textContent).toMatch(/O Google não respondeu a tempo/);
    expect(screen.queryByText("Processos distintos")).toBeNull();
  });

  it("ano sem remessa: mensagem própria", () => {
    const vazio = { ...OK, demanda: { ...OK.demanda, remessas: 0, processosDistintos: 0, porMes: [], processos: [] } };
    render(<DemandaDivisao resultado={vazio} ano={2026} />);
    expect(screen.getByText(/Nenhuma remessa registrada em 2026/)).toBeTruthy();
  });

  it("mostra os quatro indicadores com os valores certos", () => {
    render(<DemandaDivisao resultado={OK} ano={2026} />);
    expect(cartao("Processos distintos")).toContain("117");
    expect(cartao("Remessas")).toContain("584");
    const voltaram = cartao("Processos devolvidos");
    expect(voltaram).toContain("81");
    expect(voltaram).toContain("69%"); // 81 de 117
    expect(voltaram).toContain("467 recorrências");
    expect(cartao("Remessas por processo")).toContain("5,0");
  });

  it("remessas por mês: nome do mês, remessas e distintos escritos (a barra não é a única forma de ler)", () => {
    render(<DemandaDivisao resultado={OK} ano={2026} />);
    const lista = screen.getByRole("list", { name: "Remessas por mês" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]!.textContent).toContain("Jan");
    expect(itens[0]!.textContent).toContain("56");
    expect(itens[0]!.textContent).toContain("26 proc.");
  });

  it("lista de distintos: link só para o processo que existe no sistema; datas em dd/mm/aaaa", () => {
    render(<DemandaDivisao resultado={OK} ano={2026} />);
    expect(screen.getByText(/Lista de processos distintos \(117\)/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Geral Nº 92/2026 - volume 1" });
    expect(link.getAttribute("href")).toBe("/processos/p92");
    expect(screen.queryByRole("link", { name: /Nº 5\/2026/ })).toBeNull();
    expect(screen.getByText("Aquisição de Bens Nº 5/2026 - volume 1")).toBeTruthy();
    expect(screen.getAllByText("17/11/2026").length).toBeGreaterThan(0);
    expect(screen.getByText("05/01/2026")).toBeTruthy();
  });

  it("avisa das linhas ignoradas e das remessas repetidas (não esconde o descarte)", () => {
    render(<DemandaDivisao resultado={{ ...OK, descartadas: 3, duplicadas: 2 }} ano={2026} />);
    const rodape = screen.getByText(/Última remessa em 17\/11\/2026/);
    expect(rodape.textContent).toContain("3 linha(s) ignorada(s)");
    expect(rodape.textContent).toContain("2 remessa(s) repetida(s)");
  });
});
