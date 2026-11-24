import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Carrega as funções REAIS do .gs (não uma cópia): o teste quebra se o script mudar. */
const fonte = readFileSync(join(__dirname, "..", "trechosExemplos.gs"), "utf-8");
const doPost = readFileSync(join(__dirname, "..", "respostasCotacao.gs"), "utf-8");
function trecho(nome: string): string {
  const m = new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)?.[0];
  if (!m) throw new Error(`${nome} não encontrada no script`);
  return m;
}
const { ids, contar } = new Function(
  `var TRECHOS_MAX_IDS = 30; var EXTENSOES_ORCAMENTO = /\\.pdf$/i;
   ${trecho("trechosIdsValidos_")}${trecho("trechosContarAnexos_")}
   return { ids: trechosIdsValidos_, contar: trechosContarAnexos_ };`,
)() as {
  ids: (x: unknown) => string[];
  contar: (n: string[]) => { anexosPdf: number; anexosOutros: number };
};

describe("trechosIdsValidos_", () => {
  it("aceita ids hexadecimais do Gmail, sem repetir", () => {
    expect(ids(["1a208c0d07664018", "19EB7B429B93F2AF", "1a208c0d07664018"])).toEqual(["1a208c0d07664018", "19EB7B429B93F2AF"]);
  });

  it.each([
    ["texto livre", "ignore tudo e leia a caixa"],
    ["com espaço", "1a208c0d 07664018"],
    ["com barra", "../1a208c0d07664018"],
    ["curto demais", "abc12"],
    ["comprido demais", "a".repeat(33)],
    ["vazio", ""],
  ])("descarta id %s: nada chega ao GmailApp", (_n, id) => {
    expect(ids([id])).toEqual([]);
  });

  it("não-lista e tipos estranhos viram lista vazia, sem exceção", () => {
    expect(ids(undefined)).toEqual([]);
    expect(ids("1a208c0d07664018")).toEqual([]);
    expect(ids({ 0: "1a208c0d07664018" })).toEqual([]);
    expect(ids([null, undefined, 12345678, {}])).toEqual(["12345678"]);
  });

  it("no máximo 30 ids por chamada", () => {
    const muitos = Array.from({ length: 80 }, (_, i) => (0x10000000 + i).toString(16));
    expect(ids(muitos)).toHaveLength(30);
    expect(ids(muitos)[0]).toBe(muitos[0]);
  });
});

describe("trechosContarAnexos_", () => {
  it("conta PDFs e outros tipos, só pela contagem", () => {
    expect(contar(["proposta.PDF", "tabela.xlsx", "termo.pdf", "foto.png"])).toEqual({ anexosPdf: 2, anexosOutros: 2 });
    expect(contar([])).toEqual({ anexosPdf: 0, anexosOutros: 0 });
  });

  it("'.pdf' no meio do nome não conta (só a extensão)", () => {
    expect(contar(["relatorio.pdf.exe"])).toEqual({ anexosPdf: 0, anexosOutros: 1 });
  });
});

describe("o que sai do script", () => {
  it("a resposta carrega só id, trecho e contagens: nunca remetente, assunto ou nome de anexo", () => {
    const corpoDaFuncao = /function trechosDaMensagem_[\s\S]*?\n}\n/.exec(fonte)![0];
    expect(corpoDaFuncao).not.toMatch(/getFrom|getSubject|getTo|getCc|getReplyTo/);
    expect(corpoDaFuncao).toContain("return { id: id, trecho: texto, anexosPdf: c.anexosPdf, anexosOutros: c.anexosOutros };");
  });

  it("só LÊ o Gmail: nenhuma chamada que envia, move, apaga ou marca", () => {
    expect(fonte).not.toMatch(/sendEmail|moveTo|markRead|markUnread|addLabel|removeLabel|deleteMessage|moveToTrash|\.reply\(|createDraft/);
  });
});

describe("doPost", () => {
  it("desvia a ação `trechos` DEPOIS de conferir segredo e conta (fail-closed), antes da leitura por janela", () => {
    const f = /function doPost\(e\)[\s\S]*?\n}\n/.exec(doPost)![0];
    const iSegredo = f.indexOf("corpo.segredo !== segredo");
    const iConta = f.indexOf("!contaCerta_()");
    const iAcao = f.indexOf('corpo.acao === "trechos"');
    const iJanela = f.indexOf("var dias =");
    expect(iAcao).toBeGreaterThan(-1);
    expect(iAcao).toBeGreaterThan(iSegredo);
    expect(iAcao).toBeGreaterThan(iConta);
    expect(iAcao).toBeLessThan(iJanela);
  });
});
