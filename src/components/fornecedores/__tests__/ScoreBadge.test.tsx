import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBadge } from "../ScoreBadge";

describe("ScoreBadge", () => {
  it("mostra score 80", () => {
    render(<ScoreBadge score={80} />);
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it("mostra score 30", () => {
    render(<ScoreBadge score={30} />);
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });

  it("mostra score 60", () => {
    render(<ScoreBadge score={60} />);
    expect(screen.getByText(/60/)).toBeInTheDocument();
  });

  it("mostra texto 'pontos'", () => {
    render(<ScoreBadge score={75} />);
    expect(screen.getByText(/pontos/)).toBeInTheDocument();
  });
});
