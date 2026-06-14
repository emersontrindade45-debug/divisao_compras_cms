import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContratacoesTable } from "../ContratacoesTable";
import { CONTRATACOES } from "@/lib/fixtures/contratacoes";

describe("ContratacoesTable", () => {
  it("renderiza sem erro", () => {
    render(<ContratacoesTable contratacoes={CONTRATACOES} />);
  });

  it("mostra pelo menos uma contratação", () => {
    render(<ContratacoesTable contratacoes={CONTRATACOES} />);
    expect(screen.getByText(CONTRATACOES[0].numero)).toBeInTheDocument();
  });

  it("mostra o orgão da primeira contratação", () => {
    render(<ContratacoesTable contratacoes={CONTRATACOES} />);
    expect(screen.getByText(CONTRATACOES[0].orgao)).toBeInTheDocument();
  });
});
