/**
 * Testa a seleção em massa (Shift/Ctrl) pela UI real, não só pela função de domínio: é aqui que
 * `evento.shiftKey`/`ctrlKey` são de fato lidos, e um erro de fiação (ler a tecla errada, não
 * passar a ordem visível) passaria despercebido num teste só da lógica pura.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sugerirCandidatos: vi.fn(),
  adicionarNaPlanilha: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/cotacoes", () => ({ criarCotacao: vi.fn() }));
vi.mock("@/lib/actions/fornecedores", () => ({ sugerirFornecedoresPorObjeto: vi.fn() }));
vi.mock("@/lib/actions/sugerirCandidatosCotacao", () => ({
  sugerirCandidatosParaObjeto: mocks.sugerirCandidatos,
}));
vi.mock("@/lib/actions/candidatosCnpj", () => ({
  adicionarCandidatoAPlanilha: mocks.adicionarNaPlanilha,
}));
// A busca agora passa pelo PainelCnaes (aprovação dos CNAEs). Estes testes são sobre a SELEÇÃO
// das empresas, então o painel é substituído por um botão que dispara a aprovação direto.
vi.mock("../PainelCnaes", () => ({
  PainelCnaes: ({ onAprovar }: { onAprovar: (c: string[]) => void }) => (
    <button type="button" onClick={() => onAprovar(["8121400"])}>
      Buscar empresas na base
    </button>
  ),
}));

import { SelecaoFornecedoresForm } from "../SelecaoFornecedoresForm";

const PROCESSOS = [{ id: "p1", numero: "0908/2022", objeto: "Limpeza predial" }];

function candidato(id: string, razaoSocial: string) {
  return {
    id,
    cnpj: `00.000.00${id}/0001-00`,
    razaoSocial,
    email: `${id}@x.com`,
    municipio: "Santos",
    estado: "SP",
    cnaePrincipalCodigo: "8121400",
    cnaePrincipalDescricao: "Limpeza em prédios",
    emailCompartilhado: false,
  };
}

const CANDIDATOS = [
  candidato("1", "Alfa"),
  candidato("2", "Bravo"),
  candidato("3", "Charlie"),
  candidato("4", "Delta"),
  candidato("5", "Echo"),
];

/** Marca o processo e roda a busca, deixando a tabela de candidatos na tela. */
async function renderComCandidatos() {
  mocks.sugerirCandidatos.mockResolvedValue({
    cnaesSugeridos: ["8121400"],
    candidatos: CANDIDATOS,
    totalEncontrado: CANDIDATOS.length,
  });

  render(<SelecaoFornecedoresForm fornecedores={[]} processos={PROCESSOS} />);

  fireEvent.change(screen.getByRole("combobox", { name: "" }) ?? screen.getAllByRole("combobox")[0], {
    target: { value: "p1" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Buscar empresas na base/i }));

  await waitFor(() => expect(screen.getByText("Alfa")).toBeInTheDocument());
}

function linhaDe(nome: string): HTMLElement {
  return screen.getByText(nome).closest("tr") as HTMLElement;
}

function checkboxDe(nome: string): HTMLInputElement {
  return screen.getByLabelText(`Selecionar ${nome}`) as HTMLInputElement;
}

function marcados(): string[] {
  return CANDIDATOS.filter((c) => checkboxDe(c.razaoSocial).checked).map((c) => c.razaoSocial);
}

describe("seleção em massa de candidatos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Shift+clique seleciona o intervalo entre as duas linhas", async () => {
    await renderComCandidatos();

    fireEvent.click(linhaDe("Bravo"));
    fireEvent.click(linhaDe("Delta"), { shiftKey: true });

    expect(marcados()).toEqual(["Bravo", "Charlie", "Delta"]);
  });

  it("Ctrl+clique marca linhas avulsas sem perder as anteriores", async () => {
    await renderComCandidatos();

    fireEvent.click(linhaDe("Alfa"));
    fireEvent.click(linhaDe("Charlie"), { ctrlKey: true });
    fireEvent.click(linhaDe("Echo"), { ctrlKey: true });

    expect(marcados()).toEqual(["Alfa", "Charlie", "Echo"]);
  });

  it("Cmd+clique funciona como Ctrl (macOS)", async () => {
    await renderComCandidatos();

    fireEvent.click(linhaDe("Alfa"));
    fireEvent.click(linhaDe("Echo"), { metaKey: true });

    expect(marcados()).toEqual(["Alfa", "Echo"]);
  });

  it("clique simples limpa a seleção anterior", async () => {
    await renderComCandidatos();

    fireEvent.click(linhaDe("Alfa"));
    fireEvent.click(linhaDe("Bravo"), { ctrlKey: true });
    fireEvent.click(linhaDe("Delta"));

    expect(marcados()).toEqual(["Delta"]);
  });

  it("'selecionar todas' marca e desmarca a lista inteira", async () => {
    await renderComCandidatos();
    const todas = screen.getByLabelText("Selecionar todas as empresas da lista");

    fireEvent.click(todas);
    expect(marcados()).toHaveLength(CANDIDATOS.length);

    fireEvent.click(todas);
    expect(marcados()).toEqual([]);
  });

  it("só envia à planilha as empresas selecionadas", async () => {
    await renderComCandidatos();
    mocks.adicionarNaPlanilha.mockResolvedValue({ data: { jaExistente: false, linhaId: "1" } });

    fireEvent.click(linhaDe("Bravo"));
    fireEvent.click(linhaDe("Charlie"), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à planilha/i }));

    await waitFor(() => expect(mocks.adicionarNaPlanilha).toHaveBeenCalledTimes(2));
    expect(mocks.adicionarNaPlanilha.mock.calls.map((c) => c[0])).toEqual(["2", "3"]);
  });
});
