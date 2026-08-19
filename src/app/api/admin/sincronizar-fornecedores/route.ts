import { NextResponse } from "next/server";
import { extrairSpreadsheetId, csvUrl, fetchText } from "@/lib/sheets/googleSheets";
import { sincronizarFornecedores } from "@/lib/ingestao/sincronizarFornecedores";

// Sincronização manual do cadastro de Fornecedor com a planilha Google de fornecedores (M24),
// sob demanda — mesmo espírito de /api/admin/migrate e /api/admin/ingerir-catalogo (CLAUDE.md §9.7).
// Lê a planilha inteira (~5.600 linhas) numa chamada só: diferente do catálogo CATMAT/CATSER
// (paginado pela API do Compras.gov), aqui a fonte é um único CSV público via endpoint gviz —
// uma requisição HTTP, sem paginação por página de resultado.
//
//   POST /api/admin/sincronizar-fornecedores
//
// Proteção: header `Authorization: Bearer <ADMIN_MIGRATE_SECRET>` — reusa o mesmo segredo das
// outras rotas administrativas, mesmo padrão fail-closed (CLAUDE.md §9.45): sem segredo
// configurado, a rota fica fechada.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const planilhaUrl = process.env.FORNECEDORES_SHEETS_URL;
  if (!planilhaUrl) {
    return NextResponse.json(
      { ok: false, erro: "FORNECEDORES_SHEETS_URL não está configurada." },
      { status: 500 },
    );
  }

  try {
    const spreadsheetId = extrairSpreadsheetId(planilhaUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { ok: false, erro: "FORNECEDORES_SHEETS_URL não é uma URL de planilha Google válida." },
        { status: 500 },
      );
    }

    const csv = await fetchText(csvUrl(spreadsheetId, "0"));
    const resultado = await sincronizarFornecedores({ csv, origem: "manual" });

    return NextResponse.json({
      ok: true,
      ...resultado,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        erro: error instanceof Error ? error.message : String(error),
        executadoEm: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
