import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AplicadasPelaIa, type AplicadaPelaIaItem } from "../AplicadasPelaIa";
import { desfazerRespostaAplicadaPelaIa } from "@/lib/actions/desfazerAplicacaoIa";

vi.mock("@/lib/actions/desfazerAplicacaoIa", () => ({
  desfazerRespostaAplicadaPelaIa: vi.fn(async () => ({ data: { desfeita: true } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const desfazerMock = vi.mocked(desfazerRespostaAplicadaPelaIa);

const item = (over: Partial<AplicadaPelaIaItem> = {}): AplicadaPelaIaItem => ({
  gmailMensagemId: "m1",
  classe: "recusa",
  justificativa: "Fornecedor não atende a região.",
  aplicadaEm: "2026-11-18T15:00:00.000Z",
  processoNumero: "0382/2026",
  fornecedor: "ACME",
  linkGmail: "https://mail.google.com/x",
  ...over,
});

describe("AplicadasPelaIa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem itens, explica o que a aba mostra em vez de ficar vazia", () => {
    render(<AplicadasPelaIa itens={[]} />);
    expect(screen.getByText(/Nenhuma resposta foi classificada pela IA sozinha/)).toBeInTheDocument();
  });

  it("mostra a classe, a justificativa, o fornecedor e o link do Gmail — nunca o texto do e-mail", () => {
    render(<AplicadasPelaIa itens={[item()]} />);
    expect(screen.getByText("IA aplicou: recusa")).toBeInTheDocument();
    expect(screen.getByText("Fornecedor não atende a região.")).toBeInTheDocument();
    expect(screen.getByText("ACME")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir no Gmail/ })).toHaveAttribute("href", "https://mail.google.com/x");
  });

  it("'Desfazer' chama a ação com a mensagem certa e atualiza a tela", async () => {
    render(<AplicadasPelaIa itens={[item({ gmailMensagemId: "m42" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    await waitFor(() => expect(desfazerMock).toHaveBeenCalledWith({ gmailMensagemId: "m42" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("se a ação falha, não atualiza a tela como se tivesse dado certo", async () => {
    desfazerMock.mockResolvedValueOnce({ error: "Esta aplicação já foi desfeita ou não existe." });
    render(<AplicadasPelaIa itens={[item()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    await waitFor(() => expect(desfazerMock).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cada resposta tem o seu próprio botão", () => {
    render(<AplicadasPelaIa itens={[item({ gmailMensagemId: "a" }), item({ gmailMensagemId: "b" })]} />);
    expect(screen.getAllByRole("button", { name: /Desfazer/ })).toHaveLength(2);
  });
});
