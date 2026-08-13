import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConformidadePanel } from "../ConformidadePanel";
import { avaliarConformidade, type ConformidadeInput } from "@/lib/domain/conformidade";

const AGORA = new Date("2026-07-25T12:00:00Z");
const RECENTE = new Date("2026-07-01T12:00:00Z");

function conformidade(overrides: Partial<ConformidadeInput> = {}) {
  return avaliarConformidade({
    temItens: true,
    fontes: [],
    capturas: 0,
    resultadosSimilaridade: 0,
    cotacoes: [],
    dataReferencia: AGORA,
    ...overrides,
  });
}

/** Abre o popover — a lista de itens só existe no DOM depois do clique no gatilho. */
function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /conformidade/i }));
}

describe("ConformidadePanel", () => {
  it("renderiza uma linha por item de conformidade ao abrir", () => {
    const c = conformidade();
    render(<ConformidadePanel conformidade={c} processoId="p1" />);
    abrir();
    expect(screen.getAllByRole("link")).toHaveLength(c.itens.length);
  });

  it("cada linha aponta para a etapa em que a pendência se resolve", () => {
    render(<ConformidadePanel conformidade={conformidade()} processoId="p1" />);
    abrir();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        /^\/processos\/p1\?etapa=(estrategia|pesquisa|validacao|consolidacao)$/,
      );
    }
  });

  it("resume as pendências no gatilho e no popover", () => {
    const c = conformidade();
    render(<ConformidadePanel conformidade={c} processoId="p1" />);
    expect(screen.getByRole("button", { name: /conformidade/i })).toBeInTheDocument();
    abrir();
    expect(screen.getByText(/pendência/i)).toBeInTheDocument();
  });

  it("destaca quando há item impeditivo (fonte sem evidência)", () => {
    const c = conformidade({
      fontes: [
        {
          id: "f1",
          tipo: "contratacao_publica",
          status: "incluido",
          dataReferencia: RECENTE,
          totalEvidencias: 0,
        },
      ],
    });
    render(<ConformidadePanel conformidade={c} processoId="p1" />);
    abrir();
    expect(screen.getByText(/item impeditivo/i)).toBeInTheDocument();
  });

  it("informa quando não há pendência alguma", () => {
    const fonte = (id: string) =>
      ({
        id,
        tipo: "contratacao_publica" as const,
        status: "incluido" as const,
        dataReferencia: RECENTE,
        totalEvidencias: 1,
      });
    const c = conformidade({
      fontes: [fonte("f1"), fonte("f2"), fonte("f3")],
      serie: { precosIncluidos: 3, valorEstimado: 100, coeficienteVariacao: 8 },
    });
    render(<ConformidadePanel conformidade={c} processoId="p1" />);
    abrir();
    expect(screen.getByText(/nenhuma pendência/i)).toBeInTheDocument();
  });

  it("mostra o detalhe de cada item, não só o título", () => {
    const c = conformidade();
    render(<ConformidadePanel conformidade={c} processoId="p1" />);
    abrir();
    expect(screen.getByText(/registrar justificativa nos autos/i)).toBeInTheDocument();
    expect(screen.getByText(/nenhuma fonte registrada ainda/i)).toBeInTheDocument();
  });
});
