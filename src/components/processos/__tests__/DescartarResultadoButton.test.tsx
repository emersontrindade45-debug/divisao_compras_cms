import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DescartarResultadoButton } from "../DescartarResultadoButton";

const mocks = vi.hoisted(() => ({
  descartar: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/descartarResultadoSimilaridade", () => ({
  descartarResultadoSimilaridade: mocks.descartar,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

describe("DescartarResultadoButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ao sucesso, exibe toast de sucesso e atualiza a rota", async () => {
    mocks.descartar.mockResolvedValue({ data: { resultadoId: "r-1" } });
    render(<DescartarResultadoButton resultadoId="r-1" />);

    fireEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Candidato removido da lista"),
    );
    expect(mocks.descartar).toHaveBeenCalledWith("r-1");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("ao erro, exibe toast de erro e não atualiza a rota", async () => {
    mocks.descartar.mockResolvedValue({
      error: "Candidato já promovido para Fonte não pode ser descartado",
    });
    render(<DescartarResultadoButton resultadoId="r-1" />);

    fireEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Candidato já promovido para Fonte não pode ser descartado",
      ),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
