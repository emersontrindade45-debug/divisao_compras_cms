export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(dateStr: string): string {
  // timeZone fixo: sem isso, o Intl usa o fuso do runtime — UTC no servidor
  // (Vercel) e o do navegador no cliente. Para um ISO de meia-noite (ex.:
  // "2025-11-10T00:00:00.000Z"), UTC-3 cai no dia anterior, então servidor e
  // cliente formatavam datas diferentes: mismatch de texto na hidratação
  // (React error #418) em toda tela que lista `dataReferencia`/`dataEnvio`.
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(dateStr),
  );
}

export function formatDataHora(isoStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(isoStr));
}
