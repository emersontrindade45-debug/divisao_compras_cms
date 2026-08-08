import { db } from "@/lib/db";

/**
 * Upsert idempotente da `FonteReferencia` "sinapi". Roda antes de qualquer
 * ingestão do SINAPI — sem isso, `executarIngestao` (`runner.ts`) falha com
 * "Fonte de referência não cadastrada".
 *
 * **Sem `import "server-only"`, mesmo padrão de `fontesComprasGov.ts` (M16)** —
 * decisão deliberada: este módulo é chamado por script administrativo via
 * `tsx`, fora do bundler do Next, onde `server-only` lançaria exceção ao ser
 * importado. Não é alcançável a partir de `components/`.
 *
 * `baseLegal` aqui **é** o inciso exato, ao contrário do CATMAT/CATSER
 * (`fontesComprasGov.ts`, que registra o enquadramento como "não verificado"):
 * o spike do M17 (`docs/ApiPlan-M17-spike.md` §3) confirmou por fonte primária
 * que a IN 65/2021 não regula obras/serviços de engenharia — quem rege é
 * diretamente a Lei 14.133/2021, art. 23 §2º, I, com o dever de manutenção do
 * SINAPI vindo do Decreto 7.983/2013.
 */

const BASE_LEGAL_SINAPI =
  "Lei 14.133/2021, art. 23, § 2º, inciso I — parâmetro obrigatório e prioritário (\"na seguinte " +
  "ordem\") de custo unitário para obras e serviços de engenharia, à frente de tabela/mídia " +
  "especializada e de contratações similares. A IN SEGES/ME 65/2021 não se aplica a este caso " +
  "(art. 1º, §1º da própria IN). Dever de manutenção do SINAPI pela Caixa: Decreto 7.983/2013, " +
  "art. 3º, parágrafo único (vigência formal pós-14.133 não confirmada — docs/ApiPlan-M17-spike.md §3.3).";

/**
 * Garante que a `FonteReferencia` "sinapi" exista, sem duplicar nem
 * sobrescrever campos ajustados manualmente em execuções seguintes.
 */
export async function garantirFonteSinapi(): Promise<void> {
  await db.fonteReferencia.upsert({
    where: { chave: "sinapi" },
    update: {},
    create: {
      chave: "sinapi",
      nome: "SINAPI — Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil (Caixa)",
      esfera: "federal",
      baseLegal: BASE_LEGAL_SINAPI,
      urlOficial: "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
      periodicidade:
        "mensal, com atrasos recorrentes documentados (docs/ApiPlan-M17-spike.md §1.6/§1.7)",
      ativa: true,
    },
    select: { id: true },
  });
}
