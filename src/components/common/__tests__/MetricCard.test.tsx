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
});
