import * as dotenv from "dotenv";

dotenv.config();

import { garantirFontesCatalogoComprasGov } from "../src/lib/ingestao/fontesComprasGov";
import {
  CONFIG_CATALOGO_CATMAT,
  CONFIG_CATALOGO_CATSER,
  ingerirCatalogoComprasGov,
} from "../src/lib/ingestao/catalogoComprasGov";

/**
 * Ingestão administrativa manual dos catálogos CATMAT/CATSER do Compras.gov.br
 * (docs/ApiPlan.md, M16). Uso:
 *
 *   npx tsx scripts/ingerir-catalogo-compras-gov.ts catmat
 *   npx tsx scripts/ingerir-catalogo-compras-gov.ts catser
 *   npx tsx scripts/ingerir-catalogo-compras-gov.ts catmat --max-paginas=3   (teste local)
 *
 * **Por que um script, e não uma rota admin protegida (padrão de
 * `/api/admin/migrate`):** o CATMAT são 688 páginas — uma invocação
 * serverless não caberia numa única requisição, e um job teria que resolver
 * paginação entre invocações sem ganho real sobre rodar localmente sob
 * demanda. Mesmo espírito operacional de `scripts/set-admin-password.mjs`:
 * script standalone, sem exposição de rede — só roda por quem já tem acesso
 * de shell ao ambiente (mesmo modelo de confiança do seed).
 *
 * **Não rodar sem `--max-paginas` contra o banco de produção sem autorização
 * explícita do usuário (CLAUDE.md §8).** A ingestão completa do CATMAT grava
 * 343.880 itens; a `DATABASE_URL` do ambiente decide o banco de destino —
 * conferir antes de rodar sem o limite de páginas.
 */

type FonteArgumento = "catmat" | "catser";

function ehFonteValida(valor: string | undefined): valor is FonteArgumento {
  return valor === "catmat" || valor === "catser";
}

async function main() {
  const argumentoFonte = process.argv[2];
  if (!ehFonteValida(argumentoFonte)) {
    console.error(
      'Uso: tsx scripts/ingerir-catalogo-compras-gov.ts <catmat|catser> [--max-paginas=N]',
    );
    process.exitCode = 1;
    return;
  }

  const argumentoMaxPaginas = process.argv
    .slice(3)
    .find((arg) => arg.startsWith("--max-paginas="))
    ?.split("=")[1];

  let maxPaginas: number | undefined;
  if (argumentoMaxPaginas !== undefined) {
    maxPaginas = Number(argumentoMaxPaginas);
    if (!Number.isInteger(maxPaginas) || maxPaginas <= 0) {
      console.error(`--max-paginas inválido: "${argumentoMaxPaginas}" (esperado inteiro > 0)`);
      process.exitCode = 1;
      return;
    }
  }

  console.log("Garantindo FonteReferencia catmat/catser...");
  await garantirFontesCatalogoComprasGov();

  console.log(
    `Iniciando ingestão de "${argumentoFonte}"` +
      (maxPaginas ? ` (limitada a ${maxPaginas} página(s) — teste local)` : " (catálogo completo)") +
      "...",
  );

  // Ramo explícito em vez de indexar um objeto `{ catmat, catser }`: os dois
  // `ConfigFonteCatalogo<TRaw>` têm `TRaw` diferente, e `ingerirCatalogoComprasGov`
  // é genérica — indexar por uma chave de união faz o TypeScript tentar unificar
  // os dois `TRaw` num só e falhar (TS2345).
  const resumo =
    argumentoFonte === "catmat"
      ? await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, { maxPaginas })
      : await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATSER, { maxPaginas });

  console.log("Concluído:", resumo);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((erro: unknown) => {
    console.error("Falha na ingestão:", erro);
    process.exit(1);
  });
