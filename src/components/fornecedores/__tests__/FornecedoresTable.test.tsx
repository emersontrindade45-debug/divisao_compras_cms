import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FornecedoresTable } from "../FornecedoresTable";
import { FORNECEDORES } from "@/lib/fixtures/fornecedores";

describe("FornecedoresTable", () => {
  it("renderiza sem erro", () => {
    render(<FornecedoresTable fornecedores={FORNECEDORES} onVerHistorico={vi.fn()} />);
  });

  it("mostra pelo menos uma razão social", () => {
    render(<FornecedoresTable fornecedores={FORNECEDORES} onVerHistorico={vi.fn()} />);
    expect(screen.getByText(FORNECEDORES[0].razaoSocial)).toBeInTheDocument();
  });

  it("mostra o CNPJ do primeiro fornecedor", () => {
    render(<FornecedoresTable fornecedores={FORNECEDORES} onVerHistorico={vi.fn()} />);
    expect(screen.getByText(FORNECEDORES[0].cnpj)).toBeInTheDocument();
  });
});
