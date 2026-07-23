import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromoverFonteButton } from "../PromoverFonteButton";

const mocks = vi.hoisted(() => ({
  promover: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/promoverFonte", () => ({
  promoverResultadoSimilaridade: mocks.promover,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

describe("PromoverFonteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra estado 'Promovido' desabilitado quando já promovido", () => {
    render(<PromoverFonteButton resultadoId="r-1" jaPromovido />);
    expect(screen.getByText("Promovido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promover para fonte/i })).not.toBeInTheDocument();
  });

  it("ao sucesso, exibe toast de sucesso e atualiza a rota", async () => {
    mocks.promover.mockResolvedValue({ data: { fonteId: "fonte-1" } });
    render(<PromoverFonteButton resultadoId="r-1" jaPromovido={false} />);

    fireEvent.click(screen.getByRole("button", { name: /promover para fonte/i }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Candidato promovido para Fonte"));
    expect(mocks.promover).toHaveBeenCalledWith("r-1");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("ao erro, exibe toast de erro e não atualiza a rota", async () => {
    mocks.promover.mockResolvedValue({ error: "Este candidato já foi promovido" });
    render(<PromoverFonteButton resultadoId="r-1" jaPromovido={false} />);

    fireEvent.click(screen.getByRole("button", { name: /promover para fonte/i }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Este candidato já foi promovido"),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
