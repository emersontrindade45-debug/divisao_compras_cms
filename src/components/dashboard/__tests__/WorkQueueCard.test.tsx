import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkQueueCard } from "../WorkQueueCard";
import { priorizarFilaTrabalho, type FilaInput } from "@/lib/domain/filaTrabalho";

function proc(overrides: Partial<FilaInput> = {}): FilaInput {
  return {
    processoId: "p1",
    numero: "2026/001",
    objeto: "Aquisição de material de expediente",
    status: "pendente",
    temFontePublica: true,
    cotacoesVencidas: 0,
    propostasPendentes: 0,
    precosIncluidos: 3,
    coeficienteVariacao: 10,
    temPesquisaIniciada: true,
    ...overrides,
  };
}

describe("WorkQueueCard", () => {
  it("informa quando não há pendência", () => {
    render(<WorkQueueCard itens={[]} />);
    expect(screen.getByText(/nenhum processo com pendência/i)).toBeInTheDocument();
  });

  it("lista cada processo com número, objeto e próxima ação", () => {
    const itens = priorizarFilaTrabalho([proc({ cotacoesVencidas: 1 })]);
    render(<WorkQueueCard itens={itens} />);
    expect(screen.getByText("2026/001")).toBeInTheDocument();
    expect(screen.getByText(/aquisição de material/i)).toBeInTheDocument();
    expect(screen.getByText(/cotação vencida/i)).toBeInTheDocument();
  });

  it("cada linha leva ao processo, na etapa da pendência", () => {
    const itens = priorizarFilaTrabalho([proc({ temFontePublica: false })]);
    render(<WorkQueueCard itens={itens} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/processos/p1?etapa=pesquisa",
    );
  });

  it("preserva a ordem de urgência recebida do domínio", () => {
    const itens = priorizarFilaTrabalho([
      proc({ processoId: "b", numero: "2026/002", coeficienteVariacao: 40 }),
      proc({ processoId: "a", numero: "2026/001", cotacoesVencidas: 1 }),
    ]);
    render(<WorkQueueCard itens={itens} />);
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toContain("/processos/a");
    expect(links[1]?.getAttribute("href")).toContain("/processos/b");
  });
});
