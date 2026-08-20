import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidatosFilters } from "../CandidatosFilters";

describe("CandidatosFilters", () => {
  it("submete GET para a própria página, sem JavaScript de busca", () => {
    render(<CandidatosFilters municipio="" categoria="" cnpj="" categorias={["limpeza"]} />);

    const form = document.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/fornecedores/candidatos");
    expect(screen.getByRole("button", { name: /buscar/i })).toHaveAttribute("type", "submit");
  });

  it("não mostra Limpar quando não há filtro ativo — botão sem destino não entra", () => {
    render(<CandidatosFilters municipio="" categoria="" cnpj="" categorias={[]} />);
    expect(screen.queryByRole("link", { name: /limpar/i })).not.toBeInTheDocument();
  });

  it("mostra Limpar apontando para a URL sem query quando há filtro", () => {
    render(<CandidatosFilters municipio="Santos" categoria="" cnpj="" categorias={[]} />);
    expect(screen.getByRole("link", { name: /limpar/i })).toHaveAttribute(
      "href",
      "/fornecedores/candidatos",
    );
  });
});
