import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndicadoresDesempenho } from "../IndicadoresDesempenho";
import { RespostaPorProcesso } from "../RespostaPorProcesso";
import type { CamadaDesempenho } from "@/lib/indicadores/desempenho";
import type { Indicador } from "@/lib/domain/indicadores/desempenho";

const vazio: Indicador = { valor: null, base: 0, excluidos: 0 };
const par = (atual: Indicador = vazio, anterior: Indicador = vazio) => ({ atual, anterior });

function dados(over: Partial<CamadaDesempenho> = {}): CamadaDesempenho {
  return {
    tempoPrimeiraReferencia: par(),
    tempoSerieMinima: par(),
    fontePublica: par(),
    orcamentos: par(),
    recusas: par(),
    duvidas: par(),
    contagem: { consultadas: 0, orcamentos: 0, recusas: 0, duvidas: 0, aConfirmar: 0, invalidos: 0 },
    tempoResposta: par(),
    emailsInvalidos: par(),
    propostasInvalidas: par(),
    fontesAteSuficiencia: par(),
    porProcesso: [],
    dadosTempoDesde: null,
    ...over,
  };
}

describe("IndicadoresDesempenho", () => {
  it("sem base mostra travessão, nunca zero", () => {
    render(<IndicadoresDesempenho dados={dados()} />);
    expect(screen.getAllByText("—")).toHaveLength(10);
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("o cartão Dúvidas mostra o percentual e a contagem sobre as consultas (não mais travessão fixo)", () => {
    render(
      <IndicadoresDesempenho
        dados={dados({
          duvidas: par({ valor: 30, base: 10, excluidos: 0 }),
          contagem: { consultadas: 10, orcamentos: 2, recusas: 1, duvidas: 3, aConfirmar: 4, invalidos: 0 },
        })}
      />,
    );
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText(/3 de 10 consultas · pediram esclarecimento/)).toBeInTheDocument();
  });

  it("o cartão de orçamentos diz a unidade do 'a confirmar' (fornecedores, não mensagens)", () => {
    render(
      <IndicadoresDesempenho
        dados={dados({
          contagem: { consultadas: 10, orcamentos: 2, recusas: 1, duvidas: 3, aConfirmar: 4, invalidos: 0 },
        })}
      />,
    );
    expect(screen.getByText(/4 fornecedor\(es\) com resposta a confirmar/)).toBeInTheDocument();
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

describe("RespostaPorProcesso", () => {
  it("escreve taxa e contagem em texto ao lado de cada barra", () => {
    render(
      <RespostaPorProcesso
        processos={[{ chave: "p:1", processo: "0736/2025", enviadas: 3, respondidas: 2, taxa: 67 }]}
      />,
    );
    expect(screen.getByText("0736/2025")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("dobra o excedente de 12 processos numa linha de texto", () => {
    const procs = Array.from({ length: 14 }, (_, i) => ({
      chave: `p:${i}`,
      processo: `Proc ${i}`,
      enviadas: 20 - i,
      respondidas: 1,
      taxa: 5,
    }));
    render(<RespostaPorProcesso processos={procs} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText(/e mais 2 processos/)).toBeInTheDocument();
  });

  it("período sem cotação diz isso", () => {
    render(<RespostaPorProcesso processos={[]} />);
    expect(screen.getByText(/nenhuma cotação enviada/i)).toBeInTheDocument();
  });
});
