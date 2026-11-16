"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { registrarMarcosProcesso } from "@/lib/indicadores/marcos";
import { validarDataAberturaInformada } from "@/lib/domain/indicadores/dataAbertura";
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
}

export interface ActionResult<T> {
  data?: T;
  error?: string;
}

/** Normaliza a descrição do item para casamento sem distinção de maiúsculas/acentos. */
function normalizarDescricao(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    // A planilha é fonte de verdade para descrições e preços, mas os
    // ResultadoSimilaridade (pesquisa PNCP) são trabalho do analista e devem
    // ser preservados quando o item ainda existe na nova versão da planilha.
    const itensExistentes = await db.item.findMany({
      where: { processoId: processo.id },
      select: { id: true, descricao: true },
    });

    const existentePorDescricao = new Map(
      itensExistentes.map((it) => [normalizarDescricao(it.descricao), it.id]),
    );

    // Descobre quais itens existentes não aparecem mais na planilha nova e os apaga.
    // O cascade do banco remove os ResultadoSimilaridade associados — o que é correto,
    // pois a pesquisa de similaridade perde o sentido para um item removido.
    const descricoesPlanilha = new Set(itens.map((it) => normalizarDescricao(it.material)));
    const idsParaDeletar = itensExistentes
      .filter((it) => !descricoesPlanilha.has(normalizarDescricao(it.descricao)))
      .map((it) => it.id);
    if (idsParaDeletar.length > 0) {
      await db.item.deleteMany({ where: { id: { in: idsParaDeletar } } });
    }

    // Upsert cada item da planilha:
    // – item já existe → atualiza metadados + recria SeriePreco (preserva similaridade)
    // – item novo      → cria
    for (const item of itens) {
      const chave = normalizarDescricao(item.material);
      const idExistente = existentePorDescricao.get(chave);

      let itemId: string;

      if (idExistente) {
        // Preserva o Item (e seus ResultadoSimilaridade associados) — atualiza só
        // os metadados que a planilha controla.
        await db.item.update({
          where: { id: idExistente },
          data: {
            quantidade: item.quantidade || 1,
            caracteristicasTecnicas: item.grupo ? `Grupo: ${item.grupo}` : null,
            palavrasChave: item.grupo ? [item.grupo] : [],
          },
        });
        // A planilha é fonte de verdade dos preços: recria a série de preços.
        await db.seriePreco.deleteMany({ where: { itemId: idExistente } });
        itemId = idExistente;
      } else {
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
