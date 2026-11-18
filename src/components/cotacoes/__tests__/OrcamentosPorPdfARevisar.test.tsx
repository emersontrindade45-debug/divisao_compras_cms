import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrcamentosPorPdfARevisar, type OrcamentoPdfRevisarItem } from "../OrcamentosPorPdfARevisar";
import { revisarOrcamentoPorPdf } from "@/lib/actions/revisarOrcamentoPdf";

vi.mock("@/lib/actions/revisarOrcamentoPdf", () => ({
  revisarOrcamentoPorPdf: vi.fn(async () => ({ data: { situacao: "recusa" } })),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const acao = vi.mocked(revisarOrcamentoPorPdf);
const item = (over: Partial<OrcamentoPdfRevisarItem> = {}): OrcamentoPdfRevisarItem => ({
  consultaId: "c1",
  classeIa: "recusa",
  justificativa: "Fornecedor declina participação.",
  processoNumero: "0382/2026",
  fornecedor: "ACME",
  linkGmail: "https://mail.google.com/x",
  ...over,
});

describe("OrcamentosPorPdfARevisar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista vazia explica que não há o que revisar", () => {
    render(<OrcamentosPorPdfARevisar itens={[]} />);
    expect(screen.getByText(/Nenhum orçamento por anexo/)).toBeTruthy();
  });

  it("'Marcar como …' e 'Manter orçamento' chamam a ação com a decisão certa", async () => {
    render(<OrcamentosPorPdfARevisar itens={[item({ consultaId: "c9", classeIa: "duvida" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como dúvida" }));
    await waitFor(() => expect(acao).toHaveBeenCalledWith({ consultaId: "c9", decisao: "rebaixar" }));
    fireEvent.click(screen.getByRole("button", { name: "Manter orçamento" }));
    await waitFor(() => expect(acao).toHaveBeenCalledWith({ consultaId: "c9", decisao: "manter" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("mostra o link do Gmail e nunca texto do e-mail", () => {
    render(<OrcamentosPorPdfARevisar itens={[item()]} />);
    expect(screen.getByRole("link", { name: /Abrir no Gmail/ }).getAttribute("href")).toBe("https://mail.google.com/x");
  });
});
