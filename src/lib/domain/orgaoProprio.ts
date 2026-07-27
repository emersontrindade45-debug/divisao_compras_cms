// Identidade do próprio órgão, usada para excluí-lo das buscas de preço.
//
// Conformidade IN 65/2021 (CLAUDE.md §9.9): um contrato do próprio órgão não
// pode servir de referência de preço para sua própria renovação/prorrogação.
//
// Este módulo é a fonte única da regra. Antes ela vivia privada dentro de
// `integracoes/pncp.ts`, o que fazia com que qualquer fonte nova (busca web do
// assistente, M13) nascesse sem a exclusão — o tipo de lacuna que a §9.33
// descreve: regra documentada que o código não aplica.
//
// Função pura quanto a I/O: lê apenas variável de ambiente, sem rede nem banco.

/**
 * CNPJ da Câmara Municipal de Santos. O fallback é intencional e não deve virar
 * erro: a regra de conformidade precisa valer mesmo sem ORGAO_CNPJ no ambiente.
 */
export const CNPJ_ORGAO_PADRAO = "49203409000102";

// O aviso do fallback sai uma única vez por processo: `cnpjOrgaoProprio()` é
// chamada a cada busca (uma por item da cotação) e repetir afogaria o log.
let avisoFallbackCnpjEmitido = false;

/** Remove máscara (pontos, barra, hífen) para comparar CNPJs de formatos diferentes. */
export function normalizarCnpj(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

export function cnpjOrgaoProprio(): string {
  const configurado = normalizarCnpj(process.env.ORGAO_CNPJ);
  if (configurado) return configurado;

  if (!avisoFallbackCnpjEmitido) {
    avisoFallbackCnpjEmitido = true;
    console.warn(
      `[OrgaoProprio] ORGAO_CNPJ não está definida no ambiente. Usando o CNPJ padrão ` +
        `${CNPJ_ORGAO_PADRAO} (Câmara Municipal de Santos) para excluir contratações do próprio ` +
        "órgão das buscas de similaridade, conforme a IN 65/2021. Se esta instalação pertence a " +
        "outro órgão, os contratos DELE continuarão aparecendo como candidatos de preço — defina " +
        "ORGAO_CNPJ para corrigir a exclusão.",
    );
  }
  return CNPJ_ORGAO_PADRAO;
}

/**
 * Diz se um texto livre (URL, título, trecho de página) referencia o CNPJ do
 * próprio órgão.
 *
 * Existe porque resultado de busca na web não traz campo estruturado de CNPJ
 * como o PNCP traz — o número aparece embutido na URL
 * (`/app/editais/49203409000102/2025/1`) ou no corpo do texto, com ou sem
 * máscara. A comparação é feita sobre os dígitos do texto inteiro, para casar
 * "49.203.409/0001-02" e "49203409000102" igualmente.
 *
 * Concatenar todos os dígitos admite falso positivo: números vizinhos e não
 * relacionados podem, por acaso, formar a sequência de 14 dígitos. O erro cai no
 * lado seguro — descartar um candidato legítimo custa uma busca a mais, enquanto
 * deixar passar um contrato do próprio órgão contamina a estimativa de preço.
 */
export function contemCnpjProprio(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const proprio = cnpjOrgaoProprio();
  if (!proprio) return false;
  // Junta todos os dígitos do texto: separadores de máscara desaparecem e o CNPJ
  // vira uma subcadeia detectável independentemente da formatação de origem.
  return normalizarCnpj(texto).includes(proprio);
}
