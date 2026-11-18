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
    motivo: "provavel_duvida",
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

/** O botão sugerido usa a variante "default" (fundo da cor primária); os demais, "outline". */
const destacado = (nome: RegExp) => screen.getByRole("button", { name: nome }).className.includes("bg-primary");

describe("RespostasAConfirmar — sugestões de orçamento e dúvida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolverMock.mockResolvedValue({ data: { consultaJaClassificada: false } });
  });

  it("'É dúvida' grava o desfecho 'duvida' para essa resposta", async () => {
    render(<RespostasAConfirmar itens={[item({})]} />);
    fireEvent.click(screen.getByRole("button", { name: "É dúvida" }));
    await waitFor(() =>
      expect(resolverMock).toHaveBeenCalledWith({
        id: "ckqut11d0000abcdefghijk01",
        desfecho: "duvida",
        emailConsulta: undefined,
      }),
    );
  });

  it.each([
    ["provavel_orcamento", /É orçamento/, [/É recusa/, /É dúvida/]],
    ["provavel_recusa", /É recusa/, [/É orçamento/, /É dúvida/]],
    ["provavel_duvida", /É dúvida/, [/É orçamento/, /É recusa/]],
  ] as const)("motivo %s destaca só o botão sugerido", (motivo, sugerido, outros) => {
    render(<RespostasAConfirmar itens={[item({ motivo })]} />);
    expect(destacado(sugerido)).toBe(true);
    outros.forEach((o) => expect(destacado(o)).toBe(false));
  });

  it("motivo sem sugestão não destaca nenhum botão", () => {
    render(<RespostasAConfirmar itens={[item({ motivo: "sinais_ambiguos" })]} />);
    [/É orçamento/, /É recusa/, /É dúvida/].forEach((b) => expect(destacado(b)).toBe(false));
  });

  it("dúvida e orçamento NÃO têm confirmação em lote (só a recusa provável tem)", () => {
    render(
      <RespostasAConfirmar
        itens={[item({ motivo: "provavel_duvida" }), item({ id: "ckqut11d0000abcdefghijk02", motivo: "provavel_orcamento" })]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Confirmar \d+ como/ })).not.toBeInTheDocument();
  });

  it("sem fornecedor ligado, 'É dúvida' exige o e-mail como os outros botões", () => {
    render(<RespostasAConfirmar itens={[item({ sugestao: null })]} />);
    expect(screen.getByRole("button", { name: "É dúvida" })).toBeDisabled();
  });

  it("mostra o rótulo do motivo para o analista", () => {
    render(<RespostasAConfirmar itens={[item({})]} />);
    expect(screen.getByText(/Possível dúvida/)).toBeInTheDocument();
  });

  describe("sugestão da IA", () => {
    it("mostra o veredito e a justificativa da IA", () => {
      render(<RespostasAConfirmar itens={[item({ sugestaoIa: "recusa", justificativaIa: "diz que não atende esse item" })]} />);
      expect(screen.getByText("IA sugere: recusa")).toBeInTheDocument();
      expect(screen.getByText("diz que não atende esse item")).toBeInTheDocument();
    });

    it("o veredito da IA manda no destaque: vale mais que o motivo da regra", () => {
      render(<RespostasAConfirmar itens={[item({ motivo: "provavel_orcamento", sugestaoIa: "recusa", justificativaIa: "x" })]} />);
      expect(destacado(/É recusa/)).toBe(true);
      expect(destacado(/É orçamento/)).toBe(false);
    });

    it("sem veredito da IA, nada de selo e o destaque segue o motivo", () => {
      render(<RespostasAConfirmar itens={[item({ motivo: "provavel_duvida" })]} />);
      expect(screen.queryByText(/IA sugere/)).toBeNull();
      expect(destacado(/É dúvida/)).toBe(true);
    });

    it("a IA ainda só sugere: nada é gravado até o analista clicar", () => {
      render(<RespostasAConfirmar itens={[item({ sugestaoIa: "orcamento", justificativaIa: "x" })]} />);
      expect(resolverMock).not.toHaveBeenCalled();
    });
  });
});
