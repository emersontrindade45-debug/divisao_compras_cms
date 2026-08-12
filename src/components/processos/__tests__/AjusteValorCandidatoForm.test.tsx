import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ajustarValorCandidato: vi.fn(),
  limparAjusteValorCandidato: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/actions/ajustarValorCandidato", () => ({
  ajustarValorCandidato: mocks.ajustarValorCandidato,
  limparAjusteValorCandidato: mocks.limparAjusteValorCandidato,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { AjusteValorCandidatoForm } from "../AjusteValorCandidatoForm";

const PROPS = {
  resultadoId: "res-1",
  valorUnitarioOriginal: 15000,
  ajusteValorBase: null,
  ajusteOperacao: null,
  ajusteQuantidade: null,
  ajusteUnidadeMedida: null,
  ajusteQuantidadeTR: null,
  ajustePeriodicidade: null,
  ajusteBaseSerie: null,
  temAjuste: false,
  quantidadeItemTR: 940,
  unidadeItemTR: "m²",
  jaPromovido: false,
  onFechar: vi.fn(),
};

describe("AjusteValorCandidatoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ajustarValorCandidato.mockResolvedValue({ data: { valorUnitarioAjustado: 100 } });
    mocks.limparAjusteValorCandidato.mockResolvedValue({ data: { valorUnitario: 15000 } });
  });

  it("parte do valor publicado pela fonte e calcula o unitário ao informar a quantidade", () => {
    render(<AjusteValorCandidatoForm {...PROPS} />);

    const quantidade = screen.getByLabelText("Quantidade do contrato");
    fireEvent.change(quantidade, { target: { value: "150" } });

    // O caso real: R$ 15.000,00 por 150 m² são R$ 100,00 o m².
    expect(screen.getByText(/R\$\s*100,00/)).toBeInTheDocument();
  });

  it("projeta o custo do objeto do TR sem misturar com o valor unitário", () => {
    render(<AjusteValorCandidatoForm {...PROPS} />);

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), {
      target: { value: "150" },
    });

    // 100,00 x 940 m² do TR = 94.000,00 — demonstrativo, não entra na mediana.
    expect(screen.getByText(/R\$\s*94\.000,00/)).toBeInTheDocument();
  });

  it("envia os operandos já convertidos de pt-BR para a server action", async () => {
    render(<AjusteValorCandidatoForm {...PROPS} />);

    fireEvent.change(screen.getByLabelText("Valor do contrato"), {
      target: { value: "15.000,00" },
    });
    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText("Unidade de medida"), { target: { value: "m²" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar ajuste/ }));

    await waitFor(() => expect(mocks.ajustarValorCandidato).toHaveBeenCalled());
    expect(mocks.ajustarValorCandidato).toHaveBeenCalledWith(
      expect.objectContaining({
        resultadoId: "res-1",
        valorBase: 15000,
        operacao: "divisao",
        quantidade: 150,
        unidadeMedida: "m²",
        quantidadeTR: 940,
      }),
    );
  });

  // Botão que dispara uma conta impossível é pior que botão ausente (§9.40):
  // o analista clicaria e o erro só apareceria depois da ida ao servidor.
  it("bloqueia o salvamento enquanto o cálculo não é válido", () => {
    render(<AjusteValorCandidatoForm {...PROPS} />);

    // Sem quantidade informada, a divisão não tem resultado.
    expect(screen.getByRole("button", { name: /Salvar ajuste/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /Salvar ajuste/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), { target: { value: "150" } });
    expect(screen.getByRole("button", { name: /Salvar ajuste/ })).toBeEnabled();
  });

  it("avisa que a série de preços é atualizada junto quando o candidato já foi promovido", () => {
    render(<AjusteValorCandidatoForm {...PROPS} jaPromovido />);

    expect(screen.getByText(/atualiza também a Fonte e a série de preços/)).toBeInTheDocument();
  });

  it("só oferece limpar ajuste quando existe ajuste gravado", () => {
    const { rerender } = render(<AjusteValorCandidatoForm {...PROPS} />);
    expect(screen.queryByRole("button", { name: /Limpar ajuste/ })).not.toBeInTheDocument();

    rerender(<AjusteValorCandidatoForm {...PROPS} temAjuste ajusteQuantidade={150} />);
    expect(screen.getByRole("button", { name: /Limpar ajuste/ })).toBeInTheDocument();
  });

  // O caso relatado em 2026-08-12: com x, o resultado (R$ 31.275,00) é o custo
  // do escopo do contrato; o que o analista quer na mediana é ele x 6 do TR.
  it("manda o valor projetado quando o analista escolhe essa base", async () => {
    // Operação já em multiplicação: o Select do Base UI não é dirigível no
    // jsdom, e o que este teste prova é a escolha da base, não o select.
    render(
      <AjusteValorCandidatoForm
        {...PROPS}
        valorUnitarioOriginal={6.95}
        quantidadeItemTR={6}
        ajusteOperacao="multiplicacao"
      />,
    );

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), {
      target: { value: "4500" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /valor projetado para o TR/i }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar ajuste/ }));

    await waitFor(() => expect(mocks.ajustarValorCandidato).toHaveBeenCalled());
    expect(mocks.ajustarValorCandidato).toHaveBeenCalledWith(
      expect.objectContaining({ baseSerie: "projetado_tr", quantidadeTR: 6 }),
    );
  });

  it("mostra os dois valores e marca qual está selecionado", () => {
    // Operação já em multiplicação: o Select do Base UI não é dirigível no
    // jsdom, e o que este teste prova é a escolha da base, não o select.
    render(
      <AjusteValorCandidatoForm
        {...PROPS}
        valorUnitarioOriginal={6.95}
        quantidadeItemTR={6}
        ajusteOperacao="multiplicacao"
      />,
    );

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), {
      target: { value: "4500" },
    });

    const unitario = screen.getByRole("radio", { name: /valor unitário/i });
    const projetado = screen.getByRole("radio", { name: /valor projetado para o TR/i });

    expect(unitario).toHaveTextContent(/31\.275,00/);
    expect(projetado).toHaveTextContent(/187\.650,00/);
    expect(unitario).toHaveAttribute("aria-checked", "true");

    fireEvent.click(projetado);
    expect(projetado).toHaveAttribute("aria-checked", "true");
    expect(unitario).toHaveAttribute("aria-checked", "false");
  });

  it("bloqueia o salvamento se a projeção for escolhida sem quantidade de TR", () => {
    render(<AjusteValorCandidatoForm {...PROPS} />);

    fireEvent.change(screen.getByLabelText("Quantidade do contrato"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Quantidade do TR da Câmara"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: /valor projetado para o TR/i }));

    expect(screen.getByRole("button", { name: /Salvar ajuste/ })).toBeDisabled();
  });

  it("repopula os campos com o ajuste já gravado", () => {
    render(
      <AjusteValorCandidatoForm
        {...PROPS}
        temAjuste
        ajusteValorBase={15000}
        ajusteOperacao="divisao"
        ajusteQuantidade={150}
        ajusteUnidadeMedida="m²"
        ajusteQuantidadeTR={940}
      />,
    );

    expect(screen.getByLabelText("Quantidade do contrato")).toHaveValue("150");
    expect(screen.getByLabelText("Unidade de medida")).toHaveValue("m²");
    expect(screen.getByLabelText("Quantidade do TR da Câmara")).toHaveValue("940");
  });
});
