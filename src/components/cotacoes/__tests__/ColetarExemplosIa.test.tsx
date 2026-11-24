import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ColetarExemplosIa } from "../ColetarExemplosIa";
import { coletarExemplosIa } from "@/lib/actions/coletarExemplosIa";

vi.mock("@/lib/actions/coletarExemplosIa", () => ({ coletarExemplosIa: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const R = { decisoes: 40, jaTinham: 10, pedidos: 30, gravados: 27, atualizados: 1, rejeitados: { email: 2 }, semTexto: 1, restantes: 3, removidos: 0 };

describe("ColetarExemplosIa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(coletarExemplosIa).mockResolvedValue({ data: R });
  });

  it("explica o que é guardado e que só decisão humana entra", () => {
    render(<ColetarExemplosIa />);
    expect(screen.getByText(/anonimizado/)).toBeTruthy();
    expect(screen.getByText(/leitura da própria IA nunca vira exemplo/)).toBeTruthy();
    expect(screen.getByText(/desligado até a medição/)).toBeTruthy();
  });

  it("clicar coleta, informa cada contagem (inclusive o que foi recusado) e atualiza a tela", async () => {
    render(<ColetarExemplosIa />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar exemplos da IA" }));
    await waitFor(() => expect(coletarExemplosIa).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "27 exemplo(s) novo(s) guardado(s), 1 corrigido(s), 2 recusado(s) por ainda parecerem conter dado pessoal, 1 sem texto. Faltam 3: clique de novo.",
    );
  });

  it("nada novo: diz que não há nada a fazer em vez de '0 guardados'", async () => {
    vi.mocked(coletarExemplosIa).mockResolvedValue({ data: { ...R, pedidos: 0, atualizados: 0, gravados: 0, rejeitados: {}, semTexto: 0, restantes: 0, jaTinham: 12 } });
    render(<ColetarExemplosIa />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar exemplos/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Nada novo: os 12 caso(s) decidido(s) já são exemplos."));
  });

  it("erro do servidor aparece como erro, não como sucesso", async () => {
    vi.mocked(coletarExemplosIa).mockResolvedValue({ error: "O Google recusou a leitura dos casos." });
    render(<ColetarExemplosIa />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar exemplos/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O Google recusou a leitura dos casos."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
