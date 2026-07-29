"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { getProvedorIA } from "@/lib/ia";
import { rankearCandidatos } from "@/lib/similaridade/rankearCandidatos";
import { buscarCandidatosPublicos } from "@/lib/similaridade/buscarCandidatosPublicos";
import { filtrarPorPalavrasChave } from "@/lib/similaridade/filtroPalavrasChave";
import { resolverTermoBusca } from "@/lib/similaridade/extrairTermoBusca";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";
import type { ItemExtraidoTR } from "@/lib/ia/types";
import type { ActionResult } from "./processos";

// Itens são independentes entre si; processá-los em paralelo (com limite) evita que a
// soma das buscas sequenciais no PNCP/Painel de Preços estoure o timeout da função
// serverless quando essas fontes estão instáveis (retries + backoff por item).
const LIMITE_CONCORRENCIA_ITENS = 4;

export interface ItemProcessadoSimilaridade {
  itemId: string;
  descricao: string;
  totalCandidatos: number;
  /** Candidatos encontrados antes do filtro de score mínimo. */
  totalCandidatosEncontrados?: number;
  status: "sucesso" | "erro" | "ignorado";
  erro?: string;
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
  formData: FormData,
): Promise<ActionResult<ResultadoPesquisaSimilaridade>> {
  const user = await requireAuth();

  const trPdfFile = formData.get("trPdf");
  if (!(trPdfFile instanceof File)) {
    return { error: "Selecione o PDF do Termo de Referência." };
  }
  const trPdfBuffer = Buffer.from(await trPdfFile.arrayBuffer());

  const itens = await db.item.findMany({ where: { processoId } });
  if (itens.length === 0) {
    return { error: "Processo sem itens. Sincronize a planilha antes de buscar similaridade." };
  }

  const provedor = getProvedorIA();

  // Executa as duas extrações em paralelo: itens (para similaridade) e contexto
  // (tabela de itens + modelo de execução + materiais, para o assistente).
  let extratos: ItemExtraidoTR[];
  try {
    const [itensExtraidos, contextoTR] = await Promise.all([
      provedor.extrairEspecificacaoTR(trPdfBuffer),
      provedor.extrairContextoTR(trPdfBuffer),
    ]);
    extratos = itensExtraidos;

    // Persiste o contexto do TR no processo para referência permanente do assistente.
    await db.processo.update({
      where: { id: processoId },
      data: { trContexto: JSON.stringify(contextoTR) },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? `Falha ao processar o TR: ${err.message}` : "Falha ao processar o TR.",
    };
  }

  // Cada item busca candidatos pelo seu próprio termo (a busca textual do PNCP é o
  // que torna os resultados relevantes); o cache evita repetir a mesma busca de rede
  // quando vários itens do processo compartilham termo (ex.: variações de cor). Guarda
  // a Promise (não o resultado) para que itens concorrentes com o mesmo termo aguardem
  // a mesma busca em vez de disparar chamadas de rede duplicadas.
  const cacheCandidatosPorTermo = new Map<string, ReturnType<typeof buscarCandidatosPublicos>>();
  function buscarCandidatosComCache(termo: string) {
    const cacheKey = termo.toLowerCase();
    const cacheado = cacheCandidatosPorTermo.get(cacheKey);
    if (cacheado) return cacheado;
    const resultado = buscarCandidatosPublicos(termo);
    cacheCandidatosPorTermo.set(cacheKey, resultado);
    return resultado;
  }

  const mensagensErroPorItem = new Map<string, string>();

  const resultados = await processarComConcorrencia(
    itens,
    LIMITE_CONCORRENCIA_ITENS,
    async (item): Promise<ItemProcessadoSimilaridade> => {
      const jaPromovido = await db.resultadoSimilaridade.findFirst({
        where: { itemId: item.id, promovidoParaFonte: true },
        select: { id: true },
      });

      if (jaPromovido) {
        return {
          itemId: item.id,
          descricao: item.descricao,
          totalCandidatos: 0,
          status: "ignorado",
          erro: "Já possui resultado promovido para a série de preços; não foi reprocessado.",
        };
      }

      const extratoTR = casarItemComExtrato(item.descricao, extratos);
      const itemTR = extratoTR ?? {
        descricao: item.descricao,
        especificacaoTecnica: item.caracteristicasTecnicas ?? "",
        unidade: item.unidade,
        quantidade: item.quantidade,
      };

      // Persiste a especificação técnica extraída do TR no item para que o
      // assistente de IA sempre tenha acesso às especificações do TR via
      // ler_processo, mesmo após o PDF ser descartado.
      if (extratoTR?.especificacaoTecnica && extratoTR.especificacaoTecnica !== item.caracteristicasTecnicas) {
        await db.item.update({
          where: { id: item.id },
          data: { caracteristicasTecnicas: extratoTR.especificacaoTecnica },
        });
      }

      const termoBusca = resolverTermoBusca({
        descricao: item.descricao,
        palavrasChave: item.palavrasChave,
        termoBuscaIA: itemTR.termoBusca,
      });
      const candidatosPublicos = await buscarCandidatosComCache(termoBusca);
      // A busca textual do PNCP retorna editais inteiros (ex.: "material de expediente"
      // completo); o filtro exige a palavra-núcleo do termo (primeiro token) em cada
      // candidato antes de gastar tokens de IA com itens de outra categoria.
      const candidatosFiltrados = filtrarPorPalavrasChave(candidatosPublicos, termoBusca.split(/\s+/));

      const ranqueados = await rankearCandidatos(itemTR, candidatosFiltrados, provedor);

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

      return {
        itemId: item.id,
        descricao: item.descricao,
        totalCandidatos: ranqueados.length,
        totalCandidatosEncontrados: candidatosFiltrados.length,
        status: "sucesso",
      };
    },
    (item, err) => {
      console.error(`[PesquisaSimilaridade] Erro ao processar item ${item.id}:`, err);
      mensagensErroPorItem.set(item.id, err instanceof Error ? err.message : "Falha desconhecida ao processar o item.");
    },
  );

  const itensProcessados: ItemProcessadoSimilaridade[] = resultados.map(
    (resultado, indice) =>
      resultado ?? {
        itemId: itens[indice].id,
        descricao: itens[indice].descricao,
        totalCandidatos: 0,
        status: "erro",
        erro: mensagensErroPorItem.get(itens[indice].id) ?? "Falha desconhecida ao processar o item.",
      },
  );

  await registrarAuditoria({
    userId: user.id,
    processoId,
    acao: "processar_pesquisa_similaridade",
    detalhes: {
      itens: itensProcessados.length,
      sucesso: itensProcessados.filter((i) => i.status === "sucesso").length,
      erro: itensProcessados.filter((i) => i.status === "erro").length,
      ignorado: itensProcessados.filter((i) => i.status === "ignorado").length,
    },
  });

  revalidatePath(`/processos/${processoId}`);

  return { data: { itensProcessados } };
}
