import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { buscaGlobal } from "@/lib/actions/buscaGlobal";

// Depende de sessão + query: nunca deve ser cacheado.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Espelha o guard de sessão das rotas autenticadas, mas responde 401 JSON
  // em vez de redirecionar (route handler não deve redirecionar uma chamada fetch).
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.trim().slice(0, 100);

  const resultado = await buscaGlobal(q);

  return NextResponse.json(resultado);
}
