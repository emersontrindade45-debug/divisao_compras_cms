import "server-only";
import { db } from "@/lib/db";
import { linkDoGmail } from "@/lib/domain/cotacaoEmail/gmail";
import {
  ehClasse,
  ordenarAmostra,
  resumirConferencias,
  type ResumoConferencia,
} from "@/lib/domain/cotacaoEmail/conferenciaIa";
import type { ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";

/**
 * Conferência das classificações da IA (M30.d). O analista abre a resposta no Gmail (o texto nunca
 * passa por aqui), diz qual era a classe certa, e o sistema calcula a taxa de acerto.
 *
 * É MEDIÇÃO: nada aqui altera consulta, fila ou dashboard. Os `select` são explícitos (§9.46) e a
 * leitura fica visível quando falha (§9.93): se a tabela ainda não existe em produção, o resultado é
 * "indisponivel" — nunca uma lista vazia que pareça "não há o que conferir".
 */

export type Escopo = "aplicadas" | "sugeridas";
export const TAMANHO_PAGINA = 20;

export interface ItemParaConferir {
  gmailMensagemId: string;
  classeIa: ClasseResposta;
  confianca: string;
  justificativa: string;
  aplicada: boolean;
  desfeita: boolean;
  processoNumero: string | null;
  linkGmail: string;
}

export type PainelConferencia =
  | { estado: "indisponivel" }
  | {
      estado: "ok";
      itens: ItemParaConferir[];
      /** Ainda não conferidas no escopo/classe pedidos (a lista mostra só a primeira página). */
      restantes: number;
      conferidasTotal: number;
      resumo: ResumoConferencia;
    };

export interface FiltroConferencia {
  escopo: Escopo;
  classe?: ClasseResposta;
}

export async function carregarPainelConferencia(filtro: FiltroConferencia): Promise<PainelConferencia> {
  try {
    const conferidas = await db.conferenciaIaResposta.findMany({
      select: { gmailMensagemId: true, classeCorreta: true },
    });
    const jaConferidas = new Set(conferidas.map((c) => c.gmailMensagemId));

    const ias = await db.classificacaoIaResposta.findMany({
      where: {
        aplicadaEm: filtro.escopo === "aplicadas" ? { not: null } : null,
        ...(filtro.classe ? { classeIa: filtro.classe } : {}),
      },
      select: {
        gmailMensagemId: true,
        classeIa: true,
        confianca: true,
        justificativa: true,
        aplicadaEm: true,
        desfeitaEm: true,
      },
    });
    const pendentes = ordenarAmostra(ias.filter((i) => !jaConferidas.has(i.gmailMensagemId) && ehClasse(i.classeIa)));
    const pagina = pendentes.slice(0, TAMANHO_PAGINA);

    const processos = pagina.length
      ? await db.respostaEmailPendente.findMany({
          where: { gmailMensagemId: { in: pagina.map((p) => p.gmailMensagemId) } },
          select: {
            gmailMensagemId: true,
            envio: { select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } } },
          },
        })
      : [];
    const numeroPorMsg = new Map(
      processos.map((p) => [p.gmailMensagemId, p.envio.processo?.numero ?? p.envio.numeroProcessoAssunto ?? null]),
    );

    const itens: ItemParaConferir[] = pagina.map((i) => ({
      gmailMensagemId: i.gmailMensagemId,
      classeIa: i.classeIa as ClasseResposta,
      confianca: i.confianca,
      justificativa: i.justificativa,
      aplicada: i.aplicadaEm !== null,
      desfeita: i.desfeitaEm !== null,
      processoNumero: numeroPorMsg.get(i.gmailMensagemId) ?? null,
      linkGmail: linkDoGmail(i.gmailMensagemId),
    }));

    return {
      estado: "ok",
      itens,
      restantes: pendentes.length - pagina.length,
      conferidasTotal: conferidas.length,
      resumo: await montarResumo(conferidas),
    };
  } catch {
    return { estado: "indisponivel" };
  }
}

async function montarResumo(conferidas: { gmailMensagemId: string; classeCorreta: string }[]): Promise<ResumoConferencia> {
  if (conferidas.length === 0) return resumirConferencias([]);
  const ias = await db.classificacaoIaResposta.findMany({
    where: { gmailMensagemId: { in: conferidas.map((c) => c.gmailMensagemId) } },
    select: { gmailMensagemId: true, classeIa: true, confianca: true, aplicadaEm: true },
  });
  const porMsg = new Map(ias.map((i) => [i.gmailMensagemId, i]));
  return resumirConferencias(
    conferidas.flatMap((c) => {
      const ia = porMsg.get(c.gmailMensagemId);
      return ia
        ? [{ classeIa: ia.classeIa, confianca: ia.confianca, aplicada: ia.aplicadaEm !== null, classeCorreta: c.classeCorreta }]
        : [];
    }),
  );
}

export type ResultadoConferencia = { tipo: "ok"; certa: boolean; classeIa: string } | { tipo: "erro"; mensagem: string };

/**
 * Grava a conferência. A classe da IA vem do BANCO, não do clique: o cliente só diz qual era a
 * certa. Conferir de novo sobrescreve (é assim que se corrige um clique errado).
 */
export async function registrarConferencia(
  gmailMensagemId: string,
  classeCorreta: ClasseResposta,
  userId: string,
): Promise<ResultadoConferencia> {
  const ia = await db.classificacaoIaResposta.findUnique({
    where: { gmailMensagemId },
    select: { classeIa: true },
  });
  if (!ia) return { tipo: "erro", mensagem: "Classificação não encontrada." };

  await db.conferenciaIaResposta.upsert({
    where: { gmailMensagemId },
    create: { gmailMensagemId, userId, classeCorreta, classeIa: ia.classeIa },
    update: { userId, classeCorreta, classeIa: ia.classeIa },
    select: { id: true },
  });
  return { tipo: "ok", certa: ia.classeIa === classeCorreta, classeIa: ia.classeIa };
}
