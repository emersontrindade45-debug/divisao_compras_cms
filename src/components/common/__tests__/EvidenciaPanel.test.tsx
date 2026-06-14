import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenciaPanel } from "../EvidenciaPanel";

describe("EvidenciaPanel", () => {
  it("renderiza o nome do arquivo", () => {
    render(
      <EvidenciaPanel
        nomeArquivo="captura-001.png"
        dataHoraAcesso="2026-06-10T14:32:00-03:00"
      />,
    );
    expect(screen.getByText("captura-001.png")).toBeInTheDocument();
  });

  it('renderiza "Data/hora registrada"', () => {
    render(
      <EvidenciaPanel
        nomeArquivo="captura-001.png"
        dataHoraAcesso="2026-06-10T14:32:00-03:00"
      />,
    );
    expect(screen.getByText("Data/hora registrada")).toBeInTheDocument();
  });

  it("mostra observações se fornecidas", () => {
    render(
      <EvidenciaPanel
        nomeArquivo="captura-001.png"
        dataHoraAcesso="2026-06-10T14:32:00-03:00"
        observacoes="Captura do produto em promoção."
      />,
    );
    expect(screen.getByText("Captura do produto em promoção.")).toBeInTheDocument();
  });

  it("mostra URL se fornecida", () => {
    render(
      <EvidenciaPanel
        nomeArquivo="captura-001.png"
        dataHoraAcesso="2026-06-10T14:32:00-03:00"
        url="https://paineldeprecos.gov.br"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://paineldeprecos.gov.br");
  });
});
