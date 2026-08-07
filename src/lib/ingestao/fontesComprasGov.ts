import { db } from "@/lib/db";

/**
 * Upsert idempotente das `FonteReferencia` dos catálogos do Compras.gov.br
 * (CATMAT/CATSER). Roda antes de qualquer ingestão de catálogo — sem isso,
 * `ingerirCatalogoComprasGov` (`catalogoComprasGov.ts`) falha com "Fonte de
 * referência não cadastrada", mesma exigência do runner genérico do M15
 * (`runner.ts`).
 *
 * **Sem `import "server-only"`, ao contrário dos vizinhos deste diretório —
 * decisão deliberada, não esquecimento.** Este módulo (e `catalogoComprasGov.ts`)
 * é chamado pelo script administrativo `scripts/ingerir-catalogo-compras-gov.ts`
 * via `tsx`, fora do bundler do Next. O pacote `server-only` resolve para um
 * módulo que **lança exceção ao ser importado**, a não ser que o resolvedor
 * declare a condição `react-server` (é assim que o Next marca "isto está
 * dentro do bundle de servidor"); `tsx`/Node puro nunca declaram essa condição,
 * então `import "server-only"` aqui quebraria o script imediatamente. Nenhum
 * dos dois módulos é importado por `components/`, então o risco que o marcador
 * existe para prevenir (vazar acesso a banco para um bundle de cliente) não
 * se aplica aqui.
 *
 * Idempotente por dois mecanismos: a constraint `@@unique` em
 * `FonteReferencia.chave` (banco) e `update: {}` no upsert (aplicação) — rodar
 * duas vezes não duplica nem sobrescreve um `ativa: false` que um administrador
 * tenha ajustado manualmente depois do cadastro inicial.
 *
 * **Enquadramento legal não verificado artigo a artigo.** `baseLegal` fica
 * genérico de propósito: o Compras.gov.br é a base de catálogo nacional
 * (CATMAT/CATSER) operada pelo governo federal e citada pela IN SEGES/ME
 * 65/2021 como fonte de pesquisa de preço, mas o inciso/redação exatos não
 * foram conferidos contra o texto vigente da lei — CLAUDE.md §9.35 (premissa
 * não verificada não vira afirmação categórica). Conferir antes de citar em
 * instrução processual.
 */

interface DefinicaoFonteCatalogo {
  chave: "catmat" | "catser";
  nome: string;
}

const FONTES_CATALOGO_COMPRAS_GOV: DefinicaoFonteCatalogo[] = [
  { chave: "catmat", nome: "CATMAT — Catálogo de Materiais (Compras.gov.br)" },
  { chave: "catser", nome: "CATSER — Catálogo de Serviços (Compras.gov.br)" },
];

const BASE_LEGAL_COMPRAS_GOV =
  "Catálogo oficial de materiais/serviços do governo federal (Compras.gov.br), usado como " +
  "referência de preço no âmbito da Lei 14.133/2021 e da IN SEGES/ME 65/2021 — enquadramento " +
  "fino (inciso/artigo específico) não verificado (CLAUDE.md §9.35).";

/**
 * Garante que as `FonteReferencia` "catmat" e "catser" existam, sem duplicar
 * nem sobrescrever campos ajustados manualmente em execuções seguintes.
 */
export async function garantirFontesCatalogoComprasGov(): Promise<void> {
  for (const fonte of FONTES_CATALOGO_COMPRAS_GOV) {
    await db.fonteReferencia.upsert({
      where: { chave: fonte.chave },
      update: {},
      create: {
        chave: fonte.chave,
        nome: fonte.nome,
        esfera: "federal",
        baseLegal: BASE_LEGAL_COMPRAS_GOV,
        urlOficial: "https://dadosabertos.compras.gov.br",
        periodicidade: "contínua (catálogo vivo, sem competência mensal)",
        ativa: true,
      },
      select: { id: true },
    });
  }
}
