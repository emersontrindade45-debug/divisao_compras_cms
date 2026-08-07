import { NextResponse } from "next/server";
import {
  CONFIG_CATALOGO_CATMAT,
  CONFIG_CATALOGO_CATSER,
  ingerirCatalogoComprasGov,
} from "@/lib/ingestao/catalogoComprasGov";
import { garantirFontesCatalogoComprasGov } from "@/lib/ingestao/fontesComprasGov";

// Ingestão do catálogo CATMAT/CATSER em produção, sob demanda (M16, mesmo espírito do
// /api/admin/migrate — CLAUDE.md §9.7). O CATMAT tem 688 páginas e a API externa mede 22-40s de
// latência fria (docs/ApiPlan.md §4.1e); uma invocação só nunca cobriria o catálogo inteiro dentro
// do teto de execução serverless (CLAUDE.md §9.11). Esta rota processa um lote pequeno de páginas
// por chamada e devolve onde parou — o chamador (script/loop externo) decide se continua.
//
//   POST /api/admin/ingerir-catalogo?fonte=catmat&paginaInicial=1&paginas=15
//
// Resposta inclui `paginaFinal` e `totalPaginasCatalogo`: `concluido: true` quando
// `paginaFinal >= totalPaginasCatalogo` — sinal para o chamador parar de pedir mais lotes.
//
// Proteção: header `Authorization: Bearer <ADMIN_MIGRATE_SECRET>` — reusa o mesmo segredo do
// /api/admin/migrate (já configurado em produção) em vez de introduzir um novo, mesmo padrão
// fail-closed (CLAUDE.md §9.45): sem segredo configurado, a rota fica fechada.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generoso o bastante para absorver a latência fria da API externa (até 40s) num lote pequeno de
// páginas; mesmo teto já usado em src/app/api/assistente/chat/route.ts nesta base de código.
export const maxDuration = 60;

type FonteCatalogo = "catmat" | "catser";

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isFonteValida(valor: string | null): valor is FonteCatalogo {
  return valor === "catmat" || valor === "catser";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fonteParam = url.searchParams.get("fonte");
  if (!isFonteValida(fonteParam)) {
    return NextResponse.json(
      { ok: false, erro: 'Parâmetro "fonte" deve ser "catmat" ou "catser".' },
      { status: 400 },
    );
  }

  const paginaInicial = Number(url.searchParams.get("paginaInicial") ?? "1");
  const paginas = Number(url.searchParams.get("paginas") ?? "15");
  if (
    !Number.isInteger(paginaInicial) ||
    paginaInicial < 1 ||
    !Number.isInteger(paginas) ||
    paginas < 1
  ) {
    return NextResponse.json(
      { ok: false, erro: '"paginaInicial" e "paginas" devem ser inteiros positivos.' },
      { status: 400 },
    );
  }
  // Teto no tamanho do lote: sem isso, um valor grande (erro de digitação ou uso indevido) estoura
  // maxDuration antes de terminar — a rota falharia a meio de um lote de páginas, sem controle
  // sobre quantas já foram gravadas. Bem acima do que um lote de 60s comporta com folga.
  const MAX_PAGINAS_POR_CHAMADA = 40;
  if (paginas > MAX_PAGINAS_POR_CHAMADA) {
    return NextResponse.json(
      { ok: false, erro: `"paginas" não pode passar de ${MAX_PAGINAS_POR_CHAMADA} por chamada.` },
      { status: 400 },
    );
  }

  try {
    // Idempotente (upsert) — seguro chamar em todo lote, evita exigir uma chamada de setup à parte.
    await garantirFontesCatalogoComprasGov();

    // `if`/`else` em vez de indexar um objeto de configs: a união dos dois `ConfigFonteCatalogo<T>`
    // não é atribuível ao genérico de `ingerirCatalogoComprasGov` (cada T tem um schema Zod
    // diferente) — o compilador só narrowa corretamente por branch, não por lookup de mapa.
    const resumo =
      fonteParam === "catmat"
        ? await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, {
            paginaInicial,
            maxPaginas: paginas,
          })
        : await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATSER, {
            paginaInicial,
            maxPaginas: paginas,
          });

    return NextResponse.json({
      ok: true,
      concluido: resumo.paginaFinal >= resumo.totalPaginasCatalogo,
      proximaPagina: resumo.paginaFinal + 1,
      ...resumo,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        fonte: fonteParam,
        paginaInicial,
        erro: error instanceof Error ? error.message : String(error),
        executadoEm: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
