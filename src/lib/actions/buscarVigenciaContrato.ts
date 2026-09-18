"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { buscarContratosDaContratacao } from "@/lib/integracoes/pncp";
import { identidadeDaContratacao } from "@/lib/assistente/sugestoes";
import { lerContratosVigencia, type ContratoVigencia } from "@/lib/domain/contratosVigencia";
import type { ActionResult } from "./processos";

const buscarVigenciaSchema = z.object({
  resultadoId: z.string().cuid(),
});

export interface ResultadoVigencia {
  contratos: ContratoVigencia[];
  buscadaEm: string;
}

/**
 * Busca, sob demanda, a vigência dos contratos que nasceram da contratação de
 * um candidato — e a grava no candidato.
 *
 * **Por que sob demanda, e não durante a pesquisa:** o PNCP não expõe "os
 * contratos desta compra". O único vínculo é o campo `numeroControlePncpCompra`
 * de cada contrato, então é preciso varrer os contratos do órgão no ano e
 * comparar (ver `buscarContratosDaContratacao`). Medido em 2026-09-18: ~500
 * contratos num ano de um município de porte médio, 1,9s para a compra que
 * rende no primeiro ano e 6,1s para a que obriga a varrer dois. Multiplicado
 * pelos até 100 candidatos de um item, isso não cabe em turno nenhum — por
 * clique, cabe com folga.
 *
 * Grava `vigenciaBuscadaEm` mesmo quando não acha contrato: "procurei e não
 * existe" e "ainda não procurei" levam a ações diferentes do analista, e sem a
 * marca a tela não sabe distinguir (CLAUDE.md §9.93).
 */
export async function buscarVigenciaContrato(
  resultadoId: string,
): Promise<ActionResult<ResultadoVigencia>> {
  const user = await requireRole("pesquisa");

  const parsed = buscarVigenciaSchema.safeParse({ resultadoId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // `select` explícito pelo motivo da §9.46: coluna nova do schema pode ainda
  // não existir no banco de produção quando o código sobe.
  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data.resultadoId },
    select: {
      id: true,
      fonteUrl: true,
      contratosVigencia: true,
      vigenciaBuscadaEm: true,
      item: { select: { id: true, processoId: true } },
    },
  });

  if (!resultado) return { error: "Candidato não encontrado" };

  // A identidade sai da URL do edital — é o que o candidato gravado tem.
  // Candidato de outra fonte (Painel de Preços, SINAPI) não casa o padrão e
  // não tem contrato no PNCP para consultar.
  const identidade = identidadeDaContratacao({
    identidadeContratacao: null,
    fonteUrl: resultado.fonteUrl,
  });
  if (!identidade) {
    return { error: "Este candidato não tem link de edital do PNCP — não há contrato a consultar." };
  }

  const contratos = await buscarContratosDaContratacao(identidade);
  if (contratos === null) {
    // Varredura interrompida. NÃO grava nada: gravar vazio aqui registraria
    // "esta compra não gerou contrato", que é afirmação sobre o mundo que a
    // consulta não teve como apurar.
    return {
      error:
        "Não foi possível consultar os contratos no PNCP agora (a consulta não se completou). Tente novamente em instantes.",
    };
  }

  const buscadaEm = new Date();
  await db.resultadoSimilaridade.update({
    where: { id: resultado.id },
    data: {
      // O cast é o que o Prisma exige para gravar array em coluna `Json`; a
      // forma do dado é garantida pelo schema Zod na leitura.
      contratosVigencia: contratos as unknown as Prisma.InputJsonValue,
      vigenciaBuscadaEm: buscadaEm,
    },
  });

  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "buscar_vigencia_contrato",
    detalhes: {
      resultadoId: resultado.id,
      itemId: resultado.item.id,
      contratacao: `${identidade.cnpjOrgao}/${identidade.ano}/${identidade.numeroSequencial}`,
      contratosEncontrados: contratos.length,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return {
    data: { contratos: lerContratosVigencia(contratos), buscadaEm: buscadaEm.toISOString() },
  };
}
