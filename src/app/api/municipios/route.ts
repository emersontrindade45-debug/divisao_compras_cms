import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { buscarMunicipios } from "@/lib/domain/municipios/municipios";

// Depende de sessão + query: nunca deve ser cacheado.
export const dynamic = "force-dynamic";

/**
 * Busca de cidades para o filtro do assistente. Fica no servidor para não
 * mandar a lista inteira do IBGE (5.571 municípios, ~170 KB) ao navegador só
 * para abrir um dropdown.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  return NextResponse.json({ municipios: buscarMunicipios(q, 20) });
}
