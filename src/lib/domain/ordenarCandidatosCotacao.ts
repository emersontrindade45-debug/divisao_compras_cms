import { CAMADAS_GEOGRAFICAS } from "./camadaGeografica";

const CIDADES_BAIXADA = new Set(
  CAMADAS_GEOGRAFICAS.find((c) => c.nome === "baixada_santista")?.cidades ?? [],
);

export interface CandidatoOrdenavel {
  cnpj: string;
  municipio: string;
  email: string | null;
  /** Quantas OUTRAS empresas usam este mesmo e-mail (0 = exclusivo da empresa). */
  empresasComMesmoEmail: number;
}

/**
 * Ordena os candidatos a consultar numa cotação. A ordem importa porque a lista devolvida é longa
 * (teto de 500, decisão do usuário) e o analista revisa de cima para baixo — os primeiros têm de ser
 * os melhores.
 *
 * Critérios, em ordem de precedência:
 *
 * 1. **Baixada Santista primeiro.** Fornecedor local responde mais e atende serviço presencial;
 *    é a mesma prioridade que `CAMADAS_GEOGRAFICAS` já expressa para o cadastro próprio.
 * 2. **E-mail exclusivo antes de e-mail compartilhado.** 23,5% dos candidatos dividem o endereço com
 *    outra empresa (medido em Guarujá, 2026-08-22) — é o padrão de escritório de contabilidade, e a
 *    cotação enviada ao contador raramente chega a quem fornece. Despriorizado, nunca excluído
 *    (decisão do usuário): há fornecedor legítimo cujo contato é mesmo o escritório, e removê-lo
 *    perderia empresa real.
 * 3. **CNPJ** como desempate, só para a ordem ser determinística entre execuções — sem ele, duas
 *    chamadas iguais poderiam devolver listas em ordens diferentes e a revisão do analista viraria
 *    um alvo móvel.
 */
export function ordenarCandidatosCotacao<T extends CandidatoOrdenavel>(candidatos: T[]): T[] {
  return [...candidatos].sort((a, b) => {
    const localA = CIDADES_BAIXADA.has(a.municipio) ? 0 : 1;
    const localB = CIDADES_BAIXADA.has(b.municipio) ? 0 : 1;
    if (localA !== localB) return localA - localB;

    const compartilhadoA = a.empresasComMesmoEmail > 0 ? 1 : 0;
    const compartilhadoB = b.empresasComMesmoEmail > 0 ? 1 : 0;
    if (compartilhadoA !== compartilhadoB) return compartilhadoA - compartilhadoB;

    return a.cnpj.localeCompare(b.cnpj);
  });
}
