/**
 * Posição do painel de CNAEs na página.
 *
 * Existe por um defeito real (2026-08-22): o painel foi inserido DEPOIS do card "Seleção de
 * Fornecedores", que é uma tabela longa, então ficava fora da primeira tela e o usuário relatou
 * que ele "não apareceu". Os testes que havia verificavam que o painel existe e funciona — nenhum
 * verificava onde ele estava, e por isso todos passavam com o defeito no ar.
 *
 * O painel decide O QUE buscar, então precisa vir antes da lista de resultados: a ordem de leitura
 * da página tem de espelhar a ordem do trabalho (escolher processo → aprovar atividades → revisar
 * empresas).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/cotacoes", () => ({ criarCotacao: vi.fn() }));
vi.mock("@/lib/actions/fornecedores", () => ({ sugerirFornecedoresPorObjeto: vi.fn() }));
vi.mock("@/lib/actions/sugerirCandidatosCotacao", () => ({
  sugerirCandidatosParaObjeto: vi.fn(),
}));
vi.mock("@/lib/actions/candidatosCnpj", () => ({ adicionarCandidatoAPlanilha: vi.fn() }));
vi.mock("@/lib/actions/sugerirCnaesComContagem", () => ({
  sugerirCnaesComContagem: vi.fn(),
  buscarCnaeManual: vi.fn(),
}));

import { SelecaoFornecedoresForm } from "../SelecaoFornecedoresForm";

const PROCESSOS = [{ id: "p1", numero: "0908/2022", objeto: "Limpeza predial" }];
const FORNECEDORES = [
  {
    id: "f1",
    razaoSocial: "Fornecedor Cadastrado",
    email: "f@x.com",
    cidade: "Santos",
    estado: "SP",
    responsavelContato: "",
    categoria: ["limpeza"],
    score: 0,
    taxaResposta: 0,
  },
];

function renderComProcesso() {
  const { container } = render(
    <SelecaoFornecedoresForm fornecedores={FORNECEDORES} processos={PROCESSOS} />,
  );
  const select = container.querySelector("select") as HTMLSelectElement;
  select.value = "p1";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return container;
}

describe("posição do painel de CNAEs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aparece assim que um processo é selecionado", () => {
    renderComProcesso();

    expect(screen.getByText("Atividades (CNAE) a buscar")).toBeInTheDocument();
  });

  it("não aparece antes de escolher o processo (não há objeto para analisar)", () => {
    render(<SelecaoFornecedoresForm fornecedores={FORNECEDORES} processos={PROCESSOS} />);

    expect(screen.queryByText("Atividades (CNAE) a buscar")).not.toBeInTheDocument();
  });

  it("vem ANTES da tabela de fornecedores, não enterrado abaixo dela", () => {
    renderComProcesso();

    const painel = screen.getByText("Atividades (CNAE) a buscar");
    const tabela = screen.getByText("Seleção de Fornecedores");

    // DOCUMENT_POSITION_FOLLOWING: `tabela` vem depois de `painel` na ordem do documento.
    const posicao = painel.compareDocumentPosition(tabela);
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("vem DEPOIS do card de processo — a ordem espelha a do trabalho", () => {
    renderComProcesso();

    const processo = screen.getByText("Processo e prazo");
    const painel = screen.getByText("Atividades (CNAE) a buscar");

    const posicao = processo.compareDocumentPosition(painel);
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
