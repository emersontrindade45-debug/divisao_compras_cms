import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "../GlobalSearch";
import type { ResultadoBuscaGlobal } from "@/lib/actions/buscaGlobal";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function mockFetch(resultado: ResultadoBuscaGlobal) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(resultado),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const RESULTADO_EXEMPLO: ResultadoBuscaGlobal = {
  processos: [
    { id: "proc-001", numero: "2026/001", objeto: "Aquisição de cadeiras", status: "pendente" },
  ],
  fornecedores: [
    {
      id: "forn-001",
      razaoSocial: "Móveis Santos LTDA",
      cnpj: "12.345.678/0001-90",
      cidade: "Santos",
      estado: "SP",
    },
  ],
};

describe("GlobalSearch", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não dispara fetch nem abre dropdown com menos de 2 caracteres", () => {
    const fetchMock = mockFetch(RESULTADO_EXEMPLO);
    render(<GlobalSearch />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a" } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renderiza grupos e links de processo e fornecedor com >= 2 caracteres", async () => {
    mockFetch(RESULTADO_EXEMPLO);
    render(<GlobalSearch />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cadeira" } });

    const linkProcesso = await screen.findByRole("option", { name: /2026\/001/ });
    expect(linkProcesso).toHaveAttribute("href", "/processos/proc-001");

    expect(screen.getByText("Processos")).toBeInTheDocument();
    expect(screen.getByText("Fornecedores")).toBeInTheDocument();

    const linkFornecedor = screen.getByRole("option", { name: /Móveis Santos LTDA/ });
    expect(linkFornecedor).toHaveAttribute("href", "/fornecedores");
  });

  it("mostra estado vazio quando não há resultados", async () => {
    mockFetch({ processos: [], fornecedores: [] });
    render(<GlobalSearch />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzznada" } });

    expect(await screen.findByText(/nenhum resultado para/i)).toBeInTheDocument();
  });

  it("navega pelo teclado (setas + Enter) para o item ativo", async () => {
    mockFetch(RESULTADO_EXEMPLO);
    render(<GlobalSearch />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "cadeira" } });

    await screen.findByRole("option", { name: /2026\/001/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/processos/proc-001");
  });
});
