import { contemCnpjProprio } from "@/lib/domain/orgaoProprio";
import type { ResultadoWeb } from "@/lib/integracoes/perplexity";

// Guardas de conformidade do assistente (M13), aplicadas EM CÓDIGO.
//
// Não basta pedir no prompt que o modelo ignore marketplaces ou contratos do
// próprio órgão: instrução em linguagem natural é sugestão, não garantia — e a
// §9.33 registra o custo de tratar regra documentada como regra implementada.
// Todo resultado de busca externa passa por aqui antes de chegar ao modelo.
//
// Módulo puro: recebe as listas como parâmetro em vez de consultar o banco, o
// que o torna testável sem mock de Prisma. Quem chama busca os domínios.

export type MotivoDescarte = "orgao_proprio" | "dominio_bloqueado" | "url_invalida";

export interface ResultadoDescartado {
  url: string;
  titulo: string;
  motivo: MotivoDescarte;
}

export interface ResultadoFiltragem {
  mantidos: ResultadoWeb[];
  /**
   * Descartados ficam visíveis de propósito: o assistente informa "ignorei 2
   * resultados de marketplace" em vez de silenciosamente mostrar menos coisas.
   */
  descartados: ResultadoDescartado[];
}

/** Extrai o host de uma URL; devolve null quando a URL é inválida. */
export function extrairDominio(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // "www." é ruído para comparação de domínio.
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Compara domínios por sufixo, para que bloquear "mercadolivre.com.br" também
 * bloqueie "produto.mercadolivre.com.br".
 *
 * O ponto antes do sufixo é obrigatório: sem ele, bloquear "livre.com" pegaria
 * "mercadolivre.com", que é outro site.
 */
export function dominioCasa(host: string, padrao: string): boolean {
  const alvo = padrao.trim().toLowerCase().replace(/^www\./, "");
  if (!alvo) return false;
  return host === alvo || host.endsWith(`.${alvo}`);
}

/**
 * Aplica ao resultado de busca na web as duas exclusões que a busca do PNCP já
 * tem embutidas:
 *
 * 1. **Órgão próprio** (IN 65/2021, §9.9) — um contrato da própria Câmara não
 *    pode ser referência de preço para a própria renovação. Na web o CNPJ vem
 *    embutido na URL ou no texto, então a checagem varre título, trecho e URL.
 * 2. **Lista vermelha** — marketplaces e intermediários de venda. O
 *    `search_domain_filter` da Perplexity já tenta excluí-los na origem, mas ele
 *    tem teto de 20 domínios e não cobre a busca web da OpenAI; esta é a
 *    barreira que vale para todas as fontes.
 */
export function filtrarResultadosWeb(
  resultados: ResultadoWeb[],
  dominiosBloqueados: string[] = [],
): ResultadoFiltragem {
  const mantidos: ResultadoWeb[] = [];
  const descartados: ResultadoDescartado[] = [];

  for (const resultado of resultados) {
    const host = extrairDominio(resultado.url);
    if (!host) {
      descartados.push({
        url: resultado.url,
        titulo: resultado.titulo,
        motivo: "url_invalida",
      });
      continue;
    }

    // O CNPJ próprio pode aparecer em qualquer parte do resultado — a URL do
    // PNCP o carrega no caminho, e o texto da página o cita por extenso.
    const textoCompleto = `${resultado.url} ${resultado.titulo} ${resultado.trecho ?? ""}`;
    if (contemCnpjProprio(textoCompleto)) {
      descartados.push({
        url: resultado.url,
        titulo: resultado.titulo,
        motivo: "orgao_proprio",
      });
      continue;
    }

    if (dominiosBloqueados.some((padrao) => dominioCasa(host, padrao))) {
      descartados.push({
        url: resultado.url,
        titulo: resultado.titulo,
        motivo: "dominio_bloqueado",
      });
      continue;
    }

    mantidos.push(resultado);
  }

  return { mantidos, descartados };
}

/** Texto curto para o assistente explicar o que sumiu, em vez de omitir em silêncio. */
export function resumirDescartes(descartados: ResultadoDescartado[]): string | null {
  if (descartados.length === 0) return null;

  const rotulos: Record<MotivoDescarte, string> = {
    orgao_proprio: "por serem contratações do próprio órgão",
    dominio_bloqueado: "por serem de domínios bloqueados (marketplaces)",
    url_invalida: "por terem endereço inválido",
  };

  const porMotivo = new Map<MotivoDescarte, number>();
  for (const d of descartados) {
    porMotivo.set(d.motivo, (porMotivo.get(d.motivo) ?? 0) + 1);
  }

  const partes = Array.from(porMotivo.entries()).map(
    ([motivo, total]) => `${total} ${total === 1 ? "resultado" : "resultados"} ${rotulos[motivo]}`,
  );

  return `Descartei ${partes.join(" e ")}.`;
}
