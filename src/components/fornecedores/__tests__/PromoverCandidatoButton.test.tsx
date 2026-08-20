import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromoverCandidatoButton } from "../PromoverCandidatoButton";

const mocks = vi.hoisted(() => ({
  promover: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/candidatosFornecedor", () => ({
  promoverCandidatoFornecedor: mocks.promover,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

describe("PromoverCandidatoButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra 'Já cadastrado' e nenhum botão de promover quando o CNPJ já está no cadastro", () => {
    render(
      <PromoverCandidatoButton
        candidatoId="c-1"
        razaoSocial="EMPRESA"
        categoriaSugerida={["limpeza"]}
        categoriasDisponiveis={["limpeza"]}
        jaCadastrado
      />,
    );
    expect(screen.getByText("Já cadastrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promover/i })).not.toBeInTheDocument();
  });

  it("promove direto quando já há categoria sugerida", async () => {
    mocks.promover.mockResolvedValue({ data: { fornecedorId: "forn-1" } });
    render(
      <PromoverCandidatoButton
        candidatoId="c-1"
        razaoSocial="FERRAGENS BAIXADA LTDA"
        categoriaSugerida={["ferragens"]}
        categoriasDisponiveis={["ferragens"]}
        jaCadastrado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /promover/i }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "FERRAGENS BAIXADA LTDA entrou no cadastro de fornecedores.",
      ),
    );
    expect(mocks.promover).toHaveBeenCalledWith({ candidatoId: "c-1", categoria: undefined });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("ao erro, exibe toast e não atualiza a rota", async () => {
    mocks.promover.mockResolvedValue({ error: "CNPJ já cadastrado" });
    render(
      <PromoverCandidatoButton
        candidatoId="c-1"
        razaoSocial="EMPRESA"
        categoriaSugerida={["limpeza"]}
        categoriasDisponiveis={["limpeza"]}
        jaCadastrado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /promover/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("CNPJ já cadastrado"));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("abre diálogo para escolher categoria quando a sugerida veio vazia", () => {
    render(
      <PromoverCandidatoButton
        candidatoId="c-1"
        razaoSocial="EMPRESA"
        categoriaSugerida={[]}
        categoriasDisponiveis={["limpeza", "água"]}
        jaCadastrado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /promover/i }));
    expect(screen.getByLabelText(/categoria para promover/i)).toBeInTheDocument();
  });
});
