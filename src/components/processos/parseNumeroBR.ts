/**
 * Converte número digitado em pt-BR para `number`. `NaN` quando não dá para
 * ler com segurança — o chamador trata como campo inválido em vez de mandar
 * lixo para a server action.
 *
 * O caso perigoso é "15.000": `Number("15.000")` devolve 15, e um contrato de
 * quinze mil viraria quinze reais na série de preços sem nenhum aviso (ver
 * CLAUDE.md §9.70). Por isso o ponto só é lido como decimal quando o texto NÃO
 * tem cara de milhar.
 */
export function parseNumeroBR(bruto: string): number {
  const s = bruto
    .trim()
    .replace(/r\$/gi, "")
    .replace(/\s| /g, "");
  if (!s) return Number.NaN;
  if (!/^-?[\d.,]+$/.test(s)) return Number.NaN;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  let normalizado = s;
  if (temVirgula && temPonto) {
    // "15.000,50" — ponto é milhar, vírgula é decimal.
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    normalizado = s.replace(",", ".");
  } else if (temPonto && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "15.000" / "1.200.000" — grupos de 3: milhar, não decimal.
    normalizado = s.replace(/\./g, "");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Número para dentro do input: sem separador de milhar, vírgula decimal. */
export function paraCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(".", ",");
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
