import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Carrega as funções REAIS do .gs (não uma cópia): o teste quebra se o script mudar. */
const fonte = readFileSync(join(__dirname, "..", "agendador.gs"), "utf-8");
function trecho(nome: string): string {
  const m = new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)?.[0];
  if (!m) throw new Error(`${nome} não encontrada no script`);
  return m;
}
const { pedido, resumo } = new Function(
  `var AGENDADOR_CAMINHO = "/api/jobs/verificar-respostas";
   var AGENDADOR_CAMPOS_LOG = ["enviosNovos", "consultasNovas", "respostasClassificadas", "respostasNaFila", "emailsInvalidos"];
   ${trecho("agendadorPedido_")}${trecho("agendadorResumo_")}
   return { pedido: agendadorPedido_, resumo: agendadorResumo_ };`,
)() as {
  pedido: (u: unknown, s: unknown) => null | { url: string; opcoes: Record<string, unknown> & { headers: Record<string, string> } };
  resumo: (j: unknown) => string;
};

const SEGREDO = "segredo-longo-de-teste-123";

describe("agendadorPedido_", () => {
  it("monta a chamada GET com Bearer, sem seguir redirecionamento e sem exceção por HTTP", () => {
    const p = pedido("https://divisao-compras-cms.vercel.app", SEGREDO)!;
    expect(p.url).toBe("https://divisao-compras-cms.vercel.app/api/jobs/verificar-respostas");
    expect(p.opcoes.method).toBe("get");
    expect(p.opcoes.headers).toEqual({ Authorization: `Bearer ${SEGREDO}` });
    expect(p.opcoes.followRedirects).toBe(false); // o segredo nunca é reenviado a outro lugar
    expect(p.opcoes.muteHttpExceptions).toBe(true);
  });

  it("tira espaços e a barra final do endereço", () => {
    expect(pedido("  https://x.vercel.app/  ", ` ${SEGREDO} `)!.url).toBe("https://x.vercel.app/api/jobs/verificar-respostas");
  });

  it.each([
    ["http (sem TLS)", "http://x.vercel.app"],
    ["com caminho", "https://x.vercel.app/dashboard"],
    ["com parâmetro", "https://x.vercel.app?a=1"],
    ["com usuário@ (desvia o host)", "https://x.vercel.app@evil.com"],
    ["com credenciais", "https://user:pass@x.vercel.app"],
    ["esquema estranho", "javascript:alert(1)"],
    ["com espaço", "https://x.vercel .app"],
    ["vazio", ""],
  ])("recusa endereço inválido: %s", (_n, url) => {
    expect(pedido(url, SEGREDO)).toBeNull();
  });

  it.each([[""], ["curto"], ["1234567890abcde"], [undefined], [null]])("recusa segredo ausente ou curto (%s)", (s) => {
    expect(pedido("https://x.vercel.app", s)).toBeNull();
  });

  it("endereço ausente recusa", () => {
    expect(pedido(undefined, SEGREDO)).toBeNull();
    expect(pedido(null, SEGREDO)).toBeNull();
  });
});

describe("agendadorResumo_", () => {
  it("imprime só as contagens numéricas conhecidas", () => {
    expect(resumo({ ok: true, resumo: { enviosNovos: 2, consultasNovas: 5, respostasClassificadas: 3, respostasNaFila: 1, emailsInvalidos: 0, envios: 9 } })).toBe(
      "enviosNovos 2 | consultasNovas 5 | respostasClassificadas 3 | respostasNaFila 1 | emailsInvalidos 0",
    );
  });

  it("texto vindo do servidor NUNCA é impresso (só número, em campo conhecido)", () => {
    const s = resumo({ resumo: { enviosNovos: "SEGREDO_NO_LOG", consultasNovas: 1, inventado: 99 }, erro: undefined });
    expect(s).toBe("consultasNovas 1");
    expect(s).not.toContain("SEGREDO_NO_LOG");
    expect(resumo({ erro: "TEXTO LIVRE DO SERVIDOR" })).toBe("falha informada pelo sistema");
  });

  it("casos sem resumo", () => {
    expect(resumo({ ok: true, pulou: "recente" })).toMatch(/pulou/);
    expect(resumo(null)).toBe("sem resposta em JSON");
    expect(resumo("texto")).toBe("sem resposta em JSON");
    expect(resumo({ ok: true })).toBe("sem resumo");
  });
});
