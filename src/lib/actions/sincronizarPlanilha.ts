"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { carregarPlanilha } from "@/lib/sheets/googleSheets";
import { parsePlanilha, estatisticaDoItem } from "@/lib/sheets/parsePlanilha";

export interface SincronizacaoResultado {
  numero: string;
  itensImportados: number;
  precosImportados: number;
}

export interface ActionResult<T> {
  data?: T;
  error?: string;
}

export async function sincronizarPlanilha(
  url: string,
): Promise<ActionResult<SincronizacaoResultado>> {
  const user = await requireAuth();

  if (!url || !url.trim()) {
    return { error: "Informe o link da planilha do Google Sheets." };
  }

  let carregada;
  try {
    carregada = await carregarPlanilha(url.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao ler a planilha." };
  }

  const numero = carregada.numeroProcesso;
  if (!numero) {
    return {
      error:
        "Não foi possível identificar o número do processo no nome do arquivo. Renomeie a planilha incluindo, por exemplo, 'Proc_2433/2025'.",
    };
  }

  const { itens } = parsePlanilha(carregada.rows);
  if (itens.length === 0) {
    return { error: "Nenhum item encontrado na planilha." };
  }

  const objeto =
    itens.length === 1
      ? itens[0]!.material.slice(0, 240)
      : `${itens[0]!.material.slice(0, 200)} (+${itens.length - 1} itens)`;
  const quantidadeTotal = itens.reduce((acc, it) => acc + (it.quantidade || 0), 0) || itens.length;

  let precosImportados = 0;

  try {
    const processo = await db.processo.upsert({
      where: { numero },
      update: { objeto, quantidade: quantidadeTotal },
      create: {
        numero,
        objeto,
        unidade: "unidade",
        quantidade: quantidadeTotal,
        caracteristicasTecnicas: `Importado da planilha: ${carregada.titulo ?? numero}`,
        palavrasChave: [],
        classificacao: "comum",
        responsavel: "Importado da planilha",
        status: "pendente",
        dataAbertura: new Date(),
      },
    });

    // a planilha é a fonte de verdade dos itens/preços: recria a partir do zero
    await db.item.deleteMany({ where: { processoId: processo.id } });

    for (const item of itens) {
      const criado = await db.item.create({
        data: {
          processoId: processo.id,
          descricao: item.material,
          unidade: "unidade",
          quantidade: item.quantidade || 1,
          classificacao: "comum",
          caracteristicasTecnicas: item.grupo ? `Grupo: ${item.grupo}` : null,
          palavrasChave: item.grupo ? [item.grupo] : [],
        },
      });

      const estat = estatisticaDoItem(item);
      if (!estat || item.precos.length === 0) continue;

      await db.seriePreco.create({
        data: {
          itemId: criado.id,
          metodo: "mediana",
          valorEstimado: estat.valorEstimado,
          media: estat.media,
          mediana: estat.mediana,
          menorValor: estat.menorValor,
          coeficienteVariacao: estat.coeficienteVariacao,
          totalPrecos: estat.totalPrecos,
          precosIncluidos: estat.precosIncluidos,
          precos: {
            create: item.precos.map((p) => ({
              fonte: p.tipoFonte,
              descricaoFonte: p.label,
              fornecedorOuOrgao: "Não informado",
              dataReferencia: processo.dataAbertura,
              valorUnitario: p.valor,
              status: p.incluido ? "incluido" : "excluido",
              motivoExclusao: p.motivoExclusao ?? null,
            })),
          },
        },
      });

      precosImportados += item.precos.length;
    }

    await registrarAuditoria({
      userId: user.id,
      acao: "sincronizar_planilha",
      processoId: processo.id,
      detalhes: {
        numero,
        itens: itens.length,
        precos: precosImportados,
        origem: url.trim(),
      },
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Erro ao gravar no banco: ${err.message}`
          : "Erro ao gravar no banco.",
    };
  }

  revalidatePath("/processos");

  return {
    data: { numero, itensImportados: itens.length, precosImportados },
  };
}
