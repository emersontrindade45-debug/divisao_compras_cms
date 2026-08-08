import { NextResponse } from "next/server";
import { ingerirSinapi } from "@/lib/ingestao/ingerirSinapi";
import type { RegimeSinapi } from "@/lib/ingestao/sinapi";

// Ingestão do relatório de Composições Sintético do SINAPI, por upload manual (M17).
//
//   POST /api/admin/ingerir-sinapi (multipart/form-data)
//     campo "arquivo": o .xlsx do relatório de Composições Sintético
//     campo "regime": "desonerado" | "nao_desonerado"
//
// Upload manual, não download automático — o WAF da Caixa (caixa.gov.br) bloqueia requisição
// automatizada mesmo com headers de navegador completos (confirmado nesta sessão, 429 persistente;
// docs/ApiPlan-M17-spike.md §4, "risco residual"). O operador baixa o ZIP pelo navegador, extrai o
// .xlsx do relatório Sintético e sobe aqui — mesmo espírito de /api/admin/ingerir-catalogo (M16),
// mas sem paginação: um upload processa um arquivo inteiro numa chamada.
//
// Proteção: mesmo segredo (ADMIN_MIGRATE_SECRET) e mesmo padrão fail-closed dos vizinhos
// (CLAUDE.md §9.45) — sem segredo configurado, a rota fica fechada.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generoso o bastante para o parse de um relatório grande (o Analítico chega a ~7MB; o Sintético
// usado aqui é bem menor, ~600KB/7.800 linhas) — folga sobre o observado nesta sessão (< 2s).
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isRegimeValido(valor: FormDataEntryValue | null): valor is RegimeSinapi {
  return valor === "desonerado" || valor === "nao_desonerado";
}

// `instanceof File` diverge entre o `File` global do runtime da rota (Next/Node) e o `File` do
// ambiente de teste (jsdom, usado pela suíte deste projeto) — mesma classe de problema do
// CLAUDE.md §9.38 (API que se comporta diferente dependendo de qual global resolve). Duck typing
// sobre a forma real que a rota usa (`arrayBuffer`) é robusto nos dois ambientes.
function isArquivo(valor: FormDataEntryValue | null): valor is File {
  return (
    valor !== null &&
    typeof valor === "object" &&
    "arrayBuffer" in valor &&
    typeof (valor as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Corpo da requisição não é multipart/form-data válido." },
      { status: 400 },
    );
  }

  const arquivo = form.get("arquivo");
  if (!isArquivo(arquivo)) {
    return NextResponse.json(
      { ok: false, erro: 'Campo "arquivo" (o .xlsx do relatório) é obrigatório.' },
      { status: 400 },
    );
  }

  const regime = form.get("regime");
  if (!isRegimeValido(regime)) {
    return NextResponse.json(
      { ok: false, erro: 'Campo "regime" deve ser "desonerado" ou "nao_desonerado".' },
      { status: 400 },
    );
  }

  try {
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const resumo = await ingerirSinapi({ conteudo, regime });

    return NextResponse.json({
      ok: true,
      resumo,
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
