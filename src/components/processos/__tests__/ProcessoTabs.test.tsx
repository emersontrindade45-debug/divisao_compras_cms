import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessoTabs } from "../ProcessoTabs";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessoTabs", () => {
  it("renderiza os rótulos das quatro abas", () => {
    render(<ProcessoTabs processo={PROCESSOS[0]} />);
    expect(screen.getByRole("tab", { name: /estratégia/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /fontes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /evidências/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /série de preços/i })).toBeInTheDocument();
  });

  it("mostra a recomendação de estratégia na aba inicial", () => {
    render(<ProcessoTabs processo={PROCESSOS[0]} />);
    expect(screen.getByText(/ordem de busca recomendada/i)).toBeInTheDocument();
  });
});
