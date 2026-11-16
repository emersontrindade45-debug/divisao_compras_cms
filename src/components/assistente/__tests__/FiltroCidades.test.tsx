import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FiltroCidades } from "../FiltroCidades";
import type { Municipio } from "@/lib/domain/municipios/municipios";

const SANTOS: Municipio = { codigo: 3548500, nome: "Santos", uf: "SP" };
const SAO_PAULO: Municipio = { codigo: 3550308, nome: "São Paulo", uf: "SP" };
const SAO_VICENTE: Municipio = { codigo: 3551009, nome: "São Vicente", uf: "SP" };

function Controlado({ inicial = [] as Municipio[], espiao = vi.fn() }) {
  const [cidades, setCidades] = useState<Municipio[]>(inicial);
  return (
    <FiltroCidades
      selecionadas={cidades}
      onChange={(c) => {
        espiao(c);
        setCidades(c);
      }}
    />
  );
}

describe("FiltroCidades", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const q = new URL(String(url), "http://localhost").searchParams.get("q") ?? "";
      const lista = q.toLowerCase().startsWith("sa")
        ? [SANTOS, SAO_PAULO, SAO_VICENTE]
        : [];
      return new Response(JSON.stringify({ municipios: lista }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("abre a lista ao digitar e adiciona várias cidades como chips", async () => {
    const espiao = vi.fn();
    render(<Controlado espiao={espiao} />);
    const campo = screen.getByRole("combobox", { name: "Buscar cidade" });

    fireEvent.change(campo, { target: { value: "sa" } });
    fireEvent.click(await screen.findByRole("option", { name: /Santos/ }));

    // O campo limpa para a próxima cidade.
    expect(campo).toHaveValue("");
    fireEvent.change(campo, { target: { value: "sao" } });
    fireEvent.click(await screen.findByRole("option", { name: /São Vicente/ }));

    expect(espiao).toHaveBeenLastCalledWith([SANTOS, SAO_VICENTE]);
    const chips = screen.getByRole("list", { name: "Cidades selecionadas" });
    expect(chips).toHaveTextContent("Santos/SP");
    expect(chips).toHaveTextContent("São Vicente/SP");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/municipios?q=sa"),
      expect.anything(),
    );
  });

  it("remove a cidade pelo X do chip", () => {
    const espiao = vi.fn();
    render(<Controlado inicial={[SANTOS, SAO_PAULO]} espiao={espiao} />);

    fireEvent.click(screen.getByRole("button", { name: "Remover Santos/SP" }));

    expect(espiao).toHaveBeenLastCalledWith([SAO_PAULO]);
    expect(screen.queryByText("Santos/SP")).not.toBeInTheDocument();
  });

  it("Enter escolhe a cidade destacada sem enviar o formulário", async () => {
    const espiao = vi.fn();
    const enviar = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={enviar}>
        <Controlado espiao={espiao} />
      </form>,
    );
    const campo = screen.getByRole("combobox", { name: "Buscar cidade" });

    fireEvent.change(campo, { target: { value: "sa" } });
    await screen.findByRole("option", { name: /Santos/ });
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(espiao).toHaveBeenLastCalledWith([SAO_PAULO]);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("clicar de novo numa cidade já escolhida a tira da seleção", async () => {
    const espiao = vi.fn();
    render(<Controlado inicial={[SANTOS]} espiao={espiao} />);
    const campo = screen.getByRole("combobox", { name: "Buscar cidade" });

    fireEvent.change(campo, { target: { value: "sa" } });
    const opcao = await screen.findByRole("option", { name: /Santos/ });
    expect(opcao).toHaveAttribute("aria-selected", "true");
    fireEvent.click(opcao);

    await waitFor(() => expect(espiao).toHaveBeenLastCalledWith([]));
  });
});
