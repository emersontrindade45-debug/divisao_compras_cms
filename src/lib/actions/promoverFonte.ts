"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { mapTipoCandidatoParaFonte } from "@/lib/domain/tipoFonteSimilaridade";
import type { ActionResult } from "./processos";

const promoverSchema = z.object({
  resultadoId: z.string().cuid(),
});

/**
 * Promove um candidato de contratação pública similar
 * (`ResultadoSimilaridade`) para uma Fonte oficial da estimativa.
 *
 * Conformidade IN 65/2021: um preço só entra na estimativa com
 * fonte + data + evidência. Por isso a `Fonte` e a `Evidencia` são criadas
 * ATOMICAMENTE numa única transação; sem a evidência, a regra R-02
 * (`validarEvidenciasFontes`) bloquearia a consolidação. Toda promoção é
 * auditada (CLAUDE.md §8).
 */
export async function promoverResultadoSimilaridade(
  resultadoId: string,
): Promise<ActionResult<{ fonteId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = promoverSchema.safeParse({ resultadoId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data.resultadoId },
    include: { item: { select: { id: true, processoId: true } } },
  });

  if (!resultado) return { error: "Candidato não encontrado" };
  if (resultado.promovidoParaFonte) return { error: "Este candidato já foi promovido" };

  const itemId = resultado.item.id;
  const tipoFonte = mapTipoCandidatoParaFonte(resultado.tipoCandidato);
  const scoreFinal = Number(resultado.scoreFinal);

  const fonteId = await db.$transaction(async (tx) => {
    // 1. Fonte — espelha os campos de fontes.ts:criarFonte.
    const fonte = await tx.fonte.create({
      data: {
        itemId,
        tipo: tipoFonte,
        descricao: resultado.fonteDescricao,
        orgaoOuFornecedor: resultado.fonteOrgaoOuId,
        dataReferencia: resultado.dataReferencia,
        valorUnitario: resultado.valorUnitario,
      },
    });

    // 2. Evidencia — obrigatória para satisfazer R-02 (fonte+data+evidência).
    await tx.evidencia.create({
      data: {
        fonteId: fonte.id,
        dataHoraAcesso: new Date(),
        url: resultado.fonteUrl ?? null,
        descricao: `Contratação pública similar (score ${scoreFinal.toFixed(0)}) — ${resultado.justificativa}`,
      },
    });

    // 3. SeriePreco do item — reaproveita a existente ou cria zerada
    //    (mirror de precos.ts:criarSeriePreco).
    let serie = await tx.seriePreco.findFirst({ where: { itemId } });
    if (!serie) {
      serie = await tx.seriePreco.create({
        data: {
          itemId,
          metodo: "media",
          valorEstimado: 0,
          media: 0,
          mediana: 0,
          menorValor: 0,
          coeficienteVariacao: 0,
          totalPrecos: 0,
          precosIncluidos: 0,
        },
      });
    }

    // 4. PrecoConsolidado — espelha o create de precos.ts:adicionarPreco.
    await tx.precoConsolidado.create({
      data: {
        seriePrecoId: serie.id,
        fonte: tipoFonte,
        descricaoFonte: resultado.fonteDescricao,
        fornecedorOuOrgao: resultado.fonteOrgaoOuId,
        dataReferencia: resultado.dataReferencia,
        valorUnitario: resultado.valorUnitario,
      },
    });

    // 5. Marca o candidato como promovido.
    await tx.resultadoSimilaridade.update({
      where: { id: resultado.id },
      data: { promovidoParaFonte: true },
    });

    return fonte.id;
  });

  // Auditoria roda fora da transação, seguindo o padrão do projeto
  // (fontes.ts / precos.ts registram a auditoria após o create).
  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "promover_resultado_similaridade",
    detalhes: { resultadoId: resultado.id, fonteId, itemId, scoreFinal },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { fonteId } };
}
