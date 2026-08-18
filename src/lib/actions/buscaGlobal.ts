import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import type { StatusProcesso } from "@prisma/client";

export interface ProcessoBuscaGlobal {
  id: string;
  numero: string;
  objeto: string;
  status: StatusProcesso;
}

export interface FornecedorBuscaGlobal {
  id: string;
  razaoSocial: string;
  cnpj: string | null;
  cidade: string;
  estado: string;
}

export interface ResultadoBuscaGlobal {
  processos: ProcessoBuscaGlobal[];
  fornecedores: FornecedorBuscaGlobal[];
}

const RESULTADO_VAZIO: ResultadoBuscaGlobal = { processos: [], fornecedores: [] };

/**
 * Busca global da topbar (Processos + Fornecedores). Guardada por sessão via
 * requireAuth; chamada apenas server-side pelo route handler `/api/busca`.
 * Retorna vazio sem tocar o banco quando a query tem menos de 2 caracteres.
 */
export async function buscaGlobal(q: string): Promise<ResultadoBuscaGlobal> {
  await requireAuth();

  const termo = q.trim();
  if (termo.length < 2) return RESULTADO_VAZIO;

  const [processos, fornecedores] = await Promise.all([
    db.processo.findMany({
      where: {
        OR: [
          { objeto: { contains: termo, mode: "insensitive" } },
          { numero: { contains: termo, mode: "insensitive" } },
        ],
      },
      select: { id: true, numero: true, objeto: true, status: true },
      take: 6,
      orderBy: { dataAbertura: "desc" },
    }),
    db.fornecedor.findMany({
      where: {
        OR: [
          { razaoSocial: { contains: termo, mode: "insensitive" } },
          { cnpj: { contains: termo } },
        ],
      },
      select: { id: true, razaoSocial: true, cnpj: true, cidade: true, estado: true },
      take: 6,
      orderBy: { razaoSocial: "asc" },
    }),
  ]);

  return { processos, fornecedores };
}
