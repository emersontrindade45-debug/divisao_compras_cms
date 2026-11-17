import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Funções REAIS do script (não cópias): o teste quebra se o script mudar. */
const fonte = readFileSync(join(__dirname, "..", "respostasCotacao.gs"), "utf-8");
function carregar<T>(nome: string): T {
  const trecho = new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)?.[0];
  if (!trecho) throw new Error(`${nome} não encontrada no script`);
  return new Function(`${trecho}; return ${nome};`)() as T;
}

const semCitacao = carregar<(c: string) => string>("semCitacao_");
const marcadores = carregar<(t: string) => Record<string, boolean>>("marcadoresDoTexto_");

describe("semCitacao_", () => {
  it("corta no 'Em … escreveu:' do e-mail original", () => {
    const corpo = "Obrigado, vamos analisar.\n\nEm seg., 3 de nov. de 2026 10:00, Compras <compras@x.gov.br> escreveu:\nSolicitamos orçamento?";
    expect(semCitacao(corpo)).toBe("Obrigado, vamos analisar.");
  });

  it("corta na primeira linha citada com '>'", () => {
    expect(semCitacao("Ok.\n> orçamento solicitado?\n> prazo")).toBe("Ok.");
  });

  it("sem citação, devolve o texto inteiro", () => {
    expect(semCitacao("Resposta direta.")).toBe("Resposta direta.");
  });
});

describe("marcadoresDoTexto_", () => {
  it("a pergunta do nosso próprio pedido (parte citada) não conta como pergunta do fornecedor", () => {
    const corpo = "Recebido.\n\nEm seg., 3 de nov. de 2026 10:00, Compras escreveu:\nPoderia enviar o orçamento?";
    expect(marcadores(semCitacao(corpo)).pergunta).toBe(false);
  });

  it("reconhece recusa por frase fora da lista fixa", () => {
    expect(marcadores("Infelizmente não trabalhamos com esse segmento.").semInteresse).toBe(true);
  });

  it("reconhece pedido de informação", () => {
    expect(marcadores("Poderia enviar o termo de referência?").pedeInformacao).toBe(true);
  });

  it("reconhece valor decimal sem R$", () => {
    expect(marcadores("Fica em 1.250,00 a unidade").numeroDecimal).toBe(true);
  });

  it("texto muito curto conta como vazio", () => {
    expect(marcadores("ok").vazio).toBe(true);
    expect(marcadores("Segue conforme solicitado, com os valores.").vazio).toBe(false);
  });

  it("texto neutro não acende nenhum marcador", () => {
    const m = marcadores("Bom dia, tudo bem com vocês nesta semana de trabalho");
    expect(Object.values(m).some(Boolean)).toBe(false);
  });
});
