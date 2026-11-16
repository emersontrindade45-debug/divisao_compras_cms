import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndicadoresDesempenho } from "../IndicadoresDesempenho";
import { RespostaPorCategoria } from "../RespostaPorCategoria";
import type { CamadaDesempenho } from "@/lib/indicadores/desempenho";
import type { Indicador } from "@/lib/domain/indicadores/desempenho";

const vazio: Indicador = { valor: null, base: 0, excluidos: 0 };
const par = (atual: Indicador = vazio, anterior: Indicador = vazio) => ({ atual, anterior });

function dados(over: Partial<CamadaDesempenho> = {}): CamadaDesempenho {
  return {
    tempoPrimeiraReferencia: par(),
    tempoSerieMinima: par(),
    fontePublica: par(),
    taxaResposta: par(),
    propostasInvalidas: par(),
    fontesAteSuficiencia: par(),
    porCategoria: [],
    dadosTempoDesde: null,
    ...over,
  };
}

describe("IndicadoresDesempenho", () => {
  it("sem base mostra travessão, nunca zero", () => {
    render(<IndicadoresDesempenho dados={dados()} />);
    expect(screen.getAllByText("—")).toHaveLength(6);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("mostra valor, cobertura com excluídos e a comparação com o período anterior", () => {
    render(
      <IndicadoresDesempenho
        dados={dados({
          tempoPrimeiraReferencia: par(
            { valor: 4, base: 18, excluidos: 7 },
            { valor: 6, base: 10, excluidos: 0 },
          ),
        })}
      />,
    );
    expect(screen.getByText("4 dias")).toBeInTheDocument();
    expect(screen.getByText(/sobre 18 processos · 7 sem data confiável/)).toBeInTheDocument();
    expect(screen.getByText(/▼ 2d vs\. anterior/)).toBeInTheDocument();
  });
});

describe("RespostaPorCategoria", () => {
  it("escreve taxa e contagem em texto ao lado de cada barra", () => {
    render(
      <RespostaPorCategoria
        categorias={[{ categoria: "Informática", enviadas: 3, respondidas: 2, taxa: 67 }]}
      />,
    );
    expect(screen.getByText("Informática")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("dobra o excedente de 8 categorias numa linha de texto", () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({
      categoria: `Cat ${i}`,
      enviadas: 10 - i,
      respondidas: 1,
      taxa: 10,
    }));
    render(<RespostaPorCategoria categorias={cats} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText(/e mais 2 categorias/)).toBeInTheDocument();
  });

  it("período sem cotação diz isso", () => {
    render(<RespostaPorCategoria categorias={[]} />);
    expect(screen.getByText(/nenhuma cotação enviada/i)).toBeInTheDocument();
  });
});
