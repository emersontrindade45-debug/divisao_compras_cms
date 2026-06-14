import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContratacoesFilters } from "../ContratacoesFilters";

describe("ContratacoesFilters", () => {
  const defaultProps = {
    busca: "",
    aderencia: "todos",
    modalidade: "todos",
    dataInicio: "",
    dataFim: "",
    modalidades: ["Pregão Eletrônico", "Dispensa de Licitação"],
    onChange: vi.fn(),
  };

  it("renderiza sem erro", () => {
    render(<ContratacoesFilters {...defaultProps} />);
  });

  it("mostra o input de busca", () => {
    render(<ContratacoesFilters {...defaultProps} />);
    expect(screen.getByPlaceholderText(/filtrar/i)).toBeInTheDocument();
  });

  it("chama onChange quando busca muda", () => {
    const onChange = vi.fn();
    render(<ContratacoesFilters {...defaultProps} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/filtrar/i);
    fireEvent.change(input, { target: { value: "cadeira" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ busca: "cadeira" }),
    );
  });

  it("chama onChange quando aderência muda", () => {
    const onChange = vi.fn();
    render(<ContratacoesFilters {...defaultProps} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: /aderência/i });
    fireEvent.change(select, { target: { value: "aderente" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ aderencia: "aderente" }),
    );
  });

  it("lista as modalidades fornecidas", () => {
    render(<ContratacoesFilters {...defaultProps} />);
    expect(screen.getByText("Pregão Eletrônico")).toBeInTheDocument();
    expect(screen.getByText("Dispensa de Licitação")).toBeInTheDocument();
  });
});
