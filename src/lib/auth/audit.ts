import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

interface AuditOptions {
  userId: string;
  acao: string;
  processoId?: string;
  cotacaoId?: string;
  detalhes?: Record<string, unknown>;
}

export async function registrarAuditoria(opts: AuditOptions): Promise<void> {
  const detalhes = opts.detalhes !== undefined
    ? (opts.detalhes as Prisma.InputJsonValue)
    : undefined;

  await db.auditLog.create({
    data: {
      userId: opts.userId,
      acao: opts.acao,
      processoId: opts.processoId,
      cotacaoId: opts.cotacaoId,
      detalhes,
    },
  });
}
