import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessoTabs } from "../ProcessoTabs";
import { PROCESSOS } from "@/lib/fixtures/processos";
import { avaliarConformidade } from "@/lib/domain/conformidade";

const searchParams = { valor: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.valor,
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  searchParams.valor = new URLSearchParams();
});

const conformidadeVazia = avaliarConformidade({
  temItens: true,
  fontes: [],
  capturas: 0,
  resultadosSimilaridade: 0,
  cotacoes: [],
});

const conformidadeSemItens = avaliarConformidade({
  temItens: false,
  fontes: [],
  capturas: 0,
  resultadosSimilaridade: 0,
  cotacoes: [],
});

describe("ProcessoTabs", () => {
  it("renderiza as quatro etapas do fluxo como abas", () => {
    render(
      <ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />,
    );
    expect(screen.getByRole("tab", { name: /estratégia/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /pesquisa de preços/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /validação/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /consolidação/i })).toBeInTheDocument();
  });

  it("numera as etapas e expõe o estado no rótulo acessível", () => {
    render(
      <ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />,
    );
    expect(
      screen.getByRole("tab", { name: /etapa 2:.*pesquisa de preços.*pendente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /etapa 3:.*validação.*não se aplica/i }),
    ).toBeInTheDocument();
  });

  it("com itens cadastrados, abre direto na etapa de pesquisa", () => {
    render(
      <ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />,
    );
    expect(screen.getByRole("tab", { name: /pesquisa de preços/i })).toHaveAttribute(
      "data-active",
    );
  });

  it("sem itens, abre na estratégia e mostra a ordem de busca recomendada", () => {
    render(<ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeSemItens} />);
    expect(screen.getByRole("tab", { name: /estratégia/i })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByText(/ordem de busca recomendada/i)).toBeInTheDocument();
  });

  it("deep-link ?etapa= tem precedência sobre a etapa sugerida", () => {
    searchParams.valor = new URLSearchParams("etapa=consolidacao");
    render(<ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />);
    expect(screen.getByRole("tab", { name: /consolidação/i })).toHaveAttribute(
      "data-active",
    );
  });

  it("ignora valor inválido em ?etapa= e cai na etapa sugerida", () => {
    searchParams.valor = new URLSearchParams("etapa=inexistente");
    render(<ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />);
    expect(screen.getByRole("tab", { name: /pesquisa de preços/i })).toHaveAttribute(
      "data-active",
    );
  });

  it("clique manual troca a etapa ativa", async () => {
    render(<ProcessoTabs processo={PROCESSOS[0]!} conformidade={conformidadeVazia} />);

    fireEvent.click(screen.getByRole("tab", { name: /consolidação/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /consolidação/i })).toHaveAttribute(
        "data-active",
      );
    });
    expect(screen.getByRole("tab", { name: /pesquisa de preços/i })).not.toHaveAttribute(
      "data-active",
    );
  });
});
