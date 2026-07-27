import { describe, expect, it, vi } from "vitest";
import { consumirEventos, lerStreamSSE, type EventoSSE } from "../sse";

function bloco(nome: string, dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

/** Stream que entrega os pedaços exatamente como foram passados. */
function streamDe(pedacos: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const pedaco of pedacos) controller.enqueue(encoder.encode(pedaco));
      controller.close();
    },
  });
}

describe("consumirEventos", () => {
  it("lê eventos completos e devolve o resto vazio", () => {
    const { eventos, resto } = consumirEventos(
      bloco("passo_inicio", { ferramenta: "buscar_pncp" }) + bloco("texto", { texto: "ok" }),
    );

    expect(eventos).toEqual([
      { nome: "passo_inicio", dados: { ferramenta: "buscar_pncp" } },
      { nome: "texto", dados: { texto: "ok" } },
    ]);
    expect(resto).toBe("");
  });

  // O corte de um chunk TCP não respeita o "\n\n": descartar a sobra perderia
  // eventos de forma intermitente, que é o pior modo de falha possível aqui.
  it("guarda como resto o evento ainda incompleto", () => {
    const completo = bloco("texto", { texto: "primeiro" });
    const parcial = 'event: fim\ndata: {"tex';

    const { eventos, resto } = consumirEventos(completo + parcial);

    expect(eventos).toHaveLength(1);
    expect(resto).toBe(parcial);
  });

  it("ignora bloco com JSON inválido em vez de lançar", () => {
    const { eventos } = consumirEventos("event: texto\ndata: {isto não é json}\n\n");

    expect(eventos).toEqual([]);
  });

  it("ignora bloco sem linha de dados", () => {
    const { eventos } = consumirEventos("event: ping\n\n");

    expect(eventos).toEqual([]);
  });

  it("descarta payload que não é objeto", () => {
    // Um array ou um número no `data:` viraria acesso a propriedade inexistente
    // no componente; recusar aqui evita `undefined` chegando à tela.
    const { eventos } = consumirEventos("event: texto\ndata: [1,2,3]\n\n");

    expect(eventos).toEqual([]);
  });

  it("usa 'message' quando não há linha event:", () => {
    const { eventos } = consumirEventos('data: {"a":1}\n\n');

    expect(eventos).toEqual([{ nome: "message", dados: { a: 1 } }]);
  });
});

describe("lerStreamSSE", () => {
  it("entrega os eventos na ordem em que chegam", async () => {
    const recebidos: EventoSSE[] = [];

    await lerStreamSSE(
      streamDe([
        bloco("conversa", { conversaId: "c1" }),
        bloco("passo_inicio", { ferramenta: "buscar_pncp" }),
        bloco("fim", { texto: "pronto" }),
      ]),
      (e) => recebidos.push(e),
    );

    expect(recebidos.map((e) => e.nome)).toEqual(["conversa", "passo_inicio", "fim"]);
  });

  it("remonta evento partido entre dois chunks", async () => {
    const completo = bloco("fim", { texto: "achei 3 candidatos" });
    const corte = Math.floor(completo.length / 2);
    const recebidos: EventoSSE[] = [];

    await lerStreamSSE(streamDe([completo.slice(0, corte), completo.slice(corte)]), (e) =>
      recebidos.push(e),
    );

    expect(recebidos).toEqual([{ nome: "fim", dados: { texto: "achei 3 candidatos" } }]);
  });

  it("não perde o último evento quando o servidor fecha sem o \\n\\n final", async () => {
    // O último evento é justamente o `fim` — perdê-lo deixaria a UI girando.
    const recebidos: EventoSSE[] = [];

    await lerStreamSSE(streamDe(['event: fim\ndata: {"texto":"pronto"}']), (e) =>
      recebidos.push(e),
    );

    expect(recebidos).toEqual([{ nome: "fim", dados: { texto: "pronto" } }]);
  });

  it("não corrompe acento partido entre dois chunks", async () => {
    // "ç" é multibyte em UTF-8; decodificar sem `stream: true` produziria "�".
    const completo = bloco("texto", { texto: "licitação" });
    const bytes = new TextEncoder().encode(completo);
    const meio = completo.indexOf("ç") + 1; // corta no meio da sequência
    const recebidos: EventoSSE[] = [];

    await lerStreamSSE(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, meio));
          controller.enqueue(bytes.slice(meio));
          controller.close();
        },
      }),
      (e) => recebidos.push(e),
    );

    expect(recebidos[0]!.dados.texto).toBe("licitação");
  });

  it("libera o leitor mesmo quando o callback lança", async () => {
    const stream = streamDe([bloco("texto", { texto: "x" })]);
    const explodir = vi.fn(() => {
      throw new Error("falha no componente");
    });

    await expect(lerStreamSSE(stream, explodir)).rejects.toThrow("falha no componente");
    // Se o lock não fosse liberado, este getReader lançaria.
    expect(() => stream.getReader()).not.toThrow();
  });
});
