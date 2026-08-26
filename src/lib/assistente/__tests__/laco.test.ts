import { describe, it, expect, vi } from "vitest";
import {
  executarTurno,
  MAX_PASSOS_POR_TURNO,
  ORCAMENTO_TEMPO_TURNO_MS,
  type ChamadaFerramenta,
  type EventoTurno,
  type ModeloConversacional,
  type RespostaModelo,
} from "../laco";

function chamada(nome: string, id = `c-${nome}`): ChamadaFerramenta {
  return { id, nome, argumentos: JSON.stringify({ termo: "cadeira" }) };
}

/** Modelo de teste que devolve uma resposta programada por vez. */
function modeloRoteirizado(roteiro: RespostaModelo[]): ModeloConversacional & {
  chamadasRecebidas: boolean[];
} {
  let i = 0;
  const chamadasRecebidas: boolean[] = [];
  return {
    chamadasRecebidas,
    async responder(_historico, permitirFerramentas) {
      chamadasRecebidas.push(permitirFerramentas);
      const resposta = roteiro[i] ?? { texto: "fim", chamadas: [] };
      i += 1;
      return resposta;
    },
  };
}

const executarOk = vi.fn(async () => ({ conteudo: '{"resultados":3}' }));

describe("executarTurno", () => {
  it("encerra sem passos quando o modelo responde direto", async () => {
    const modelo = modeloRoteirizado([{ texto: "Resposta direta.", chamadas: [] }]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "oi" }],
      modelo,
      executar: executarOk,
    });

    expect(res.texto).toBe("Resposta direta.");
    expect(res.passos).toHaveLength(0);
    expect(res.orcamentoEsgotado).toBe(false);
  });

  it("executa a ferramenta pedida e devolve o resultado ao modelo", async () => {
    const executar = vi.fn(async () => ({ conteudo: '{"candidatos":12}' }));
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp")] },
      { texto: "Achei 12 candidatos.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar,
    });

    expect(executar).toHaveBeenCalledTimes(1);
    expect(res.passos).toHaveLength(1);
    expect(res.passos[0]!.ferramenta).toBe("buscar_pncp");
    expect(res.texto).toBe("Achei 12 candidatos.");
    // O resultado precisa voltar ao histórico como mensagem `tool`, senão o
    // modelo responde sem ver o que a busca trouxe.
    const mensagemTool = res.historico.find((m) => m.papel === "tool");
    expect(mensagemTool?.conteudo).toContain("12");
    expect(mensagemTool?.chamadaId).toBe("c-buscar_pncp");
  });

  it("encadeia várias rodadas de ferramenta", async () => {
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp", "c1")] },
      { texto: "", chamadas: [chamada("buscar_web_perplexity", "c2")] },
      { texto: "Comparei as duas fontes.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: executarOk,
    });

    expect(res.passos.map((p) => p.ferramenta)).toEqual([
      "buscar_pncp",
      "buscar_web_perplexity",
    ]);
    expect(res.orcamentoEsgotado).toBe(false);
  });

  it("executa várias ferramentas pedidas na mesma resposta", async () => {
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a", "c1"), chamada("b", "c2")] },
      { texto: "pronto", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: executarOk,
    });

    expect(res.passos).toHaveLength(2);
  });

  // Falha de uma fonte não pode derrubar o turno: com o PNCP fora do ar, a busca
  // web ainda serve.
  it("registra erro de ferramenta e continua o turno", async () => {
    const executar = vi.fn(async () => {
      throw new Error("PNCP indisponível");
    });
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp")] },
      { texto: "O PNCP falhou; tentei outra rota.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar,
    });

    expect(res.passos[0]!.erro).toContain("PNCP indisponível");
    expect(res.texto).toContain("outra rota");
    // O modelo precisa VER o erro para poder reagir a ele.
    const mensagemTool = res.historico.find((m) => m.papel === "tool");
    expect(mensagemTool?.conteudo).toContain("PNCP indisponível");
  });

  it("para ao esgotar o orçamento e ainda assim produz texto final", async () => {
    // Modelo teimoso: pede ferramenta indefinidamente.
    const modelo: ModeloConversacional = {
      async responder(_historico, permitirFerramentas) {
        if (!permitirFerramentas) return { texto: "Resumo do que encontrei.", chamadas: [] };
        return { texto: "", chamadas: [chamada("buscar_pncp", `c-${Math.random()}`)] };
      },
    };

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: executarOk,
      maxPassos: 3,
    });

    expect(res.passos).toHaveLength(3);
    expect(res.orcamentoEsgotado).toBe(true);
    // CLAUDE.md §9.40: parar em silêncio deixaria a tela sem resposta.
    expect(res.texto).toBe("Resumo do que encontrei.");
  });

  it("pede o fechamento com ferramentas desabilitadas", async () => {
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a", "c1")] },
      { texto: "", chamadas: [chamada("b", "c2")] },
      { texto: "fechamento", chamadas: [] },
    ]);

    await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: executarOk,
      maxPassos: 2,
    });

    // A última ida ao modelo tem de proibir ferramentas, senão ele pediria mais
    // e o laço não teria como fechar.
    expect(modelo.chamadasRecebidas.at(-1)).toBe(false);
  });

  it("nunca executa mais ferramentas do que o orçamento, mesmo pedidas de uma vez", async () => {
    const executar = vi.fn(async () => ({ conteudo: "{}" }));
    const modelo = modeloRoteirizado([
      {
        texto: "",
        chamadas: [chamada("a", "c1"), chamada("b", "c2"), chamada("c", "c3")],
      },
      { texto: "fim", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar,
      maxPassos: 2,
    });

    expect(executar).toHaveBeenCalledTimes(2);
    expect(res.orcamentoEsgotado).toBe(true);
    // A chamada cortada precisa receber uma resposta `tool`, senão o modelo fica
    // esperando um resultado que nunca chega.
    const respostasTool = res.historico.filter((m) => m.papel === "tool");
    expect(respostasTool).toHaveLength(3);
    expect(respostasTool.at(-1)!.conteudo).toMatch(/orçamento/i);
  });

  it("com orçamento zero, responde sem pesquisar", async () => {
    const executar = vi.fn(async () => ({ conteudo: "{}" }));
    const modelo = modeloRoteirizado([{ texto: "Sem pesquisar.", chamadas: [] }]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar,
      maxPassos: 0,
    });

    expect(executar).not.toHaveBeenCalled();
    expect(modelo.chamadasRecebidas[0]).toBe(false);
    expect(res.texto).toBe("Sem pesquisar.");
  });

  it("emite eventos de início e fim de cada passo, para o streaming", async () => {
    const eventos: EventoTurno[] = [];
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp")] },
      { texto: "ok", chamadas: [] },
    ]);

    await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: executarOk,
      onEvento: (e) => eventos.push(e),
    });

    expect(eventos.map((e) => e.tipo)).toEqual(["passo_inicio", "passo_fim", "texto"]);
  });

  it("mede a duração de cada passo", async () => {
    let relogio = 1000;
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a")] },
      { texto: "ok", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: async () => {
        relogio += 250;
        return { conteudo: "{}" };
      },
      agora: () => relogio,
    });

    expect(res.passos[0]!.duracaoMs).toBe(250);
  });

  it("trunca o resumo do passo para não inchar o rastro persistido", async () => {
    const gigante = "x".repeat(5000);
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a")] },
      { texto: "ok", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar: async () => ({ conteudo: gigante }),
    });

    expect(res.passos[0]!.resumo.length).toBeLessThan(gigante.length);
    expect(res.passos[0]!.resumo).toMatch(/…$/);
  });

  it("o teto padrão é o documentado", () => {
    expect(MAX_PASSOS_POR_TURNO).toBe(8);
  });

  // -------------------------------------------------------------------------
  // Orçamento de TEMPO.
  //
  // O teto de passos não protegia o `maxDuration = 60` da rota: uma única
  // `buscar_pncp` custa dezenas de segundos (11s e 82 requisições HTTP medidos
  // contra a API real). Estourar o `maxDuration` mata a função no meio do
  // stream SSE, e o passo em andamento gira para sempre no cliente.
  // -------------------------------------------------------------------------

  // ATENÇÃO ao histórico deste teste: até 2026-08-26 ele afirmava o contrário —
  // exigia que as DUAS buscas de 20s rodassem, terminando aos 40s. Ou seja, o
  // teste codificava o bug: 40s de ferramentas + fechamento do modelo (até 15s)
  // estoura o `maxDuration = 60` da rota, a Vercel mata a função no meio do
  // stream e NADA é gravado. Medido em produção: 5 de 21 turnos morreram assim,
  // e o usuário via o clique não fazer absolutamente nada.
  it("não começa ferramenta que não cabe inteira antes do limite", async () => {
    let relogio = 0;
    const executar = vi.fn(async () => {
      relogio += 20_000;
      return { conteudo: "{}" };
    });
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp", "c1")] },
      { texto: "", chamadas: [chamada("buscar_pncp", "c2")] },
      { texto: "Fechamento com o que achei.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar,
      agora: () => relogio,
    });

    // A primeira cabe (0s + 30s de reserva <= 40s). A segunda começaria aos 20s
    // e a reserva a levaria a 50s — não cabe, e é barrada ANTES de começar.
    expect(executar).toHaveBeenCalledTimes(1);
    expect(res.passos).toHaveLength(1);
    expect(res.orcamentoEsgotado).toBe(true);
    // Não pode acabar em silêncio: o turno fecha com texto para o usuário, e é
    // esse fechamento que faz a mensagem (e os candidatos já achados) serem
    // gravados em vez de perdidos.
    expect(res.texto).toBe("Fechamento com o que achei.");
  });

  /**
   * Relógio que avança DURANTE o turno. Iniciar `relogio` num valor alto não
   * funciona: `inicioTurno` é capturado na primeira leitura, então o decorrido
   * continua zero — foi assim que a primeira versão destes testes passou sem
   * exercitar a reserva.
   */
  function executarQueGastaTempo(relogioRef: { ms: number }) {
    return vi.fn(async (c: ChamadaFerramenta) => {
      // `ler_tr` é o consumidor de tempo do cenário; o resto é barato.
      relogioRef.ms += c.nome === "ler_tr" ? 32_000 : 1_000;
      return { conteudo: "{}" };
    });
  }

  it("reserva conforme a ferramenta: leitura barata cabe onde a busca não cabe", async () => {
    const relogio = { ms: 0 };
    const executar = executarQueGastaTempo(relogio);
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("ler_tr", "c0")] },
      // Aos 32s: ler_processo reserva 8s (32+8=40, cabe no limite);
      // buscar_pncp reserva 30s (33+30=63, não cabe).
      { texto: "", chamadas: [chamada("ler_processo", "c1"), chamada("buscar_pncp", "c2")] },
      { texto: "Fechamento.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar,
      agora: () => relogio.ms,
    });

    const executadas = executar.mock.calls.map(([c]) => c.nome);
    expect(executadas).toEqual(["ler_tr", "ler_processo"]);
    expect(executadas).not.toContain("buscar_pncp");
    expect(res.orcamentoEsgotado).toBe(true);
  });

  it("não repete a ferramenta barrada até queimar os passos", async () => {
    // Sem fechar o laço ao marcar `orcamentoEsgotado`, o modelo pediria a mesma
    // busca na rodada seguinte, seria barrado de novo, e o turno gastaria as 8
    // rodadas repetindo o bloqueio — devolvendo texto vazio no fim.
    const relogio = { ms: 0 };
    const executar = executarQueGastaTempo(relogio);
    // O modelo INSISTE na busca: sem isso o roteiro pararia sozinho na terceira
    // entrada e o teste passaria mesmo sem a guarda (a mutação que remove
    // `orcamentoEsgotado` do fechamento não era detectada — §9.99).
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("ler_tr", "c0")] },
      { texto: "", chamadas: [chamada("buscar_pncp", "c1")] },
      { texto: "Fechei sem buscar.", chamadas: [chamada("buscar_pncp", "c2")] },
      { texto: "NÃO DEVERIA CHEGAR AQUI", chamadas: [chamada("buscar_pncp", "c3")] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar,
      agora: () => relogio.ms,
    });

    expect(executar.mock.calls.map(([c]) => c.nome)).toEqual(["ler_tr"]);
    expect(res.orcamentoEsgotado).toBe(true);
    // A assertiva que discrimina: 3 idas ao modelo (leitura, busca barrada,
    // fechamento). Sem a guarda o laço daria mais uma volta pedindo a MESMA
    // busca, seria barrado de novo, e só então fecharia — 4 idas.
    expect(modelo.chamadasRecebidas).toHaveLength(3);
    expect(res.texto).toBe("Fechei sem buscar.");
  });

  it("diz ao modelo QUAL ferramenta não coube, para ele fechar em vez de insistir", async () => {
    const relogio = { ms: 0 };
    const executar = executarQueGastaTempo(relogio);
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("ler_tr", "c0")] },
      { texto: "", chamadas: [chamada("buscar_pncp", "c1")] },
      { texto: "Fechamento.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar,
      agora: () => relogio.ms,
    });

    const bloqueio = res.historico.filter((m) => m.papel === "tool").at(-1);
    expect(bloqueio?.conteudo).toContain("buscar_pncp");
    expect(bloqueio?.conteudo).toMatch(/não há tempo restante/i);
  });

  it("com o tempo esgotado, o fechamento é pedido sem ferramentas", async () => {
    let relogio = 0;
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("buscar_pncp", "c1")] },
      { texto: "Fechei.", chamadas: [] },
    ]);

    await executarTurno({
      historico: [{ papel: "user", conteudo: "procure" }],
      modelo,
      executar: async () => {
        relogio += 40_000;
        return { conteudo: "{}" };
      },
      agora: () => relogio,
    });

    // A última ida ao modelo tem de proibir ferramentas: com elas liberadas o
    // modelo pediria outra busca e o laço gastaria mais uma rodada inteira.
    expect(modelo.chamadasRecebidas.at(-1)).toBe(false);
  });

  it("não interfere no turno rápido: nada é cortado dentro do orçamento", async () => {
    let relogio = 0;
    const executar = vi.fn(async () => {
      relogio += 500;
      return { conteudo: "{}" };
    });
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a", "c1"), chamada("b", "c2")] },
      { texto: "Pronto.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar,
      agora: () => relogio,
    });

    expect(executar).toHaveBeenCalledTimes(2);
    expect(res.orcamentoEsgotado).toBe(false);
  });

  it("o orçamento é reavaliado a cada chamada do mesmo lote", async () => {
    let relogio = 0;
    const executar = vi.fn(async () => {
      relogio += 40_000;
      return { conteudo: "{}" };
    });
    // O modelo pede três buscas DE UMA VEZ. Sem reavaliar o tempo dentro do
    // laço, as três rodariam porque o orçamento estava intacto no início.
    const modelo = modeloRoteirizado([
      { texto: "", chamadas: [chamada("a", "c1"), chamada("b", "c2"), chamada("c", "c3")] },
      { texto: "Fechei.", chamadas: [] },
    ]);

    const res = await executarTurno({
      historico: [{ papel: "user", conteudo: "x" }],
      modelo,
      executar,
      agora: () => relogio,
    });

    expect(executar).toHaveBeenCalledTimes(1);
    expect(res.orcamentoEsgotado).toBe(true);
    // As duas chamadas cortadas precisam voltar ao modelo dizendo POR QUE
    // foram cortadas — a Responses API exige resposta para toda chamada, e sem
    // o motivo o modelo repete a mesma busca no turno seguinte.
    const tools = res.historico.filter((m) => m.papel === "tool");
    expect(tools).toHaveLength(3);
    expect(tools[1]!.conteudo).toMatch(/tempo/i);
    expect(tools[2]!.conteudo).toMatch(/tempo/i);
  });

  it("o orçamento de tempo padrão é o documentado", () => {
    expect(ORCAMENTO_TEMPO_TURNO_MS).toBe(35_000);
  });
});
