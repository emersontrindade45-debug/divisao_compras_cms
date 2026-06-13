import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadingState } from "../LoadingState";

describe("estados padrão", () => {
  it("EmptyState mostra título e descrição", () => {
    render(<EmptyState title="Nenhum processo" description="Cadastre o primeiro objeto" />);
    expect(screen.getByText("Nenhum processo")).toBeInTheDocument();
    expect(screen.getByText("Cadastre o primeiro objeto")).toBeInTheDocument();
  });

  it("ErrorState mostra mensagem e botão de retentar", () => {
    render(<ErrorState message="Falha ao carregar" />);
    expect(screen.getByText("Falha ao carregar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("LoadingState renderiza placeholders de skeleton", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull();
  });
});
