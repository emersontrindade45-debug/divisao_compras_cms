import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Confirma que a lista de candidatos de similaridade exibe competência, regime
// de desoneração e localidade de referência (capital, não o estado) quando o
// candidato é do SINAPI (`tipoCandidato: "preco_referencia"`) — sem isso, dois
// preços legítimos do mesmo código (desonerado x não-desonerado) se misturam
// na tela sem distinção visível (CLAUDE.md §5 e docs/ApiPlan.md M17).

const mocks = vi.hoisted(() => ({
  obterFontesSimilaridade: vi.fn(),
}));

vi.mock("@/lib/actions/listar", () => ({
  obterFontesSimilaridade: mocks.obterFontesSimilaridade,
}));
// Children client components (SeletorNaturezaItem, PromoverFonteButton,
// DescartarResultadoButton) usam useRouter — sem provider de App Router no
// RTL, precisa mockar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { FontesSimilaridadeList } from "../FontesSimilaridadeList";

const ITEM_BASE = {
  id: "item-1",
  descricao: "Assentamento de tubo de ferro fundido",
  unidade: "M",
  quantidade: 10,
  natureza: null,
};

describe("FontesSimilaridadeList", () => {
  it("exibe competência, regime e localidade para candidato SINAPI (preco_referencia)", async () => {
    mocks.obterFontesSimilaridade.mockResolvedValue([
      {
        ...ITEM_BASE,
        resultadosSimilaridade: [
          {
            id: "res-1",
            tipoCandidato: "preco_referencia",
            fonteDescricao: "Composição SINAPI 97141",
            fonteOrgaoOuId: "SINAPI (Caixa Econômica Federal)",
            fonteUrl: "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
            valorUnitario: 5.4,
            dataReferencia: new Date("2024-12-01"),
            scoreFinal: 90,
            justificativa: "match direto",
            promovidoParaFonte: false,
            competenciaReferencia: "2024-12",
            regimeReferencia: "nao_desonerado",
            localidadeReferencia: "SAO PAULO",
          },
        ],
      },
    ]);

    const jsx = await FontesSimilaridadeList({ processoId: "proc-1" });
    render(jsx);

    expect(screen.getByText("12/2024")).toBeInTheDocument();
    expect(screen.getByText("Não desonerado")).toBeInTheDocument();
    expect(screen.getByText("SAO PAULO (capital)")).toBeInTheDocument();
  });

  it("não exibe bloco de referência para candidato de contratação pública (sem regime SINAPI)", async () => {
    mocks.obterFontesSimilaridade.mockResolvedValue([
      {
        ...ITEM_BASE,
        resultadosSimilaridade: [
          {
            id: "res-2",
            tipoCandidato: "contratacao_publica",
            fonteDescricao: "Contrato X",
            fonteOrgaoOuId: "Órgão Y",
            fonteUrl: "https://pncp.gov.br/x",
            valorUnitario: 10,
            dataReferencia: new Date("2024-06-01"),
            scoreFinal: 85,
            justificativa: "match direto",
            promovidoParaFonte: false,
            competenciaReferencia: null,
            regimeReferencia: null,
            localidadeReferencia: null,
          },
        ],
      },
    ]);

    const jsx = await FontesSimilaridadeList({ processoId: "proc-1" });
    render(jsx);

    expect(screen.queryByText("Não desonerado")).not.toBeInTheDocument();
    expect(screen.queryByText("Desonerado")).not.toBeInTheDocument();
  });

  // M20: o valor corrigido pelo analista é o que vale como preço do candidato.
  // Exibir o número cru da fonte aqui esconderia justamente a correção que
  // impede a série de preços de ser inflada.
  it("exibe o valor ajustado com o valor publicado pela fonte riscado ao lado", async () => {
    mocks.obterFontesSimilaridade.mockResolvedValue([
      {
        ...ITEM_BASE,
        resultadosSimilaridade: [
          {
            id: "res-3",
            tipoCandidato: "contratacao_publica",
            fonteDescricao: "Lavagem de fachada envidraçada",
            fonteOrgaoOuId: "MPPR",
            fonteUrl: "https://pncp.gov.br/y",
            valorUnitario: 15000,
            dataReferencia: new Date("2026-06-23"),
            scoreFinal: 77,
            justificativa: "objeto próximo",
            promovidoParaFonte: false,
            competenciaReferencia: null,
            regimeReferencia: null,
            localidadeReferencia: null,
            ajusteValorBase: 15000,
            ajusteOperacao: "divisao",
            ajusteQuantidade: 150,
            ajusteUnidadeMedida: "m²",
            ajusteQuantidadeTR: 940,
            ajustePeriodicidade: "meses_12",
            ajusteBaseSerie: "unitario",
            valorUnitarioAjustado: 100,
            valorConsiderado: 100,
          },
        ],
      },
    ]);

    const jsx = await FontesSimilaridadeList({ processoId: "proc-1" });
    render(jsx);

    expect(screen.getByText(/R\$\s*100,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*15\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("/ m²")).toBeInTheDocument();
    expect(screen.getByText("12 meses")).toBeInTheDocument();
  });

  it("exibe o valor da fonte quando não há ajuste", async () => {
    mocks.obterFontesSimilaridade.mockResolvedValue([
      {
        ...ITEM_BASE,
        resultadosSimilaridade: [
          {
            id: "res-4",
            tipoCandidato: "contratacao_publica",
            fonteDescricao: "Contrato sem ajuste",
            fonteOrgaoOuId: "Órgão Z",
            fonteUrl: null,
            valorUnitario: 997.5,
            dataReferencia: new Date("2025-07-30"),
            scoreFinal: 70,
            justificativa: "ok",
            promovidoParaFonte: true,
            competenciaReferencia: null,
            regimeReferencia: null,
            localidadeReferencia: null,
            ajusteValorBase: null,
            ajusteOperacao: null,
            ajusteQuantidade: null,
            ajusteUnidadeMedida: null,
            ajusteQuantidadeTR: null,
            ajustePeriodicidade: null,
            ajusteBaseSerie: null,
            valorUnitarioAjustado: null,
            valorConsiderado: null,
          },
        ],
      },
    ]);

    const jsx = await FontesSimilaridadeList({ processoId: "proc-1" });
    render(jsx);

    expect(screen.getByText(/R\$\s*997,50/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ajustar valor de Órgão Z/ })).toBeInTheDocument();
  });
});
