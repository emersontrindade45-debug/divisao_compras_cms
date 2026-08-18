import { NextResponse } from "next/server";
import {
  CONFIG_CATALOGO_CATMAT,
  CONFIG_CATALOGO_CATSER,
  ingerirCatalogoComprasGov,
} from "@/lib/ingestao/catalogoComprasGov";
import { garantirFontesCatalogoComprasGov } from "@/lib/ingestao/fontesComprasGov";
import { db } from "@/lib/db";

// Vercel Cron Job — agendado em vercel.json, semanal (segunda-feira — decisão do usuário em
// 2026-08-18: prefere revisar/rodar a carga completa manualmente todo dia 1º do mês, com este cron
// como reforço automático entre uma revisão e outra).
//
// Resync do catálogo CATMAT/CATSER do Compras.gov.br (M16). Não há periodicidade oficial publicada
// para este catálogo — ao contrário do SINAPI (mensal, documentado), o CATMAT/CATSER é mantido de
// forma contínua via pedidos de catalogação, sem calendário de release. Medido contra a API real em
// 2026-08-18 (amostra de 21 páginas do CATMAT espalhadas pelas 688, 10.380 itens): ~2,3% tinham
// `dataHoraAtualizacao` nos últimos 30 dias.
//
// Por que não uma execução mensal única: uma ingestão completa do CATMAT mede ~13 min (688
// páginas, medido nesta mesma sessão) — muito acima do teto de 60s do plano Hobby (mesmo teto de
// `/api/admin/ingerir-catalogo`, `/api/jobs/lembretes` etc.). Esta rota roda semanalmente e processa
// só uma fatia (`PAGINAS_POR_EXECUCAO_CATMAT`), retomando de onde o lote anterior parou — o mesmo
// desenho da rota administrativa, só que automático e com cursor derivado do banco em vez de
// parâmetro de URL. 688/90 ≈ 7,6 semanas ≈ ~1,9 meses por volta completa — mais rápido que uma
// execução diária de 23 páginas (~30 dias) porque a concorrência de páginas também subiu (ver
// `CONCORRENCIA_CATMAT` abaixo): o gargalo medido é a latência de rede até o Compras.gov, não o
// banco, e mais paralelismo ataca isso diretamente. Este job também serve como ferramenta manual —
// chamar a rota repetidas vezes (ela sempre retoma do cursor salvo) equivale à carga completa que o
// usuário roda por conta própria todo dia 1º.
//
// CATSER (7 páginas) é pequeno o bastante para revarrer inteiro a cada execução, sem cursor.
//
// Modo de escrita "upsert" (não "inserir"/`skipDuplicates`, usado na carga inicial via
// `/api/admin/ingerir-catalogo`): sem isso, um item já ingerido que muda de descrição/classe/status
// no Compras.gov nunca seria atualizado — o resync existiria só no nome. Ver `ModoEscritaCatalogo`
// em `catalogoComprasGov.ts`.
//
// Proteção: header `Authorization: Bearer <CRON_SECRET>`, que a Vercel envia automaticamente às
// rotas de cron quando a variável existe no projeto — mesmo padrão fail-closed de
// `/api/jobs/lembretes` (CLAUDE.md §9.45): sem segredo configurado, a rota fica fechada.

// A rota consulta o banco (cursor do último lote) — nunca pode ser avaliada em build time, mesmo
// motivo de `/api/jobs/lembretes` (CLAUDE.md §9.54).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Calibrado contra a API real + Postgres local, não é um chute (CLAUDE.md §9.69). Progressão
 * medida nesta sessão (7 páginas de CATSER + N de CATMAT, upsert em lote via SQL):
 *
 * | páginas CATMAT | concorrência | tempo total (local) |
 * |---:|---:|---:|
 * |  23 |  5 (padrão) | ~22s |
 * |  60 |  5 (padrão) | ~69s — **estoura os 60s do Hobby** |
 * |  60 | 10           | ~22s |
 * |  90 | 10           | ~27s |
 * | 120 | 20           | ~57s — sem folga, descartado |
 *
 * O gargalo é a latência de rede até o Compras.gov (fetch de página), não a escrita no banco —
 * por isso mais concorrência de página (`CONCORRENCIA_CATMAT` abaixo) rende mais que só aumentar o
 * lote. Fixado em 90 páginas / concorrência 10: ~27s medido, folga de mais da metade do teto mesmo
 * sem contar a latência adicional que a produção vai ter e este teste local não captura.
 */
const PAGINAS_POR_EXECUCAO_CATMAT = 90;
const CONCORRENCIA_CATMAT = 10;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// `LoteIngestao.urlArquivo` do catálogo grava `...?pagina=<inicial>-<final>` (ver
// `catalogoComprasGov.ts`) — não é uma URL de fato navegável para este tipo de fonte, é onde o
// cursor deste job é lido de volta.
const REGEX_PAGINA_FINAL = /[?&]pagina=\d+-(\d+)/;

/** Próxima página do CATMAT a processar, a partir do último `LoteIngestao` gravado. 1 se não houver nenhum. */
async function proximaPaginaCatmat(): Promise<number> {
  const ultimoLote = await db.loteIngestao.findFirst({
    where: { fonteReferencia: { chave: "catmat" } },
    orderBy: { iniciadoEm: "desc" },
    select: { urlArquivo: true },
  });
  const match = ultimoLote?.urlArquivo.match(REGEX_PAGINA_FINAL);
  if (!match) return 1;
  return Number(match[1]) + 1;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await garantirFontesCatalogoComprasGov();

  const catser = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATSER, {
    modoEscrita: "upsert",
  });

  const cursor = await proximaPaginaCatmat();
  let catmat = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, {
    paginaInicial: cursor,
    maxPaginas: PAGINAS_POR_EXECUCAO_CATMAT,
    modoEscrita: "upsert",
    concorrencia: CONCORRENCIA_CATMAT,
  });

  // Cursor passou do fim do catálogo — dá a volta e recomeça pela página 1 na mesma execução, em
  // vez de desperdiçar a chamada de hoje e só produzir o primeiro lote do novo ciclo amanhã.
  if (catmat.paginaInicial > catmat.totalPaginasCatalogo) {
    catmat = await ingerirCatalogoComprasGov(CONFIG_CATALOGO_CATMAT, {
      paginaInicial: 1,
      maxPaginas: PAGINAS_POR_EXECUCAO_CATMAT,
      modoEscrita: "upsert",
      concorrencia: CONCORRENCIA_CATMAT,
    });
  }

  return NextResponse.json({
    catser,
    catmat,
    executadoEm: new Date().toISOString(),
  });
}
