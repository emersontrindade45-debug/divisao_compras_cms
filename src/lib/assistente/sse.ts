// Parser de Server-Sent Events do assistente (M13).
//
// Módulo puro e sem DOM de propósito: a leitura do stream é a parte mais fácil
// de errar do chat (um chunk pode cortar um evento ao meio) e a mais difícil de
// testar dentro de um componente React. Aqui ela é uma função de string.

/** Evento já desserializado, com o nome vindo da linha `event:`. */
export interface EventoSSE {
  nome: string;
  dados: Record<string, unknown>;
}

export interface ResultadoParse {
  eventos: EventoSSE[];
  /**
   * Sobra que ainda não formou um evento completo. O chamador precisa devolvê-la
   * na próxima chamada — o corte de um chunk TCP não respeita o `\n\n`, e
   * descartar a sobra perde eventos de forma silenciosa e intermitente.
   */
  resto: string;
}

/**
 * Consome o que já dá para consumir do buffer e devolve o resto.
 *
 * Ignora blocos malformados em vez de lançar: um evento corrompido não pode
 * derrubar o chat inteiro no meio de uma pesquisa.
 */
export function consumirEventos(buffer: string): ResultadoParse {
  const partes = buffer.split("\n\n");
  // A última parte só está completa se o buffer terminava em "\n\n" — nesse
  // caso `split` deixa uma string vazia no fim, e ela vira o resto.
  const resto = partes.pop() ?? "";

  const eventos: EventoSSE[] = [];
  for (const bloco of partes) {
    if (!bloco.trim()) continue;

    let nome = "message";
    const linhasDados: string[] = [];
    for (const linha of bloco.split("\n")) {
      if (linha.startsWith("event:")) nome = linha.slice(6).trim();
      else if (linha.startsWith("data:")) linhasDados.push(linha.slice(5).trim());
    }
    if (linhasDados.length === 0) continue;

    try {
      const dados = JSON.parse(linhasDados.join("\n")) as unknown;
      if (dados && typeof dados === "object" && !Array.isArray(dados)) {
        eventos.push({ nome, dados: dados as Record<string, unknown> });
      }
    } catch {
      // Bloco inválido: descarta e segue. O evento "erro" da rota é o canal
      // legítimo de falha; ruído de transporte não vira mensagem na tela.
    }
  }

  return { eventos, resto };
}

/**
 * Lê um `ReadableStream` de bytes até o fim, entregando cada evento assim que
 * ele se completa.
 */
export async function lerStreamSSE(
  corpo: ReadableStream<Uint8Array>,
  aoReceber: (evento: EventoSSE) => void,
): Promise<void> {
  const leitor = corpo.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      // `stream: true` mantém em suspenso um caractere multibyte cortado entre
      // dois chunks — sem isso, acento no meio de uma resposta vira "�".
      buffer += decoder.decode(value, { stream: true });

      const { eventos, resto } = consumirEventos(buffer);
      buffer = resto;
      for (const evento of eventos) aoReceber(evento);
    }

    // Um servidor que fecha sem o "\n\n" final deixaria o último evento preso
    // no buffer — e o último evento é justamente o `fim`.
    buffer += decoder.decode();
    const { eventos } = consumirEventos(`${buffer}\n\n`);
    for (const evento of eventos) aoReceber(evento);
  } finally {
    leitor.releaseLock();
  }
}
