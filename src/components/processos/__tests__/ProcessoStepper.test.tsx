import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { ProcessoStepper } from "../ProcessoStepper";
import type { EstadoEtapa, EtapaFluxo } from "@/lib/domain/conformidade";

function etapas(estados: [EstadoEtapa, EstadoEtapa, EstadoEtapa, EstadoEtapa]): EtapaFluxo[] {
  return [
    { id: "estrategia", numero: 1, titulo: "Estratégia", estado: estados[0], resumo: "a" },
    { id: "pesquisa", numero: 2, titulo: "Pesquisa de preços", estado: estados[1], resumo: "b" },
    { id: "validacao", numero: 3, titulo: "Validação", estado: estados[2], resumo: "c" },
    { id: "consolidacao", numero: 4, titulo: "Consolidação", estado: estados[3], resumo: "d" },
  ];
}

function renderStepper(lista: EtapaFluxo[]) {
  return render(
    <Tabs value="estrategia">
      <ProcessoStepper etapas={lista} />
    </Tabs>,
  );
}

describe("ProcessoStepper", () => {
  it("renderiza uma aba por etapa, na ordem do fluxo", () => {
    renderStepper(etapas(["pendente", "pendente", "pendente", "pendente"]));
    const abas = screen.getAllByRole("tab");
    expect(abas).toHaveLength(4);
    expect(abas.map((a) => a.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Etapa 1"),
      expect.stringContaining("Etapa 2"),
      expect.stringContaining("Etapa 3"),
      expect.stringContaining("Etapa 4"),
    ]);
  });

  it("expõe o estado de cada etapa no rótulo acessível", () => {
    renderStepper(etapas(["concluida", "atencao", "nao_aplicavel", "em_andamento"]));
    expect(screen.getByRole("tab", { name: /etapa 1.*concluída/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /etapa 2.*requer atenção/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /etapa 3.*não se aplica/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /etapa 4.*em andamento/i }),
    ).toBeInTheDocument();
  });

  it("mostra o número da etapa quando ela ainda não foi concluída", () => {
    renderStepper(etapas(["pendente", "pendente", "pendente", "pendente"]));
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("substitui o número por ícone quando concluída ou em atenção", () => {
    renderStepper(etapas(["concluida", "atencao", "pendente", "pendente"]));
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("exibe o resumo de cada etapa", () => {
    const lista = etapas(["pendente", "pendente", "pendente", "pendente"]);
    lista[1]!.resumo = "2 de 3 fontes com evidência";
    renderStepper(lista);
    expect(screen.getByText("2 de 3 fontes com evidência")).toBeInTheDocument();
  });
});
