import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renderiza o rótulo pt-BR do status", () => {
    render(<StatusBadge status="aderente" />);
    expect(screen.getByText("Aderente")).toBeInTheDocument();
  });

  it("aplica a classe do token da variante danger", () => {
    render(<StatusBadge status="nao-aderente" />);
    const badge = screen.getByText("Não aderente");
    expect(badge.className).toContain("bg-danger");
  });
});
