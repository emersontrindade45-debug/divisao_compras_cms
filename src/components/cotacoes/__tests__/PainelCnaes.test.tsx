import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sugerir: vi.fn(),
  manual: vi.fn(),
  aprovar: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/sugerirCnaesComContagem", () => ({
  sugerirCnaesComContagem: mocks.sugerir,
  buscarCnaeManual: mocks.manual,
}));

import { PainelCnaes } from "../PainelCnaes";

function cnae(codigo: string, descricao: string, empresas: number, daIa = true) {
  return { codigo, descricao, empresas, locais: Math.floor(empresas / 10), daIa };
}

const PRIMEIRA = [
  cnae("4330404", "Serviços de pintura de edifícios", 54981),
  cnae("8121400", "Limpeza em prédios", 4345),
  cnae("9601701", "Lavanderias", 7200),
];

function renderPainel() {
  render(<PainelCnaes objeto="Limpeza predial" onAprovar={mocks.aprovar} buscando={false} />);
}

async function sugerirPrimeira() {
  mocks.sugerir.mockResolvedValue({ cnaes: PRIMEIRA });
  fireEvent.click(screen.getByRole("button", { name: /Sugerir atividades/i }));
  await waitFor(() => expect(screen.getByText("Lavanderias")).toBeInTheDocument());
}

const check = (codigo: string) =>
  screen.getByLabelText(`Incluir CNAE ${codigo}`) as HTMLInputElement;

describe("PainelCnaes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra a contagem de empresas ao lado de cada CNAE", async () => {
    renderPainel();
    await sugerirPrimeira();

    // É o dado que permite julgar: 54.981 de pintura salta à vista.
    expect(screen.getByText("54.981")).toBeInTheDocument();
    expect(screen.getByText("7.200")).toBeInTheDocument();
  });

  it("vem tudo marcado e soma o total das empresas", async () => {
    renderPainel();
    await sugerirPrimeira();

    expect(check("4330404").checked).toBe(true);
    // 54981 + 4345 + 7200
    expect(screen.getByText("66.526")).toBeInTheDocument();
  });

  it("desmarcar um CNAE reduz o total", async () => {
    renderPainel();
    await sugerirPrimeira();

    fireEvent.click(check("4330404"));

    // 66.526 - 54.981
    expect(screen.getByText("11.545")).toBeInTheDocument();
  });

  it("aprova somente os CNAEs marcados", async () => {
    renderPainel();
    await sugerirPrimeira();

    fireEvent.click(check("4330404"));
    fireEvent.click(check("9601701"));
    fireEvent.click(screen.getByRole("button", { name: /Buscar empresas/i }));

    expect(mocks.aprovar).toHaveBeenCalledWith(["8121400"]);
  });

  it("refinar NÃO remarca o que o analista havia desmarcado", async () => {
    renderPainel();
    await sugerirPrimeira();

    // Analista descarta pintura...
    fireEvent.click(check("4330404"));
    expect(check("4330404").checked).toBe(false);

    // ...e refina. A IA devolve os mesmos códigos.
    mocks.sugerir.mockResolvedValue({ cnaes: PRIMEIRA });
    fireEvent.click(screen.getByRole("button", { name: /Refinar/i }));

    await waitFor(() => expect(mocks.sugerir).toHaveBeenCalledTimes(2));
    // A decisão dele sobrevive ao refinamento.
    expect(check("4330404").checked).toBe(false);
    expect(check("8121400").checked).toBe(true);
  });

  it("refinar traz CNAEs novos já marcados", async () => {
    renderPainel();
    await sugerirPrimeira();

    mocks.sugerir.mockResolvedValue({
      cnaes: [...PRIMEIRA, cnae("4399102", "Montagem de andaimes", 448)],
    });
    fireEvent.click(screen.getByRole("button", { name: /Refinar/i }));

    await waitFor(() => expect(screen.getByText("Montagem de andaimes")).toBeInTheDocument());
    expect(check("4399102").checked).toBe(true);
  });

  it("passa o contexto adicional para a IA", async () => {
    renderPainel();
    await sugerirPrimeira();

    fireEvent.change(screen.getByLabelText(/Contexto adicional/i), {
      target: { value: "fachada com rapel" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Refinar/i }));

    await waitFor(() =>
      expect(mocks.sugerir).toHaveBeenLastCalledWith("Limpeza predial", "fachada com rapel"),
    );
  });

  it("acrescenta CNAE informado à mão, marcado e sinalizado", async () => {
    renderPainel();
    await sugerirPrimeira();

    mocks.manual.mockResolvedValue(cnae("4321500", "Instalação elétrica", 900, false));
    fireEvent.change(screen.getByLabelText(/Adicionar CNAE manualmente/i), {
      target: { value: "4321500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "" }) ?? screen.getAllByRole("button")[1]);

    await waitFor(() => expect(screen.getByText("Instalação elétrica")).toBeInTheDocument());
    expect(check("4321500").checked).toBe(true);
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("CNAE manual sobrevive ao refinamento", async () => {
    renderPainel();
    await sugerirPrimeira();

    mocks.manual.mockResolvedValue(cnae("4321500", "Instalação elétrica", 900, false));
    fireEvent.change(screen.getByLabelText(/Adicionar CNAE manualmente/i), {
      target: { value: "4321500" },
    });
    fireEvent.click(screen.getAllByRole("button")[1]);
    await waitFor(() => expect(screen.getByText("Instalação elétrica")).toBeInTheDocument());

    mocks.sugerir.mockResolvedValue({ cnaes: PRIMEIRA });
    fireEvent.click(screen.getByRole("button", { name: /Refinar/i }));

    await waitFor(() => expect(mocks.sugerir).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Instalação elétrica")).toBeInTheDocument();
  });

  it("não chama a busca quando nenhum CNAE está marcado", async () => {
    renderPainel();
    await sugerirPrimeira();

    for (const c of PRIMEIRA) fireEvent.click(check(c.codigo));

    expect(screen.getByRole("button", { name: /Buscar empresas/i })).toBeDisabled();
  });
});
