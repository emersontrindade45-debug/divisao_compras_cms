import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Arquivo "use server" só pode exportar funções assíncronas. Um reexport — inclusive de TIPO
 * (`export type { X }`) — o Turbopack compila como valor (`ensureServerEntryExports([fn, X])`), e o
 * módulo estoura com "ReferenceError: X is not defined" ao carregar. Em produção (2026-11-23) isso
 * derrubou todo clique que chamava uma Server Action do mesmo pacote, e nem `tsc`, nem os testes, nem
 * `next build` acusam: só o runtime. Este teste lê os arquivos e barra o padrão.
 */
const DIR = join(__dirname, "..");
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const usaServer = arquivos.filter((f) => /^\s*["']use server["']/.test(readFileSync(join(DIR, f), "utf8")));

/** Reexportações: `export { … }`, `export type { … }` e `export * from …`. */
export function reexportacoes(codigo: string): string[] {
  return codigo
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^export\s+(type\s+)?\{/.test(l) || /^export\s+\*/.test(l));
}

describe("arquivos 'use server' de src/lib/actions", () => {
  it("o teste enxerga os arquivos (não passa por varrer uma pasta vazia)", () => {
    expect(usaServer.length).toBeGreaterThan(10);
  });

  it.each(usaServer)("%s não reexporta nada (só funções declaradas aqui)", (arquivo) => {
    expect(reexportacoes(readFileSync(join(DIR, arquivo), "utf8"))).toEqual([]);
  });

  it("o detector pega o padrão que quebrou produção", () => {
    expect(reexportacoes('export type { A, B };')).toEqual(["export type { A, B };"]);
    expect(reexportacoes("export { x } from './y';")).toHaveLength(1);
    expect(reexportacoes("export * from './y';")).toHaveLength(1);
    expect(reexportacoes("export async function f() {}\nexport interface T {}")).toEqual([]);
  });
});
