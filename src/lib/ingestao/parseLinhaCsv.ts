/**
 * Divide uma única linha de CSV (sem terminador de linha) em campos, respeitando aspas e aspas
 * escapadas (""). Usado pelo import streaming de candidatos a Fornecedor (M27), que lê um arquivo
 * potencialmente de milhões de linhas via `readline` — uma linha por vez, nunca o buffer inteiro
 * em memória.
 *
 * Diferente de `parseCsv` (`@/lib/sheets/csv.ts`), que processa o texto inteiro e suporta campo
 * multilinha entre aspas (necessário para a exportação gviz do Google Sheets): aqui a linha já
 * chega separada pelo `readline`, e um campo multilinha é justamente o caso que se quer DETECTAR e
 * rejeitar, não absorver silenciosamente — por isso devolve `null` quando a linha termina ainda
 * dentro de aspas (aspas não fechadas é o sinal de que uma quebra de linha embutida escapou do
 * parser linha-a-linha). O CSV de entrada é gerado pelo próprio DuckDB (formato controlado), não
 * um CSV arbitrário da internet, então esse caso deve ser raro — mas precisa de um sinal explícito
 * de linha rejeitada em vez de corromper o parse silenciosamente.
 */
export function parseLinhaCsv(linha: string): string[] | null {
  const campos: string[] = [];
  let campo = "";
  let dentroDeAspas = false;
  let i = 0;
  const n = linha.length;

  while (i < n) {
    const ch = linha[i]!;
    if (dentroDeAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroDeAspas = false;
        i++;
        continue;
      }
      campo += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      dentroDeAspas = true;
      i++;
      continue;
    }
    if (ch === ",") {
      campos.push(campo);
      campo = "";
      i++;
      continue;
    }
    campo += ch;
    i++;
  }

  if (dentroDeAspas) return null;
  campos.push(campo);
  return campos;
}
