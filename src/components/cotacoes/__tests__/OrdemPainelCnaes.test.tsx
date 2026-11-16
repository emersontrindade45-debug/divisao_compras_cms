/**
 * Posição do painel de CNAEs na página.
 *
 * Existe por um defeito real (2026-08-22): o painel foi inserido DEPOIS do card "Seleção de
 * Fornecedores" (tabela longa, removida em 2026-11-16), então ficava fora da primeira tela e o usuário relatou
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
function renderComProcesso() {
  const { container } = render(
    <SelecaoFornecedoresForm processos={PROCESSOS} />,
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
    render(<SelecaoFornecedoresForm processos={PROCESSOS} />);

    expect(screen.queryByText("Atividades (CNAE) a buscar")).not.toBeInTheDocument();
  });

  it("não mostra mais a lista do cadastro próprio de fornecedores (removida em 2026-11-16)", () => {
    renderComProcesso();

    expect(screen.queryByText("Seleção de Fornecedores")).not.toBeInTheDocument();
    expect(screen.queryByText("Registrar cotações")).not.toBeInTheDocument();
  });

  it("vem DEPOIS do card de processo — a ordem espelha a do trabalho", () => {
    renderComProcesso();

    const processo = screen.getByText("Processo", { selector: '[data-slot="card-title"]' });
    const painel = screen.getByText("Atividades (CNAE) a buscar");

    const posicao = processo.compareDocumentPosition(painel);
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
