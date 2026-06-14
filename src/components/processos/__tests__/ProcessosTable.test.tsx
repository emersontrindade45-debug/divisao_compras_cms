import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessosTable } from "../ProcessosTable";
import { PROCESSOS } from "@/lib/fixtures/processos";

describe("ProcessosTable", () => {
  it("renderiza todas as linhas inicialmente", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    expect(screen.getByText("Aquisição de cadeiras ergonômicas")).toBeInTheDocument();
    expect(screen.getByText("Locação de impressoras multifuncionais")).toBeInTheDocument();
  });

  it("filtra ao digitar na busca", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "cadeira" },
    });
    expect(screen.getByText("Aquisição de cadeiras ergonômicas")).toBeInTheDocument();
    expect(screen.queryByText("Locação de impressoras multifuncionais")).not.toBeInTheDocument();
  });

  it("o número do processo é um link para o detalhe", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    const link = screen.getByRole("link", { name: "2026/001" });
    expect(link).toHaveAttribute("href", "/processos/proc-001");
  });

  it("mostra estado vazio quando nada bate no filtro", () => {
    render(<ProcessosTable processos={PROCESSOS} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "zzzznada" },
    });
    expect(screen.getByText(/nenhum processo encontrado/i)).toBeInTheDocument();
  });
});
