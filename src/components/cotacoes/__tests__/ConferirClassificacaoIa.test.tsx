import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ConferirClassificacaoIa } from "../ConferirClassificacaoIa";
import { conferirClassificacaoIa } from "@/lib/actions/conferirClassificacaoIa";
import { resumirConferencias } from "@/lib/domain/cotacaoEmail/conferenciaIa";
import type { PainelConferencia } from "@/lib/emailCotacao/conferenciaIa";

vi.mock("@/lib/actions/conferirClassificacaoIa", () => ({
  conferirClassificacaoIa: vi.fn(async () => ({ data: { certa: true, classeIa: "recusa" } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ITEM = {
  gmailMensagemId: "m1",
  classeIa: "recusa" as const,
  confianca: "alta",
  justificativa: "Diz que não atende a região.",
  aplicada: true,
  desfeita: false,
  processoNumero: "12141/2025",
  linkGmail: "https://mail.google.com/mail/?authuser=x#all/m1",
};

function painel(extra: Partial<Extract<PainelConferencia, { estado: "ok" }>> = {}): PainelConferencia {
  return { estado: "ok", itens: [ITEM], restantes: 0, conferidasTotal: 0, resumo: resumirConferencias([]), ...extra };
}

describe("ConferirClassificacaoIa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tabela indisponível NÃO parece 'nada a conferir'", () => {
    render(<ConferirClassificacaoIa painel={{ estado: "indisponivel" }} escopo="aplicadas" />);
    expect(screen.getByText(/ainda não está disponível/)).toBeTruthy();
    expect(screen.queryByText(/Nenhuma classificação/)).toBeNull();
  });

  it("mostra processo, classe da IA, justificativa e o link do Gmail", () => {
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" />);
    expect(screen.getByText("12141/2025")).toBeTruthy();
    expect(screen.getByText("IA: recusa")).toBeTruthy();
    expect(screen.getByText("Diz que não atende a região.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir no Gmail/ }).getAttribute("href")).toBe(ITEM.linkGmail);
  });

  it("sem conferência não mostra 0%: diz 'sem conferência'", () => {
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" />);
    expect(screen.getAllByText("sem conferência").length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("'Certa' grava a MESMA classe que a IA deu e atualiza a tela", async () => {
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" />);
    fireEvent.click(screen.getByRole("button", { name: /Certa/ }));
    await waitFor(() =>
      expect(conferirClassificacaoIa).toHaveBeenCalledWith({ gmailMensagemId: "m1", classeCorreta: "recusa" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Conferido: a IA acertou.");
  });

  it("os botões de correção oferecem só as OUTRAS três classes e gravam a escolhida", async () => {
    vi.mocked(conferirClassificacaoIa).mockResolvedValueOnce({ data: { certa: false, classeIa: "recusa" } });
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" />);
    expect(screen.queryByRole("button", { name: "recusa" })).toBeNull();
    for (const nome of ["orçamento", "dúvida", "não é resposta"]) {
      expect(screen.getByRole("button", { name: nome })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "dúvida" }));
    await waitFor(() =>
      expect(conferirClassificacaoIa).toHaveBeenCalledWith({ gmailMensagemId: "m1", classeCorreta: "duvida" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Conferido: a IA errou (era dúvida).");
  });

  it("erro da ação aparece e NÃO atualiza a tela como se tivesse gravado", async () => {
    vi.mocked(conferirClassificacaoIa).mockResolvedValueOnce({ error: "Não foi possível gravar a conferência agora." });
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" />);
    fireEvent.click(screen.getByRole("button", { name: /Certa/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível gravar a conferência agora."));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("taxa por classe, aplicadas e erros mais comuns saem do resumo", () => {
    const resumo = resumirConferencias([
      { classeIa: "recusa", classeCorreta: "recusa", confianca: "alta", aplicada: true },
      { classeIa: "recusa", classeCorreta: "duvida", confianca: "alta", aplicada: true },
    ]);
    render(<ConferirClassificacaoIa painel={painel({ itens: [], conferidasTotal: 2, resumo })} escopo="aplicadas" />);
    expect(screen.getAllByText("50%").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/Tudo o que há neste filtro já foi conferido/)).toBeTruthy();
    expect(screen.getByText(/IA disse/)).toBeTruthy();
  });

  it("os filtros apontam para a aba 'conferir' com escopo e classe na URL", () => {
    render(<ConferirClassificacaoIa painel={painel()} escopo="aplicadas" classe="recusa" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/cotacoes?aba=conferir&escopo=sugeridas&classe=recusa");
    expect(hrefs).toContain("/cotacoes?aba=conferir&escopo=aplicadas");
    expect(hrefs).toContain("/cotacoes?aba=conferir&escopo=aplicadas&classe=orcamento");
  });

  it("avisa quantas faltam além da página", () => {
    render(<ConferirClassificacaoIa painel={painel({ restantes: 37, conferidasTotal: 5 })} escopo="aplicadas" />);
    expect(screen.getByText(/Mais 37 neste filtro/)).toBeTruthy();
  });
});
