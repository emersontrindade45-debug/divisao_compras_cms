import "server-only";
import { db } from "@/lib/db";
import type { ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";
import { adotavelPelaPolitica, CLASSES_DA_POLITICA } from "@/lib/domain/cotacaoEmail/politicaIa";
import { aplicacaoIaLigada, aplicarClassificacaoIa, MAX_APLICACOES_POR_CLIQUE } from "./aplicarIa";

/**
 * Aplica a política de fechamento da IA nas respostas pendentes (M30.d): recusa e dúvida pela leitura
 * da IA; nunca orçamento nem "não é resposta"; nunca por cima de consulta já decidida (ver
 * `domain/cotacaoEmail/politicaIa.ts`).
 *
 * Usa a MESMA `aplicarClassificacaoIa` do critério automático: transação atômica, guardas de estado e
 * os campos que o "Desfazer" já entende. Chave `IA_APLICAR_AUTOMATICO` desligada = não faz nada (§9.45).
 * Nenhum texto de e-mail passa por aqui: só ids, classe e situação. `select` explícito em tudo (§9.46).
 */

export interface AdotavelPelaPolitica {
  gmailMensagemId: string;
  classeIa: ClasseResposta;
  consultaId: string;
  dataResposta: Date;
}

export async function listarAdotaveisPelaPolitica(): Promise<AdotavelPelaPolitica[]> {
  const abertas = await db.respostaEmailPendente.findMany({
    where: { resolvidaEm: null },
    select: { gmailMensagemId: true, dataResposta: true },
  });
  if (abertas.length === 0) return [];
  const pendente = new Map(abertas.map((a) => [a.gmailMensagemId, a]));

  const linhas = await db.classificacaoIaResposta.findMany({
    where: {
      gmailMensagemId: { in: [...pendente.keys()] },
      aplicadaEm: null,
      desfeitaEm: null,
      consultaId: { not: null },
      classeIa: { in: [...CLASSES_DA_POLITICA] },
    },
    orderBy: { createdAt: "asc" },
    select: { gmailMensagemId: true, classeIa: true, consultaId: true },
  });
  if (linhas.length === 0) return [];

  const consultas = await db.consultaCotacao.findMany({
    where: { id: { in: linhas.map((l) => l.consultaId as string) } },
    select: { id: true, situacao: true },
  });
  const situacao = new Map(consultas.map((c) => [c.id, c.situacao as string]));

  const saida: AdotavelPelaPolitica[] = [];
  for (const l of linhas) {
    const p = pendente.get(l.gmailMensagemId);
    const sit = situacao.get(l.consultaId as string);
    if (!p || !sit) continue;
    if (!adotavelPelaPolitica({ classeIa: l.classeIa, situacaoConsulta: sit })) continue;
    saida.push({
      gmailMensagemId: l.gmailMensagemId,
      classeIa: l.classeIa as ClasseResposta,
      consultaId: l.consultaId as string,
      dataResposta: p.dataResposta,
    });
  }
  return saida;
}

export interface ResultadoPolitica {
  desligada: boolean;
  aplicadas: number;
  porClasse: { recusa: number; duvida: number };
  /** Outra decisão chegou antes: nada foi alterado. */
  ignoradas: number;
  /** Ainda por aplicar (além do limite deste clique). */
  restantes: number;
}

export async function aplicarPoliticaIa(userId: string): Promise<ResultadoPolitica> {
  const vazio: ResultadoPolitica = {
    desligada: false,
    aplicadas: 0,
    porClasse: { recusa: 0, duvida: 0 },
    ignoradas: 0,
    restantes: 0,
  };
  if (!aplicacaoIaLigada()) return { ...vazio, desligada: true };

  const todas = await listarAdotaveisPelaPolitica();
  const lote = todas.slice(0, MAX_APLICACOES_POR_CLIQUE);
  const feitas: AdotavelPelaPolitica[] = [];

  for (let i = 0; i < lote.length; i += 5) {
    const grupo = lote.slice(i, i + 5);
    const rs = await Promise.all(
      grupo.map((l) =>
        aplicarClassificacaoIa({
          gmailMensagemId: l.gmailMensagemId,
          classe: l.classeIa,
          consultaId: l.consultaId,
          dataResposta: l.dataResposta,
        }),
      ),
    );
    rs.forEach((r, k) => {
      if (r === "aplicada") feitas.push(grupo[k]);
    });
  }

  if (feitas.length > 0) {
    await db.auditLog.createMany({
      data: feitas.map((f) => ({
        userId,
        acao: "ia_aplicar_resposta_email",
        detalhes: { gmailMensagemId: f.gmailMensagemId, consultaId: f.consultaId, classe: f.classeIa, origem: "politica" },
      })),
    });
  }

  const porClasse = { recusa: 0, duvida: 0 };
  for (const f of feitas) if (f.classeIa in porClasse) porClasse[f.classeIa as keyof typeof porClasse] += 1;
  return {
    desligada: false,
    aplicadas: feitas.length,
    porClasse,
    ignoradas: lote.length - feitas.length,
    restantes: Math.max(todas.length - lote.length, 0),
  };
}
