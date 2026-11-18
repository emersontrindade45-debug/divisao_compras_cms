import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RespostasAConfirmar, type RespostaPendenteItem } from "../RespostasAConfirmar";
import { resolverRespostaEmail } from "@/lib/actions/resolverRespostaEmail";

vi.mock("@/lib/actions/resolverRespostaEmail", () => ({
  resolverRespostaEmail: vi.fn(async () => ({ data: { consultaJaClassificada: false } })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const resolverMock = vi.mocked(resolverRespostaEmail);

function item(over: Partial<RespostaPendenteItem>): RespostaPendenteItem {
  return {
    id: "ckqut11d0000abcdefghijk01",
    dataResposta: "2026-11-10T12:00:00.000Z",
    motivo: "provavel_recusa",
    remetenteDominio: "acme.com.br",
    temAnexoOrcamento: false,
    contemRecusa: false,
    contemValor: false,
    processoNumero: "0382/2026",
    numeroNoAssunto: "382",
    sugestao: { email: "vendas@acme.com.br", razaoSocial: "ACME" },
    sugestaoIa: null,
    justificativaIa: null,
    linkGmail: "https://mail.google.com/x",
    ...over,
  };
}

describe("RespostasAConfirmar — recusa provável em lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolverMock.mockResolvedValue({ data: { consultaJaClassificada: false } });
  });

  it("não mostra o lote quando não há recusa provável", () => {
    render(<RespostasAConfirmar itens={[item({ motivo: "sinais_ambiguos" })]} />);
    expect(screen.queryByLabelText("Respostas que parecem recusa")).not.toBeInTheDocument();
  });

  it("o primeiro clique só pede confirmação: nada é gravado antes do segundo passo", () => {
    render(<RespostasAConfirmar itens={[item({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar 1 como recusa/ }));
    expect(resolverMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Sim, confirmar 1 como recusa/ })).toBeInTheDocument();
  });

  it("cancelar volta atrás sem gravar", () => {
    render(<RespostasAConfirmar itens={[item({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar 1 como recusa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(resolverMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Confirmar 1 como recusa/ })).toBeInTheDocument();
  });

  it("confirma cada resposta pela resolução individual, como recusa, só as que têm fornecedor ligado", async () => {
    const itens = [
      item({ id: "ckqut11d0000abcdefghijk01" }),
      item({ id: "ckqut11d0000abcdefghijk02" }),
      // Sem fornecedor ligado, "é recusa" pede o e-mail à mão: fora do lote.
      item({ id: "ckqut11d0000abcdefghijk03", sugestao: null }),
      // Outro motivo: fora do lote.
      item({ id: "ckqut11d0000abcdefghijk04", motivo: "sinais_ambiguos" }),
    ];
    render(<RespostasAConfirmar itens={itens} />);

    fireEvent.click(screen.getByRole("button", { name: /Confirmar 2 como recusa/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sim, confirmar 2 como recusa/ }));

    await waitFor(() => expect(resolverMock).toHaveBeenCalledTimes(2));
    const chamados = resolverMock.mock.calls.map((c) => c[0]);
    expect(chamados).toEqual(
      expect.arrayContaining([
        { id: "ckqut11d0000abcdefghijk01", desfecho: "recusa" },
        { id: "ckqut11d0000abcdefghijk02", desfecho: "recusa" },
      ]),
    );
  });

  it("uma falha não impede as demais", async () => {
    resolverMock.mockResolvedValueOnce({ error: "Esta resposta já foi resolvida." });
    render(
      <RespostasAConfirmar
        itens={[item({ id: "ckqut11d0000abcdefghijk01" }), item({ id: "ckqut11d0000abcdefghijk02" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirmar 2 como recusa/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sim, confirmar 2 como recusa/ }));
    await waitFor(() => expect(resolverMock).toHaveBeenCalledTimes(2));
  });
});
