import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { FecharPendenciasIa, totalDoFechamento, type ContagemFechamento } from "../FecharPendenciasIa";
import { fecharPendenciasIa } from "@/lib/actions/fecharPendenciasIa";

vi.mock("@/lib/actions/fecharPendenciasIa", () => ({
  fecharPendenciasIa: vi.fn(async () => ({
    data: { iaDesligada: false, aplicadas: 19, ignoradas: 1, semFornecedor: 4, fechadasSemAlterar: 56, dispensadas: 81 },
  })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const C: ContagemFechamento = {
  aplicarOrcamento: 5, aplicarRecusa: 0, aplicarDuvida: 0, aplicarNaoEResposta: 14,
  semFornecedor: 4, fecharSemAlterar: 56, dispensar: 81,
};

describe("FecharPendenciasIa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soma todos os grupos", () => {
    expect(totalDoFechamento(C)).toBe(160);
  });

  it("sem nada a fechar não mostra o botão", () => {
    const zero = { aplicarOrcamento: 0, aplicarRecusa: 0, aplicarDuvida: 0, aplicarNaoEResposta: 0, semFornecedor: 0, fecharSemAlterar: 0, dispensar: 0 };
    const { container } = render(<FecharPendenciasIa contagem={zero} />);
    expect(container.textContent).toBe("");
  });

  it("descreve cada grupo e avisa que nunca altera consulta decidida nem apaga nada", () => {
    render(<FecharPendenciasIa contagem={C} />);
    expect(screen.getByText(/19/)).toBeTruthy();
    expect(screen.getByText(/já tem decisão: só a entrada da fila é encerrada/)).toBeTruthy();
    expect(screen.getByText(/dispensadas da fila/)).toBeTruthy();
    expect(screen.getByText(/Nunca altera uma consulta que já tem decisão. Nada é apagado/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar todas as pendências (160)" })).toBeTruthy();
  });

  it("clicar fecha, informa cada grupo e atualiza a tela", async () => {
    render(<FecharPendenciasIa contagem={C} />);
    fireEvent.click(screen.getByRole("button", { name: /Fechar todas as pendências/ }));
    await waitFor(() => expect(fecharPendenciasIa).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "19 sugestão(ões) da IA aplicada(s), 4 sem fornecedor, 56 entrada(s) já decidida(s) encerrada(s) e 81 antiga(s) dispensada(s). 1 já tinham sido decididas e não foram alteradas.",
    );
  });

  it("avisa quando a aplicação da IA está desligada", async () => {
    vi.mocked(fecharPendenciasIa).mockResolvedValueOnce({
      data: { iaDesligada: true, aplicadas: 0, ignoradas: 0, semFornecedor: 0, fechadasSemAlterar: 56, dispensadas: 81 },
    });
    render(<FecharPendenciasIa contagem={C} />);
    fireEvent.click(screen.getByRole("button", { name: /Fechar todas as pendências/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0]![0]).toMatch(/aplicação da IA está desligada/);
  });

  it("erro da ação aparece e NÃO atualiza a tela", async () => {
    vi.mocked(fecharPendenciasIa).mockResolvedValueOnce({ error: "Falhou." });
    render(<FecharPendenciasIa contagem={C} />);
    fireEvent.click(screen.getByRole("button", { name: /Fechar todas as pendências/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falhou."));
    expect(refresh).not.toHaveBeenCalled();
  });
});
