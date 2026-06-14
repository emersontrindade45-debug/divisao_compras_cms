import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessoHeader } from "../ProcessoHeader";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessoHeader", () => {
  const processo = PROCESSOS[0];

  it("exibe número e objeto do processo", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText(processo.numero)).toBeInTheDocument();
    expect(screen.getByText(processo.objeto)).toBeInTheDocument();
  });

  it("exibe o badge de status", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText("Aderente")).toBeInTheDocument();
  });

  it("exibe a classificação e o responsável", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByText("Comum")).toBeInTheDocument();
    expect(screen.getByText(processo.responsavel)).toBeInTheDocument();
  });

  it("tem link de voltar para a lista", () => {
    render(<ProcessoHeader processo={processo} />);
    expect(screen.getByRole("link", { name: /voltar/i })).toHaveAttribute("href", "/processos");
  });
});
