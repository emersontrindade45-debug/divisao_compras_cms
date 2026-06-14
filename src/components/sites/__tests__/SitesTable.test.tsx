import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SitesTable } from "../SitesTable";
import { SITES } from "@/lib/fixtures/sites";

describe("SitesTable", () => {
  it("renderiza sem erro", () => {
    render(<SitesTable sites={SITES} />);
  });

  it("mostra pelo menos um site", () => {
    render(<SitesTable sites={SITES} />);
    expect(screen.getByText(SITES[0].nome)).toBeInTheDocument();
  });

  it("mostra o nome de todos os sites", () => {
    render(<SitesTable sites={SITES} />);
    expect(screen.getByText("Painel de Preços")).toBeInTheDocument();
    expect(screen.getByText("Mercado Livre")).toBeInTheDocument();
  });
});
