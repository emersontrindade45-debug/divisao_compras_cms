import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AplicarPoliticaIa } from "../AplicarPoliticaIa";
import { aplicarPoliticaIa } from "@/lib/actions/aplicarPoliticaIa";

vi.mock("@/lib/actions/aplicarPoliticaIa", () => ({
  aplicarPoliticaIa: vi.fn(async () => ({
    data: { desligada: false, aplicadas: 3, porClasse: { recusa: 2, duvida: 1 }, ignoradas: 1, restantes: 0 },
  })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("AplicarPoliticaIa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem nada a aplicar não mostra o botão", () => {
    const { container } = render(<AplicarPoliticaIa contagem={{ recusa: 0, duvida: 0 }} />);
    expect(container.textContent).toBe("");
  });

  it("diz quantas cabem, por classe, e o que fica para o analista", () => {
    render(<AplicarPoliticaIa contagem={{ recusa: 14, duvida: 6 }} />);
    expect(screen.getByText(/14 recusa\(s\) e 6 dúvida\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Ficam para você: orçamento/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar a política (20)" })).toBeTruthy();
  });

  it("o botão mostra no máximo 100 por clique", () => {
    render(<AplicarPoliticaIa contagem={{ recusa: 150, duvida: 0 }} />);
    expect(screen.getByRole("button", { name: "Aplicar a política (100)" })).toBeTruthy();
  });

  it("clicar aplica, informa o resultado por classe e atualiza a tela", async () => {
    render(<AplicarPoliticaIa contagem={{ recusa: 2, duvida: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar a política/ }));
    await waitFor(() => expect(aplicarPoliticaIa).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "3 aplicada(s): 2 recusa(s) e 1 dúvida(s). 1 já tinham decisão e não foram alteradas.",
    );
  });

  it("erro da ação aparece e NÃO atualiza a tela", async () => {
    vi.mocked(aplicarPoliticaIa).mockResolvedValueOnce({ error: "A aplicação automática da IA está desligada." });
    render(<AplicarPoliticaIa contagem={{ recusa: 1, duvida: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar a política/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A aplicação automática da IA está desligada."));
    expect(refresh).not.toHaveBeenCalled();
  });
});
