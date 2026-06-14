import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessoFilters, type FiltrosProcesso } from "../ProcessoFilters";

const FILTROS_VAZIOS: FiltrosProcesso = {
  busca: "",
  status: "todos",
  responsavel: "todos",
  dataInicio: "",
  dataFim: "",
};

describe("ProcessoFilters", () => {
  it("chama onChange ao digitar na busca", () => {
    const onChange = vi.fn();
    render(
      <ProcessoFilters
        filtros={FILTROS_VAZIOS}
        responsaveis={["Ana Souza"]}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/filtrar por objeto/i), {
      target: { value: "cadeira" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_VAZIOS, busca: "cadeira" });
  });

  it("renderiza os responsáveis recebidos", () => {
    render(
      <ProcessoFilters
        filtros={FILTROS_VAZIOS}
        responsaveis={["Ana Souza", "Bruno Lima"]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bruno Lima" })).toBeInTheDocument();
  });
});
