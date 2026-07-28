import { describe, it, expect } from "vitest";
import { analisarResposta, analisarTrechos, type Bloco } from "../formatacao";

/** Texto plano de um bloco, para asserir estrutura sem repetir a árvore inteira. */
function plano(bloco: Bloco): string {
  if (bloco.tipo === "paragrafo") return bloco.trechos.map((t) => t.texto).join("");
  return bloco.itens.map((item) => item.map((t) => t.texto).join("")).join(" | ");
}

describe("analisarTrechos", () => {
  it("separa negrito do texto ao redor", () => {
    expect(analisarTrechos("continuar no **processo atual** e seguir")).toEqual([
      { tipo: "texto", texto: "continuar no " },
      { tipo: "negrito", texto: "processo atual" },
      { tipo: "texto", texto: " e seguir" },
    ]);
  });

  it("reconhece código inline e itálico", () => {
    expect(analisarTrechos("veja `buscar_pncp` e *atenção*")).toEqual([
      { tipo: "texto", texto: "veja " },
      { tipo: "codigo", texto: "buscar_pncp" },
      { tipo: "texto", texto: " e " },
      { tipo: "italico", texto: "atenção" },
    ]);
  });

  // O par `**` é procurado antes do `*` sozinho. Sem essa ordem, o itálico
  // casaria primeiro e sobraria um asterisco solto na tela — exatamente o
  // defeito que este módulo existe para corrigir.
  it("prefere negrito a itálico quando os dois poderiam casar", () => {
    expect(analisarTrechos("**total**")).toEqual([{ tipo: "negrito", texto: "total" }]);
  });

  // O domínio é cheio de identificadores com underscore. Se `_itálico_` fosse
  // suportado, os dois valores abaixo virariam um itálico engolindo o meio da
  // frase. Por isso o underscore não é marcador — e este teste é o que impede
  // alguém de "melhorar" o parser acrescentando um.
  it("não trata underscore como marcador: enums do domínio ficam intactos", () => {
    const linha = "classifique como pendente_equalizacao ou utilizavel_integralmente";
    expect(analisarTrechos(linha)).toEqual([{ tipo: "texto", texto: linha }]);
  });

  // Conteúdo precisa começar e terminar em não-branco: depois do primeiro `*`
  // vem um espaço, então nada casa e a aritmética sobrevive.
  it("não transforma multiplicação em itálico", () => {
    const linha = "3 * 4 = 12 e 5 * 2 = 10";
    expect(analisarTrechos(linha)).toEqual([{ tipo: "texto", texto: linha }]);
  });

  it("preserva marcador sem par como texto literal", () => {
    const linha = "o valor **não fechou";
    expect(analisarTrechos(linha)).toEqual([{ tipo: "texto", texto: linha }]);
  });

  it("converte link http em link", () => {
    expect(analisarTrechos("veja [o edital](https://pncp.gov.br/app/editais/1/2/3)")).toEqual([
      { tipo: "texto", texto: "veja " },
      { tipo: "link", texto: "o edital", url: "https://pncp.gov.br/app/editais/1/2/3" },
    ]);
  });

  // O texto vem de um modelo que lê páginas da web. Um esquema executável não
  // pode virar link clicável dentro do painel autenticado — e some do texto
  // seria pior ainda, então volta literal.
  it("não cria link para esquema não navegável", () => {
    const linha = "clique [aqui](javascript:alert(1))";
    const trechos = analisarTrechos(linha);

    expect(trechos.some((t) => t.tipo === "link")).toBe(false);
    // Nada se perde: o texto renderizado reconstitui a linha original.
    expect(trechos.map((t) => t.texto).join("")).toBe(linha);
  });
});

describe("analisarResposta", () => {
  // Trecho real da resposta que expôs o defeito em produção.
  it("formata a resposta que mostrava asteriscos crus na tela", () => {
    const blocos = analisarResposta(
      [
        "Se você quiser, eu posso:",
        "- continuar assumindo que estamos no **processo atual aberto**; ou",
        "- você me manda os dados visíveis do processo, e eu interpreto.",
        "",
        "Se preferir, posso **descrever o que falta** no processo atual.",
      ].join("\n"),
    );

    expect(blocos.map((b) => b.tipo)).toEqual(["paragrafo", "lista", "paragrafo"]);

    const lista = blocos[1]!;
    expect(lista.tipo === "lista" && lista.ordenada).toBe(false);
    expect(plano(lista)).toBe(
      "continuar assumindo que estamos no processo atual aberto; ou | você me manda os dados visíveis do processo, e eu interpreto.",
    );

    // O que interessa: o asterisco sumiu e virou marcação.
    const negritos = blocos.flatMap((b) =>
      b.tipo === "paragrafo" ? b.trechos : b.itens.flat(),
    ).filter((t) => t.tipo === "negrito");
    expect(negritos.map((t) => t.texto)).toEqual([
      "processo atual aberto",
      "descrever o que falta",
    ]);
  });

  it("reconhece lista numerada", () => {
    const blocos = analisarResposta("1. primeiro\n2) segundo");
    expect(blocos).toHaveLength(1);
    expect(blocos[0]!.tipo === "lista" && blocos[0]!.ordenada).toBe(true);
    expect(plano(blocos[0]!)).toBe("primeiro | segundo");
  });

  it("separa lista com marcador de lista numerada", () => {
    const blocos = analisarResposta("- a\n1. b");
    expect(blocos).toHaveLength(2);
    expect(blocos.map((b) => b.tipo === "lista" && b.ordenada)).toEqual([false, true]);
  });

  it("junta linha indentada ao item anterior", () => {
    const blocos = analisarResposta("- descrição longa que\n  quebrou de linha\n- outro");
    expect(plano(blocos[0]!)).toBe("descrição longa que quebrou de linha | outro");
  });

  it("linha em branco separa parágrafos", () => {
    const blocos = analisarResposta("primeiro\n\nsegundo");
    expect(blocos.map(plano)).toEqual(["primeiro", "segundo"]);
  });

  it("preserva quebra de linha simples dentro do parágrafo", () => {
    const blocos = analisarResposta("linha um\nlinha dois");
    expect(blocos).toHaveLength(1);
    expect(plano(blocos[0]!)).toBe("linha um\nlinha dois");
  });

  // Degradar é melhor que quebrar: o que o parser não cobre continua legível.
  it("devolve construção não suportada como texto puro", () => {
    const tabela = "| órgão | valor |\n|-------|-------|";
    const blocos = analisarResposta(`## Resumo\n${tabela}`);
    expect(blocos.every((b) => b.tipo === "paragrafo")).toBe(true);
    expect(blocos.map(plano).join("\n")).toContain("## Resumo");
    expect(blocos.map(plano).join("\n")).toContain("| órgão | valor |");
  });

  it("devolve lista vazia para conteúdo vazio", () => {
    expect(analisarResposta("")).toEqual([]);
    expect(analisarResposta("   \n\n  ")).toEqual([]);
  });
});
