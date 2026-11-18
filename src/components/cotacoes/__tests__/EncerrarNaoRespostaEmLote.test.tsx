import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncerrarNaoRespostaEmLote } from "../EncerrarNaoRespostaEmLote";
import { encerrarNaoRespostaSemFornecedor } from "@/lib/actions/encerrarNaoResposta";

vi.mock("@/lib/actions/encerrarNaoResposta", () => ({
  encerrarNaoRespostaSemFornecedor: vi.fn(async () => ({ data: { encerradas: 42 } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("EncerrarNaoRespostaEmLote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem nenhuma elegível não renderiza nada", () => {
    const { container } = render(<EncerrarNaoRespostaEmLote quantas={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("exige dois passos: o primeiro clique só pede confirmação", () => {
    render(<EncerrarNaoRespostaEmLote quantas={42} />);
    fireEvent.click(screen.getByRole("button", { name: /Encerrar 42 como não é resposta/ }));
    expect(encerrarNaoRespostaSemFornecedor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sim, encerrar 42" })).toBeTruthy();
  });

  it("confirmar chama a ação (sem ids do cliente) e atualiza a tela; cancelar não chama", async () => {
    render(<EncerrarNaoRespostaEmLote quantas={42} />);
    fireEvent.click(screen.getByRole("button", { name: /Encerrar 42/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(encerrarNaoRespostaSemFornecedor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Encerrar 42/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sim, encerrar 42" }));
    await waitFor(() => expect(encerrarNaoRespostaSemFornecedor).toHaveBeenCalledWith());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
