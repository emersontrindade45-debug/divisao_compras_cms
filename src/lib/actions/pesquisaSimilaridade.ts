"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { getProvedorIA } from "@/lib/ia";
import { rankearCandidatos } from "@/lib/similaridade/rankearCandidatos";
import { buscarCandidatosPublicos } from "@/lib/similaridade/buscarCandidatosPublicos";
import type { ItemExtraidoTR } from "@/lib/ia/types";
import type { ActionResult } from "./processos";

export interface ItemProcessadoSimilaridade {
  itemId: string;
  descricao: string;
  totalCandidatos: number;
}

export interface ResultadoPesquisaSimilaridade {
  itensProcessados: ItemProcessadoSimilaridade[];
}

function casarItemComExtrato(
  descricaoItem: string,
  extratos: ItemExtraidoTR[],
): ItemExtraidoTR | null {
  const normalizado = (s: string) => s.trim().toLowerCase();
  const exato = extratos.find((e) => normalizado(e.descricao) === normalizado(descricaoItem));
  if (exato) return exato;

  const parcial = extratos.find(
    (e) =>
      normalizado(descricaoItem).includes(normalizado(e.descricao)) ||
      normalizado(e.descricao).includes(normalizado(descricaoItem)),
  );
  return parcial ?? null;
}

export async function processarPesquisaSimilaridade(
  processoId: string,
  trPdfBuffer: Buffer,
): Promise<ActionResult<ResultadoPesquisaSimilaridade>> {
  const user = await requireAuth();

  const itens = await db.item.findMany({ where: { processoId } });
  if (itens.length === 0) {
    return { error: "Processo sem itens. Sincronize a planilha antes de buscar similaridade." };
  }

  const provedor = getProvedorIA();

  let extratos: ItemExtraidoTR[];
  try {
    extratos = await provedor.extrairEspecificacaoTR(trPdfBuffer);
  } catch (err) {
    return {
      error: err instanceof Error ? `Falha ao processar o TR: ${err.message}` : "Falha ao processar o TR.",
    };
  }

  const itensProcessados: ItemProcessadoSimilaridade[] = [];

  for (const item of itens) {
    const itemTR = casarItemComExtrato(item.descricao, extratos) ?? {
      descricao: item.descricao,
      especificacaoTecnica: item.caracteristicasTecnicas ?? "",
      unidade: item.unidade,
      quantidade: item.quantidade,
    };

    const candidatos = await buscarCandidatosPublicos(itemTR.descricao);
    const ranqueados = await rankearCandidatos(itemTR, candidatos, provedor);

    await db.resultadoSimilaridade.deleteMany({ where: { itemId: item.id } });

    if (ranqueados.length > 0) {
      await db.resultadoSimilaridade.createMany({
        data: ranqueados.map((r) => ({
          itemId: item.id,
          tipoCandidato: r.candidato.tipoCandidato,
          fonteDescricao: r.candidato.fonteDescricao,
          fonteOrgaoOuId: r.candidato.fonteOrgaoOuId,
          fonteUrl: r.candidato.fonteUrl ?? null,
          valorUnitario: r.candidato.valorUnitario,
          dataReferencia: r.candidato.dataReferencia,
          scoreFinal: r.scoreFinal,
          scoreDescricao: r.scoreDescricao,
          scoreEspecificacao: r.scoreEspecificacao,
          scoreUnidadeQuantidade: r.scoreUnidadeQuantidade,
          adaptado: r.adaptado,
          justificativa: r.justificativa,
        })),
      });
    }

    itensProcessados.push({
      itemId: item.id,
      descricao: item.descricao,
      totalCandidatos: ranqueados.length,
    });
  }

  await registrarAuditoria({
    userId: user.id,
    processoId,
    acao: "processar_pesquisa_similaridade",
    detalhes: { itens: itensProcessados.length },
  });

  revalidatePath(`/processos/${processoId}`);

  return { data: { itensProcessados } };
}
