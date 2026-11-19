import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O script do Google não tem suíte própria: carrega-se a função REAL do arquivo .gs (não uma
 * cópia), para que o teste quebre se o script mudar.
 */
const fonte = readFileSync(join(__dirname, "..", "respostasCotacao.gs"), "utf-8");
const trecho = /function numeroProcessoDoCorpo_[\s\S]*?\n}\n/.exec(fonte)?.[0];
if (!trecho) throw new Error("numeroProcessoDoCorpo_ não encontrada no script");
const numeroDoCorpo = new Function(`${trecho}; return numeroProcessoDoCorpo_;`)() as (c: string) => string | null;

describe("numeroProcessoDoCorpo_", () => {
  it.each([
    ["Prezados, segue solicitação referente ao Processo nº 382/2026.", "382"],
    ["Processo Administrativo n. 0382/2026 - Câmara Municipal", "382"],
    ["PROC. 382", "382"],
    ["Processo: 382", "382"],
    ["Processo 2026/382", "382"],
    ["Proc nº 15.", "15"],
    // Modelo real da Divisão (2026-11-19): "Nº" + ponto + dois-pontos. Antes devolvia null e deixou
    // 27 envios (2.592 consultas) sem processo.
    ["PROCESSO Nº.: 12141/2025", "12141"],
    ["PROCESSO N°.: 12141/2025", "12141"],
    ["PROCESSO N.º 12141/2025", "12141"],
    ["CNPJ: 49.203.409/0001-02\nPROCESSO Nº.: 12141/2025\nSolicitamos, por meio deste", "12141"],
  ])("lê %j", (texto, esperado) => {
    expect(numeroDoCorpo(texto)).toBe(esperado);
  });

  it("o texto citado de uma resposta repete o mesmo número: continua valendo", () => {
    expect(numeroDoCorpo("Segue anexo.\n> Processo 382/2026\n> Proc. 382")).toBe("382");
  });

  it("números diferentes no texto = ambíguo, não liga a nenhum", () => {
    expect(numeroDoCorpo("Referente ao Processo 382, e não ao Processo 120.")).toBeNull();
  });

  it("sem número de processo, ou palavra parecida, devolve null", () => {
    expect(numeroDoCorpo("Segue o orçamento. Procedimento padrão, 3 itens.")).toBeNull();
    expect(numeroDoCorpo("")).toBeNull();
  });
});
