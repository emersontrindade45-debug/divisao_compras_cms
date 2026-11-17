"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { registrarMarcosProcesso } from "@/lib/indicadores/marcos";
import { validarDataAberturaInformada } from "@/lib/domain/indicadores/dataAbertura";
import { planejarItens } from "@/lib/domain/planilha/planejarItens";
import { carregarPlanilha, extrairObjetoDoTitulo } from "@/lib/sheets/googleSheets";
import {
  parsePlanilha,
  estatisticaDoItem,
  explicarAusenciaDeItens,
} from "@/lib/sheets/parsePlanilha";

export interface SincronizacaoResultado {
  numero: string;
  itensImportados: number;
  precosImportados: number;
  /** Itens cuja descrição mudou na planilha e foram renomeados no lugar (candidatos preservados). */
  itensRenomeados?: number;
  /** Itens com candidatos/fontes que saíram da planilha: continuam no sistema, sem ordem. */
  itensPreservados?: number;
}

export interface ActionResult<T> {
  data?: T;
  error?: string;
}

/**
 * @param dataAberturaInformada data de abertura confirmada pelo analista
 *   (`AAAA-MM-DD`). Só vale na PRIMEIRA importação do processo; ausente, o
 *   processo nasce com a hora da importação e `dataAberturaOrigem = importacao`,
 *   ficando fora das métricas de tempo do dashboard (M30.0).
 */
export async function sincronizarPlanilha(
  url: string,
  dataAberturaInformada?: string,
): Promise<ActionResult<SincronizacaoResultado>> {
  const user = await requireAuth();

  if (!url || !url.trim()) {
    return { error: "Informe o link da planilha do Google Sheets." };
  }

  const agora = new Date();
  let dataAbertura: Date | null = null;
  if (dataAberturaInformada) {
    const validada = validarDataAberturaInformada(dataAberturaInformada, agora);
    if (!validada.ok) return { error: validada.erro };
    dataAbertura = validada.data;
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
    return { error: explicarAusenciaDeItens(carregada.rows) };
  }

  // Preferência: parte descritiva do título do arquivo do Google Sheets.
  // Fallback: primeiro material (comportamento anterior).
  const tituloDescritivo = extrairObjetoDoTitulo(carregada.titulo);
  const objeto = tituloDescritivo
    ? tituloDescritivo.slice(0, 240)
    : itens.length === 1
      ? itens[0]!.material.slice(0, 240)
      : `${itens[0]!.material.slice(0, 200)} (+${itens.length - 1} itens)`;
  const quantidadeTotal = itens.reduce((acc, it) => acc + (it.quantidade || 0), 0) || itens.length;

  let precosImportados = 0;
  let itensRenomeados = 0;
  let itensPreservados = 0;

  try {
    const processo = await db.processo.upsert({
      where: { numero },
      update: { objeto, quantidade: quantidadeTotal, planilhaOrigemUrl: url.trim() },
      create: {
        numero,
        objeto,
        unidade: "unidade",
        quantidade: quantidadeTotal,
        caracteristicasTecnicas: `Importado da planilha: ${carregada.titulo ?? numero}`,
        palavrasChave: [],
        classificacao: "comum",
        // Responsável padrão = quem importou (M30.0); editável depois.
        responsavel: user.name,
        responsavelId: user.id,
        status: "pendente",
        dataAbertura: dataAbertura ?? agora,
        dataAberturaOrigem: dataAbertura ? "informada" : "importacao",
        // Planilha que já chega com preço: a pesquisa aconteceu antes e fora do
        // sistema, então não há como saber QUANDO a primeira referência veio.
        marcosIncertos: itens.some((it) => it.precos.length > 0),
        planilhaOrigemUrl: url.trim(),
      },
    });

    // Carrega os itens que já existem no banco para este processo.
    // A planilha é fonte de verdade para descrições, preços e ORDEM, mas os
    // ResultadoSimilaridade (pesquisa PNCP) e as fontes são trabalho do analista e não podem
    // ser perdidos por uma edição de texto na planilha (ver `planejarItens`).
    const itensExistentes = await db.item.findMany({
      where: { processoId: processo.id },
      select: {
        id: true,
        descricao: true,
        ordem: true,
        _count: { select: { resultadosSimilaridade: true, fontes: true } },
      },
    });

    const plano = planejarItens(
      itensExistentes.map((it) => ({
        id: it.id,
        descricao: it.descricao,
        ordem: it.ordem,
        temTrabalho: it._count.resultadosSimilaridade > 0 || it._count.fontes > 0,
      })),
      itens.map((it) => it.material),
    );

    itensRenomeados = plano.itens.filter((p) => p.acao === "renomear").length;
    itensPreservados = plano.preservar.length;

    // Só apaga item SEM trabalho ligado: o cascade do banco leva os candidatos junto.
    if (plano.apagar.length > 0) {
      await db.item.deleteMany({ where: { id: { in: plano.apagar } } });
    }
    // Item com trabalho que saiu da planilha e não tem par fica no sistema, fora da ordem.
    if (plano.preservar.length > 0) {
      await db.item.updateMany({ where: { id: { in: plano.preservar } }, data: { ordem: null } });
    }

    // Aplica o plano linha a linha da planilha:
    // – casa por descrição → atualiza metadados + ordem e recria SeriePreco (preserva similaridade)
    // – descrição editada na mesma posição → renomeia o item (preserva similaridade)
    // – item novo → cria
    for (const [indice, item] of itens.entries()) {
      const passo = plano.itens[indice]!;
      const metadados = {
        quantidade: item.quantidade || 1,
        caracteristicasTecnicas: item.grupo ? `Grupo: ${item.grupo}` : null,
        palavrasChave: item.grupo ? [item.grupo] : [],
        ordem: passo.ordem,
      };

      let itemId: string;

      if (passo.acao === "atualizar" || passo.acao === "renomear") {
        // Preserva o Item (e seus ResultadoSimilaridade associados) — atualiza só
        // o que a planilha controla.
        await db.item.update({
          where: { id: passo.itemId },
          data: passo.acao === "renomear" ? { ...metadados, descricao: item.material } : metadados,
        });
        // A planilha é fonte de verdade dos preços: recria a série de preços.
        await db.seriePreco.deleteMany({ where: { itemId: passo.itemId } });
        itemId = passo.itemId;
      } else {
        const criado = await db.item.create({
          data: {
            processoId: processo.id,
            descricao: item.material,
            unidade: "unidade",
            classificacao: "comum",
            ...metadados,
          },
        });
        itemId = criado.id;
      }

      const estat = estatisticaDoItem(item);
      if (!estat || item.precos.length === 0) continue;

      await db.seriePreco.create({
        data: {
          itemId,
          metodo: "media",
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

    // Marcos de tempo (M30.0). A sync não roda numa transação única (são N
    // escritas por item), então o marco é gravado ao fim: o instante é o da
    // sincronização que trouxe o preço para o sistema.
    await registrarMarcosProcesso(db, processo.id, agora);

    await registrarAuditoria({
      userId: user.id,
      acao: "sincronizar_planilha",
      processoId: processo.id,
      detalhes: {
        numero,
        itens: itens.length,
        precos: precosImportados,
        itensRenomeados,
        itensPreservados,
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
    data: {
      numero,
      itensImportados: itens.length,
      precosImportados,
      ...(itensRenomeados > 0 ? { itensRenomeados } : {}),
      ...(itensPreservados > 0 ? { itensPreservados } : {}),
    },
  };
}
