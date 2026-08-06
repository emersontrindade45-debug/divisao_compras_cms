import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SugestoesCandidatos } from "../SugestoesCandidatos";
import { adicionarCandidatoSugerido } from "@/lib/actions/assistente";
import type { CandidatoSugerido } from "@/lib/assistente/sugestoes";

vi.mock("@/lib/actions/assistente", () => ({
  adicionarCandidatoSugerido: vi.fn(async () => ({ ok: true, mensagem: "Adicionado" })),
  descartarCandidatoAssistente: vi.fn(async () => ({ ok: true, mensagem: "Descartado" })),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const adicionarMock = vi.mocked(adicionarCandidatoSugerido);

const SUGESTAO: CandidatoSugerido = {
  id: "c1",
  tipoCandidato: "contratacao_publica",
  fonteDescricao: "Instalação / Manutenção - Brises Fachada",
  fonteOrgaoOuId: "COMANDO DO EXERCITO",
  fonteUrl: "https://pncp.gov.br/app/editais/00394452000103/2025/20569",
  valorUnitario: 7956.58,
  // Meio-dia UTC de propósito: a data é formatada no fuso de quem lê, e à
  // meia-noite UTC o Brasil (UTC-3) mostraria o dia anterior — o teste passaria
  // ou falharia conforme a máquina. Dado real do PNCP sempre traz hora.
  dataReferencia: "2025-11-06T12:00:00.000Z",
  unidade: "unidade",
  quantidade: 6,
  itemIdSugerido: "item-1",
  termoBuscaUsado: "brises fachada",
};

const ITENS = [
  { id: "item-1", descricao: "Lavagem da fachada" },
  { id: "item-2", descricao: "Limpeza das calhas" },
];

describe("SugestoesCandidatos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adicionarMock.mockResolvedValue({ ok: true, mensagem: "Adicionado" });
  });

  it("mostra o contrato com valor, data e link do PNCP para conferência", () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    expect(screen.getByText("COMANDO DO EXERCITO")).toBeInTheDocument();
    expect(screen.getByText(/7\.956,58/)).toBeInTheDocument();
    expect(screen.getByText("06/11/2025")).toBeInTheDocument();

    // O link é o ponto do fluxo: o servidor abre o edital antes de aprovar.
    const link = screen.getByRole("link", { name: /Abrir no PNCP/ });
    expect(link).toHaveAttribute("href", SUGESTAO.fonteUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("adiciona à lista pelo clique, mandando só identificadores", async () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/ }));

    await waitFor(() => expect(adicionarMock).toHaveBeenCalled());
    // Nem valor, nem órgão, nem data: o servidor relê tudo da mensagem gravada.
    // A janela de recência vem da natureza cadastrada do item (Item.natureza),
    // não de uma escolha feita neste cartão.
    expect(adicionarMock).toHaveBeenCalledWith({
      mensagemId: "msg-1",
      candidatoId: "c1",
      itemId: "item-1",
    });
  });

  // A tabela de candidatos é renderizada no servidor; sem o refresh o registro
  // entra no banco e a tela ao lado só muda depois de um F5.
  it("atualiza a tela do processo depois de adicionar", async () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/ }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(await screen.findByText("Na lista do processo")).toBeInTheDocument();
  });

  it("usa o item escolhido no seletor, e não o sugerido pelo modelo", async () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.change(screen.getByLabelText("Item que receberá o candidato"), {
      target: { value: "item-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/ }));

    await waitFor(() => expect(adicionarMock).toHaveBeenCalled());
    expect(adicionarMock.mock.calls[0]![0].itemId).toBe("item-2");
  });

  it("continua mostrando o cartão quando o servidor recusa", async () => {
    adicionarMock.mockResolvedValue({ ok: false, mensagem: "Já está na lista deste item." });
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/ }));

    await waitFor(() => expect(adicionarMock).toHaveBeenCalled());
    expect(screen.queryByText("Na lista do processo")).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  // Botão que não faz nada é pior que botão ausente (CLAUDE.md §9.40).
  it("desabilita com motivo enquanto o turno não foi gravado", () => {
    render(<SugestoesCandidatos mensagemId={null} sugestoes={[SUGESTAO]} itens={ITENS} />);

    const botao = screen.getByRole("button", { name: /Adicionar à lista/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", expect.stringMatching(/Aguarde/i));
  });

  it("desabilita com motivo quando não há item para receber o candidato", () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={[]} />);

    const botao = screen.getByRole("button", { name: /Adicionar à lista/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", expect.stringMatching(/processo/i));
  });

  it("não renderiza nada quando a busca não achou candidatos", () => {
    const { container } = render(
      <SugestoesCandidatos mensagemId="msg-1" sugestoes={[]} itens={ITENS} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("exibe botão de descartar em cada cartão não adicionado", () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    expect(screen.getByRole("button", { name: /Descartar candidato/i })).toBeInTheDocument();
  });

  it("esconde o cartão ao clicar em descartar", () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.click(screen.getByRole("button", { name: /Descartar candidato/i }));

    expect(screen.queryByText("COMANDO DO EXERCITO")).not.toBeInTheDocument();
    expect(screen.getByText(/Todos os candidatos foram descartados/)).toBeInTheDocument();
  });

  it("exibe 'Restaurar' após descartar e restaura ao clicar", () => {
    render(<SugestoesCandidatos mensagemId="msg-1" sugestoes={[SUGESTAO]} itens={ITENS} />);

    fireEvent.click(screen.getByRole("button", { name: /Descartar candidato/i }));

    const restaurar = screen.getByRole("button", { name: /Restaurar/i });
    expect(restaurar).toBeInTheDocument();

    fireEvent.click(restaurar);

    expect(screen.getByText("COMANDO DO EXERCITO")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restaurar/i })).not.toBeInTheDocument();
  });

  it("usa o primeiro item quando itemIdSugerido não existe nos itens atuais", async () => {
    const sugestaoStale: CandidatoSugerido = {
      ...SUGESTAO,
      id: "c2",
      itemIdSugerido: "item-deletado-antigo",
    };
    // ITENS não tem "item-deletado-antigo" — simula re-sincronização que recriou os itens
    render(
      <SugestoesCandidatos mensagemId="msg-1" sugestoes={[sugestaoStale]} itens={ITENS} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/ }));

    await waitFor(() => expect(adicionarMock).toHaveBeenCalled());
    // Deve usar o primeiro item válido ("item-1"), não o ID obsoleto
    expect(adicionarMock.mock.calls[0]![0].itemId).toBe("item-1");
  });
});
