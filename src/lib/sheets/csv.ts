/**
 * Parser de CSV (RFC 4180) sem dependências externas.
 * Suporta aspas, aspas escapadas ("") e quebras de linha dentro de campos —
 * necessário porque a exportação do Google Sheets (gviz) emite células
 * multilinha entre aspas.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // trata \r\n e \r isolado como uma quebra de linha
      pushRow();
      if (text[i + 1] === "\n") i++;
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // último campo/linha (se houver conteúdo pendente)
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}
