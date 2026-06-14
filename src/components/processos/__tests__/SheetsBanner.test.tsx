import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetsBanner } from "../SheetsBanner";

describe("SheetsBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exibe a mensagem de origem dos dados", () => {
    render(<SheetsBanner sheetsUrl={undefined} />);
    expect(screen.getByText(/sincronizados da planilha/i)).toBeInTheDocument();
  });

  it("mostra o botão 'Ver planilha' quando há URL", () => {
    render(<SheetsBanner sheetsUrl="https://docs.google.com/spreadsheets/abc" />);
    const link = screen.getByRole("link", { name: /ver planilha/i });
    expect(link).toHaveAttribute("href", "https://docs.google.com/spreadsheets/abc");
  });

  it("omite o botão quando não há URL", () => {
    render(<SheetsBanner sheetsUrl={undefined} />);
    expect(screen.queryByRole("link", { name: /ver planilha/i })).not.toBeInTheDocument();
  });
});
