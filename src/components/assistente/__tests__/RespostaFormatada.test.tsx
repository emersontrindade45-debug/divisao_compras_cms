import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RespostaFormatada } from "../RespostaFormatada";

// O parser tem testes próprios; aqui o que se prova é a outra metade: que a
// árvore vira elemento de verdade no DOM, e não texto com asterisco — que era o
// defeito relatado.

describe("RespostaFormatada", () => {
  it("renderiza negrito como <strong>, sem deixar asterisco na tela", () => {
    const { container } = render(
      <RespostaFormatada conteudo="continuar no **processo atual aberto** e seguir" />,
    );

    expect(container.querySelector("strong")?.textContent).toBe("processo atual aberto");
    expect(container.textContent).toBe("continuar no processo atual aberto e seguir");
    expect(container.textContent).not.toContain("*");
  });

  it("renderiza lista com marcador como <ul> e numerada como <ol>", () => {
    const { container } = render(
      <RespostaFormatada conteudo={"- um\n- dois\n\n1. primeiro\n2. segundo"} />,
    );

    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("renderiza link http com noopener e noreferrer", () => {
    render(<RespostaFormatada conteudo="veja [o edital](https://pncp.gov.br/app/editais/1/2/3)" />);

    const link = screen.getByRole("link", { name: "o edital" });
    expect(link).toHaveAttribute("href", "https://pncp.gov.br/app/editais/1/2/3");
    expect(link).toHaveAttribute("target", "_blank");
    // O destino é escolhido pelo modelo: não pode receber referência à janela.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  // Fecha o buraco que um teste só de presença deixaria: aqui o que importa é
  // que NADA vire link quando o esquema não é navegável.
  it("não cria elemento de link para esquema não navegável", () => {
    const { container } = render(
      <RespostaFormatada conteudo="clique [aqui](javascript:alert(1))" />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toBe("clique [aqui](javascript:alert(1))");
  });

  it("nunca injeta marcação vinda do texto do modelo", () => {
    const { container } = render(
      <RespostaFormatada conteudo="atenção: <img src=x onerror=alert(1)> e <b>isto</b>" />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("b")).toHaveLength(0);
    // O texto aparece como texto, que é o comportamento correto.
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("não renderiza nada para conteúdo vazio", () => {
    const { container } = render(<RespostaFormatada conteudo="" />);
    expect(container.textContent).toBe("");
  });
});
