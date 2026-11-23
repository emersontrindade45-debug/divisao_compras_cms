import "server-only";
import { db } from "@/lib/db";
import type { ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";
import { acaoDeFechamento, dentroDaDispensa } from "@/lib/domain/cotacaoEmail/fechamentoIa";
import { aplicacaoIaLigada, aplicarClassificacaoIa } from "./aplicarIa";
import { OPCOES_TRANSACAO } from "./classificarSemFornecedor";

/**
 * Fechamento das pendências (M30.d): ver `domain/cotacaoEmail/fechamentoIa.ts` para a regra. Quatro
 * grupos, todos lidos do banco (os ids nunca vêm do cliente):
 *  - `aplicar`: consulta aberta + leitura da IA → aplica a sugestão (mesma `aplicarClassificacaoIa`,
 *    atômica, com Desfazer);
 *  - `semFornecedor`: leitura da IA sem consulta ligada (recusa/orçamento/dúvida) → conta na categoria,
 *    como `classificarSemFornecedor`, sem exigir confiança alta (decisão do usuário);
 *  - `fecharSemAlterar`: consulta já decidida → só encerra a entrada da fila;
 *  - `dispensar`: sem leitura da IA, de out a dez/2025 → encerra a entrada da fila.
 * Nada é apagado: o fechamento grava `resolvidaEm` e a auditoria guarda os ids.
 * Nenhum texto de e-mail passa por aqui. `select` explícito em tudo (§9.46).
 */

export interface Plano {
  aplicar: { gmailMensagemId: string; classeIa: ClasseResposta; consultaId: string; dataResposta: Date; pendenteId: string }[];
  semFornecedor: { pendenteId: string; gmailMensagemId: string; classeIa: string }[];
  fecharSemAlterar: { pendenteId: string; gmailMensagemId: string }[];
  dispensar: { pendenteId: string; gmailMensagemId: string }[];
}

export async function planejarFechamento(): Promise<Plano> {
  const plano: Plano = { aplicar: [], semFornecedor: [], fecharSemAlterar: [], dispensar: [] };
  const abertas = await db.respostaEmailPendente.findMany({
    where: { resolvidaEm: null },
    select: { id: true, gmailMensagemId: true, dataResposta: true },
  });
  if (abertas.length === 0) return plano;

  const ias = await db.classificacaoIaResposta.findMany({
    where: { gmailMensagemId: { in: abertas.map((a) => a.gmailMensagemId) }, desfeitaEm: null, aplicadaEm: null },
    select: { gmailMensagemId: true, classeIa: true, consultaId: true },
  });
  const iaPorMsg = new Map(ias.map((i) => [i.gmailMensagemId, i]));

  const consultaIds = ias.map((i) => i.consultaId).filter((x): x is string => x !== null);
  const consultas = consultaIds.length
    ? await db.consultaCotacao.findMany({ where: { id: { in: consultaIds } }, select: { id: true, situacao: true } })
    : [];
  const situacao = new Map(consultas.map((c) => [c.id, c.situacao as string]));

  for (const p of abertas) {
    const ia = iaPorMsg.get(p.gmailMensagemId);
    if (!ia) {
      // Sem leitura da IA: só entra a janela de dispensa pedida pelo usuário.
      if (dentroDaDispensa(p.dataResposta)) plano.dispensar.push({ pendenteId: p.id, gmailMensagemId: p.gmailMensagemId });
      continue;
    }
    if (ia.consultaId === null) {
      if (ia.classeIa === "orcamento" || ia.classeIa === "recusa" || ia.classeIa === "duvida") {
        plano.semFornecedor.push({ pendenteId: p.id, gmailMensagemId: p.gmailMensagemId, classeIa: ia.classeIa });
      }
      continue;
    }
    const sit = situacao.get(ia.consultaId);
    if (!sit) continue;
    const acao = acaoDeFechamento({ classeIa: ia.classeIa, situacaoConsulta: sit });
    if (acao === "aplicar") {
      plano.aplicar.push({
        pendenteId: p.id,
        gmailMensagemId: p.gmailMensagemId,
        classeIa: ia.classeIa as ClasseResposta,
        consultaId: ia.consultaId,
        dataResposta: p.dataResposta,
      });
    } else if (acao === "fechar_sem_alterar") {
      plano.fecharSemAlterar.push({ pendenteId: p.id, gmailMensagemId: p.gmailMensagemId });
    }
  }
  return plano;
}

export interface ResultadoFechamento {
  /** A chave da IA está desligada: as partes que aplicam a IA foram puladas. */
  iaDesligada: boolean;
  aplicadas: number;
  /** Outra decisão chegou antes (ou a fila já estava fechada): nada foi alterado. */
  ignoradas: number;
  semFornecedor: number;
  fechadasSemAlterar: number;
  dispensadas: number;
}

async function emBlocos<T>(itens: T[], tamanho: number, fn: (i: T) => Promise<boolean>): Promise<T[]> {
  const feitos: T[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    const bloco = itens.slice(i, i + tamanho);
    const rs = await Promise.all(bloco.map(fn));
    rs.forEach((ok, k) => ok && feitos.push(bloco[k]));
  }
  return feitos;
}

/** Fecha a entrada da fila só se ainda estiver aberta (atômico: `resolvidaEm: null` no WHERE, §9.14). */
async function fecharEntrada(pendenteId: string): Promise<boolean> {
  const r = await db.respostaEmailPendente.updateMany({ where: { id: pendenteId, resolvidaEm: null }, data: { resolvidaEm: new Date() } });
  return r.count > 0;
}

export async function executarFechamento(userId: string): Promise<ResultadoFechamento> {
  const plano = await planejarFechamento();
  const iaLigada = aplicacaoIaLigada();
  const saida: ResultadoFechamento = { iaDesligada: !iaLigada, aplicadas: 0, ignoradas: 0, semFornecedor: 0, fechadasSemAlterar: 0, dispensadas: 0 };

  if (iaLigada) {
    const aplicadas = await emBlocos(plano.aplicar, 5, async (a) =>
      (await aplicarClassificacaoIa({ gmailMensagemId: a.gmailMensagemId, classe: a.classeIa, consultaId: a.consultaId, dataResposta: a.dataResposta })) === "aplicada",
    );
    saida.aplicadas = aplicadas.length;
    saida.ignoradas = plano.aplicar.length - aplicadas.length;
    if (aplicadas.length > 0) {
      await db.auditLog.createMany({
        data: aplicadas.map((f) => ({
          userId,
          acao: "ia_aplicar_resposta_email",
          detalhes: { gmailMensagemId: f.gmailMensagemId, consultaId: f.consultaId, classe: f.classeIa, origem: "fechamento" },
        })),
      });
    }

    const feitasSemForn: Plano["semFornecedor"] = [];
    for (let i = 0; i < plano.semFornecedor.length; i += 10) {
      const bloco = plano.semFornecedor.slice(i, i + 10);
      try {
        const doBloco: Plano["semFornecedor"] = [];
        await db.$transaction(async (tx) => {
          for (const a of bloco) {
            const fila = await tx.respostaEmailPendente.updateMany({ where: { id: a.pendenteId, resolvidaEm: null }, data: { resolvidaEm: new Date() } });
            if (fila.count === 0) continue;
            const ia = await tx.classificacaoIaResposta.updateMany({
              where: { gmailMensagemId: a.gmailMensagemId, aplicadaEm: null, desfeitaEm: null },
              data: { aplicadaEm: new Date() },
            });
            if (ia.count === 0) {
              await tx.respostaEmailPendente.updateMany({ where: { id: a.pendenteId }, data: { resolvidaEm: null } });
              continue;
            }
            doBloco.push(a);
          }
        }, OPCOES_TRANSACAO);
        feitasSemForn.push(...doBloco);
      } catch {
        /* o bloco fica na fila para um novo clique */
      }
    }
    saida.semFornecedor = feitasSemForn.length;
    if (feitasSemForn.length > 0) {
      await db.auditLog.createMany({
        data: feitasSemForn.map((f) => ({
          userId,
          acao: "ia_aplicar_resposta_email",
          detalhes: { gmailMensagemId: f.gmailMensagemId, classe: f.classeIa, origem: "fechamento_sem_fornecedor" },
        })),
      });
    }
  }

  const fechadas = await emBlocos(plano.fecharSemAlterar, 10, (a) => fecharEntrada(a.pendenteId));
  saida.fechadasSemAlterar = fechadas.length;
  if (fechadas.length > 0) {
    await db.auditLog.createMany({
      data: fechadas.map((f) => ({ userId, acao: "fechar_pendencia_sem_alterar", detalhes: { gmailMensagemId: f.gmailMensagemId } })),
    });
  }

  const dispensadas = await emBlocos(plano.dispensar, 10, (a) => fecharEntrada(a.pendenteId));
  saida.dispensadas = dispensadas.length;
  if (dispensadas.length > 0) {
    await db.auditLog.createMany({
      data: dispensadas.map((f) => ({ userId, acao: "fechar_pendencia_dispensada", detalhes: { gmailMensagemId: f.gmailMensagemId, motivo: "sem_leitura_da_ia_out_dez_2025" } })),
    });
  }
  return saida;
}
