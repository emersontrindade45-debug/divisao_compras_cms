import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteListaBadge } from "../SiteListaBadge";

describe("SiteListaBadge", () => {
  it('lista "branca" renderiza "Admissível"', () => {
    render(<SiteListaBadge lista="branca" />);
    expect(screen.getByText("Admissível")).toBeInTheDocument();
  });

  it('lista "vermelha" renderiza "Bloqueado"', () => {
    render(<SiteListaBadge lista="vermelha" />);
    expect(screen.getByText("Bloqueado")).toBeInTheDocument();
  });

  it('lista "cinza" renderiza "Com ressalva"', () => {
    render(<SiteListaBadge lista="cinza" />);
    expect(screen.getByText("Com ressalva")).toBeInTheDocument();
  });
});
