import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassificarSemFornecedorEmLote } from "../ClassificarSemFornecedorEmLote";
import { classificarSemFornecedorPelaIa } from "@/lib/actions/classificarSemFornecedor";

vi.mock("@/lib/actions/classificarSemFornecedor", () => ({
  classificarSemFornecedorPelaIa: vi.fn(async () => ({ data: { classificadas: 146 } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const C = { orcamento: 43, recusa: 71, duvida: 32 };

describe("ClassificarSemFornecedorEmLote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem nada a classificar não renderiza", () => {
    const { container } = render(<ClassificarSemFornecedorEmLote contagem={{ orcamento: 0, recusa: 0, duvida: 0 }} />);
    expect(container.innerHTML).toBe("");
  });

  it("mostra a contagem por categoria e o total", () => {
    render(<ClassificarSemFornecedorEmLote contagem={C} />);
    expect(screen.getByRole("button", { name: /Classificar 146 pela IA/ })).toBeTruthy();
    expect(screen.getByText("43")).toBeTruthy();
    expect(screen.getByText("71")).toBeTruthy();
    expect(screen.getByText("32")).toBeTruthy();
  });

  it("dois passos: o primeiro clique só pede confirmação; cancelar não chama", () => {
    render(<ClassificarSemFornecedorEmLote contagem={C} />);
    fireEvent.click(screen.getByRole("button", { name: /Classificar 146/ }));
    expect(classificarSemFornecedorPelaIa).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(classificarSemFornecedorPelaIa).not.toHaveBeenCalled();
  });

  it("confirmar chama a ação sem ids do cliente e atualiza a tela", async () => {
    render(<ClassificarSemFornecedorEmLote contagem={C} />);
    fireEvent.click(screen.getByRole("button", { name: /Classificar 146/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, classificar 146" }));
    await waitFor(() => expect(classificarSemFornecedorPelaIa).toHaveBeenCalledWith());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
