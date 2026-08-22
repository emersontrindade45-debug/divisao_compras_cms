/**
 * Acrescenta um número de processo à célula "Processos Cotação" de um fornecedor, **sem apagar os
 * que já estavam lá**.
 *
 * A célula é um histórico: a mesma empresa é consultada em processos diferentes ao longo do tempo,
 * e sobrescrever perderia o registro de quem já foi consultado em quê — informação que a IN
 * 65/2021 exige rastrear. Por isso a operação é sempre append, nunca substituição.
 *
 * Idempotente: reenviar a mesma empresa no mesmo processo não duplica o número. A comparação
 * ignora espaços em volta, mas **não** normaliza a forma do número — "908/2024" e "0908/2024" são
 * tratados como distintos de propósito, porque são identificadores de processo e inventar
 * equivalência entre eles poderia esconder um processo real diferente.
 */
export function acrescentarProcessoCotacao(
  celulaAtual: string | undefined | null,
  numeroProcesso: string,
): string {
  const novo = numeroProcesso.trim();
  if (!novo) return (celulaAtual ?? "").trim();

  const existentes = (celulaAtual ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (existentes.includes(novo)) return existentes.join(", ");

  return [...existentes, novo].join(", ");
}
