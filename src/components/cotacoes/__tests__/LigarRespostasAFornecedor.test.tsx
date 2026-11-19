import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { LigarRespostasAFornecedor, type RespostaLigavelItem } from "../LigarRespostasAFornecedor";
import { buscarFornecedoresDoEnvio, ligarRespostaAoFornecedor } from "@/lib/actions/ligarRespostaFornecedor";

vi.mock("@/lib/actions/ligarRespostaFornecedor", () => ({
  buscarFornecedoresDoEnvio: vi.fn(async () => ({
    data: [{ consultaId: "c1", email: "vendas@acme.com.br", razaoSocial: "Acme Ltda", situacao: "sem_resposta" }],
  })),
  ligarRespostaAoFornecedor: vi.fn(async () => ({ data: { aplicada: true, situacao: "recusa" } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const ITEM: RespostaLigavelItem = {
  gmailMensagemId: "m1",
  classe: "recusa",
  justificativa: "Diz que não atende a região.",
  dominio: "acme.com.br",
  dominioGenerico: false,
  processoNumero: "12141/2025",
  linkGmail: "https://mail.google.com/mail/?authuser=x#all/m1",
};

describe("LigarRespostasAFornecedor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem itens, diz que não há o que ligar", () => {
    render(<LigarRespostasAFornecedor itens={[]} />);
    expect(screen.getByText(/Nenhuma resposta classificada está sem fornecedor/)).toBeTruthy();
  });

  it("mostra processo, classe da IA e link do Gmail — e não busca nada até o analista abrir", () => {
    render(<LigarRespostasAFornecedor itens={[ITEM]} />);
    expect(screen.getByText("12141/2025")).toBeTruthy();
    expect(screen.getByText("IA: recusa")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir no Gmail/ }).getAttribute("href")).toBe(ITEM.linkGmail);
    expect(buscarFornecedoresDoEnvio).not.toHaveBeenCalled();
  });

  it("abrir busca pelo domínio (termo vazio) e lista o fornecedor com a situação atual", async () => {
    render(<LigarRespostasAFornecedor itens={[ITEM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar a fornecedor" }));
    await waitFor(() => expect(buscarFornecedoresDoEnvio).toHaveBeenCalledWith({ gmailMensagemId: "m1", termo: "" }));
    expect(await screen.findByText("Acme Ltda")).toBeTruthy();
    expect(screen.getByText("sem resposta")).toBeTruthy();
  });

  it("ligar envia SÓ a mensagem e a consulta, avisa e atualiza a tela", async () => {
    render(<LigarRespostasAFornecedor itens={[ITEM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar a fornecedor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(ligarRespostaAoFornecedor).toHaveBeenCalledWith({ gmailMensagemId: "m1", consultaId: "c1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it("fornecedor que já tinha decisão: avisa que a situação foi mantida (não diz que mudou)", async () => {
    vi.mocked(ligarRespostaAoFornecedor).mockResolvedValueOnce({ data: { aplicada: false, situacao: "orcamento" } });
    render(<LigarRespostasAFornecedor itens={[ITEM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar a fornecedor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("erro da ação: mostra o erro e recarrega (a resposta pode já ter sido ligada em outra aba)", async () => {
    vi.mocked(ligarRespostaAoFornecedor).mockResolvedValueOnce({ error: "Esta resposta já foi ligada." });
    render(<LigarRespostasAFornecedor itens={[ITEM]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar a fornecedor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Esta resposta já foi ligada."));
    expect(refresh).toHaveBeenCalled();
  });

  it("a busca digitada envia o termo; domínio genérico sem resultado orienta a digitar", async () => {
    vi.mocked(buscarFornecedoresDoEnvio).mockResolvedValue({ data: [] });
    render(<LigarRespostasAFornecedor itens={[{ ...ITEM, dominio: "gmail.com", dominioGenerico: true }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar a fornecedor" }));
    expect(await screen.findByText(/domínio do remetente é genérico/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar fornecedor deste envio"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(buscarFornecedoresDoEnvio).toHaveBeenLastCalledWith({ gmailMensagemId: "m1", termo: "acme" }));
  });
});
