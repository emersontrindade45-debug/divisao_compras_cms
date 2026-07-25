import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "../MetricCard";

describe("MetricCard", () => {
  it("mostra label e valor", () => {
    render(<MetricCard label="Processos em aberto" value={14} />);
    expect(screen.getByText("Processos em aberto")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("aplica tabular-nums no valor", () => {
    render(<MetricCard label="Taxa de resposta" value="72%" />);
    expect(screen.getByText("72%").className).toContain("tabular-nums");
  });

  it("sem href, não é um link", () => {
    render(<MetricCard label="Processos" value={3} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("com href, o card inteiro vira link para a lista filtrada", () => {
    render(
      <MetricCard label="Gargalos" value={2} href="/processos?status=nao_aderente" />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/processos?status=nao_aderente");
    expect(link).toHaveTextContent("Gargalos");
  });
});
