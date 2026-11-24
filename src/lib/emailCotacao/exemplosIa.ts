// Sem `import "server-only"` (CLAUDE.md §9.62): o script de medição fora do bundler do Next também
// precisa carregar os exemplos. Nunca importado por `components/`.
import { z } from "zod";
import { db } from "@/lib/db";
import {
  classeDaSituacao,
  ehClasseExemplo,
  escolherExemplos,
  limparTrecho,
  parecerAnonimo,
  type ClasseExemplo,
  type ExemploGuardado,
} from "@/lib/domain/cotacaoEmail/exemplosIa";
import type { TrechoParaClassificar } from "./classificarComIa";

/**
 * Exemplos anonimizados para a 1ª leitura da IA (M30.d). Ver o desenho em
 * `docs/superpowers/specs/2026-11-24-ia-exemplos-anonimizados-design.md`.
 *
 * Duas metades:
 *  - USO: com `IA_EXEMPLOS=1`, cada mensagem lida pela IA recebe os casos parecidos que a Divisão já
 *    decidiu. Desligado por padrão — só liga depois que a medição mostrar que não piora.
 *  - COLETA: busca no script do Google o trecho anonimizado dos casos decididos por um HUMANO
 *    (conferência ou decisão manual) e o guarda. Nunca guarda leitura da própria IA, nem trecho que
 *    ainda pareça conter dado pessoal.
 */

/** Ligado só com o valor exato "1": qualquer outra coisa (ou ausência) é desligado. */
export function exemplosLigados(): boolean {
  return process.env.IA_EXEMPLOS === "1";
}

/** Teto de exemplos lidos do banco por rodada; o acervo é de centenas, isto é folga. */
const MAX_EXEMPLOS_LIDOS = 2000;
/** Quantos casos novos se pedem ao script por rodada (o script também limita). */
export const MAX_COLETA_POR_RODADA = 30;
const TIMEOUT_SCRIPT_MS = 25_000;

/** Os exemplos guardados, no formato do domínio. `select` explícito (§9.46). Falha = lista vazia. */
export async function carregarExemplos(): Promise<ExemploGuardado[]> {
  try {
    const linhas = await db.exemploClassificacaoIa.findMany({
      select: { gmailMensagemId: true, classeCorreta: true, trecho: true },
      orderBy: { createdAt: "desc" },
      take: MAX_EXEMPLOS_LIDOS,
    });
    // Defesa em profundidade: mesmo o que já está guardado passa pelo filtro ATUAL antes de ir ao modelo.
    return linhas.flatMap((l) =>
      ehClasseExemplo(l.classeCorreta) && parecerAnonimo(l.trecho).ok
        ? [{ id: l.gmailMensagemId, classe: l.classeCorreta, trecho: l.trecho }]
        : [],
    );
  } catch {
    // Tabela ainda não criada ou banco indisponível: a IA lê sem exemplo, como sempre leu.
    return [];
  }
}

/** Anexa a cada item os seus exemplos. O caso nunca é exemplo de si mesmo (`excluirId`). */
export function anexarExemplos(itens: TrechoParaClassificar[], exemplos: ExemploGuardado[]): TrechoParaClassificar[] {
  if (exemplos.length === 0) return itens;
  return itens.map((item) => {
    const escolhidos = escolherExemplos(item.trecho, exemplos, { excluirId: item.id });
    return escolhidos.length === 0
      ? item
      : { ...item, exemplos: escolhidos.map((e) => ({ classe: e.classe, trecho: e.trecho })) };
  });
}

/** Itens da 1ª leitura com exemplos, se a flag estiver ligada; senão, os mesmos itens. */
export async function anexarExemplosSeLigado(itens: TrechoParaClassificar[]): Promise<TrechoParaClassificar[]> {
  if (!exemplosLigados() || itens.length === 0) return itens;
  return anexarExemplos(itens, await carregarExemplos());
}

// ── Coleta ────────────────────────────────────────────────────────────────

/** O que o script do Google devolve para a ação `trechos`. Só estes campos; o resto é ignorado. */
const respostaTrechosSchema = z.object({
  trechos: z.array(
    z.object({
      id: z.string().min(1).max(64),
      trecho: z.string(),
      anexosPdf: z.number().int().min(0).max(50).default(0),
      anexosOutros: z.number().int().min(0).max(50).default(0),
    }),
  ),
});

interface Decisao {
  gmailMensagemId: string;
  classe: ClasseExemplo;
  origem: "conferencia" | "manual";
}

/** Decisões HUMANAS. A conferência vence a decisão manual (ela diz a classe CERTA, mesmo contra a IA). */
async function decisoesHumanas(): Promise<Map<string, Decisao>> {
  const mapa = new Map<string, Decisao>();
  const manuais = await db.consultaCotacao.findMany({
    where: { regra: "manual", gmailRespostaId: { not: null }, situacao: { in: ["orcamento", "recusa", "duvida"] } },
    select: { gmailRespostaId: true, situacao: true },
  });
  for (const m of manuais) {
    const classe = classeDaSituacao(m.situacao);
    if (classe && m.gmailRespostaId) mapa.set(m.gmailRespostaId, { gmailMensagemId: m.gmailRespostaId, classe, origem: "manual" });
  }
  const conferencias = await db.conferenciaIaResposta.findMany({
    select: { gmailMensagemId: true, classeCorreta: true },
  });
  for (const c of conferencias) {
    if (ehClasseExemplo(c.classeCorreta)) {
      mapa.set(c.gmailMensagemId, { gmailMensagemId: c.gmailMensagemId, classe: c.classeCorreta, origem: "conferencia" });
    }
  }
  return mapa;
}

export interface ResultadoColeta {
  /** Decisões humanas conhecidas (com ou sem exemplo). */
  decisoes: number;
  jaTinham: number;
  /** Quantos ids foram pedidos ao script nesta rodada. */
  pedidos: number;
  gravados: number;
  /** A decisão foi corrigida depois: a classe do exemplo existente foi atualizada. */
  atualizados: number;
  /** Trechos que o filtro de anonimato recusou, por nome da regra violada (nunca o texto). */
  rejeitados: Record<string, number>;
  /** O script não devolveu texto para o id (mensagem apagada, vazia ou fora da conta). */
  semTexto: number;
  /** Ainda sem exemplo depois desta rodada. */
  restantes: number;
  /** Exemplos já guardados que NÃO passam no filtro atual e foram apagados (serão coletados de novo, limpos). */
  removidos: number;
}

export type RespostaColeta = { ok: true; resultado: ResultadoColeta } | { ok: false; erro: string };

export async function coletarExemplos(): Promise<RespostaColeta> {
  const url = process.env.APPS_SCRIPT_URL;
  const segredo = process.env.APPS_SCRIPT_SEGREDO;
  if (!url || !segredo) return { ok: false, erro: "A leitura de e-mails ainda não foi configurada neste ambiente." };

  const decisoes = await decisoesHumanas();
  const existentes = await db.exemploClassificacaoIa.findMany({
    select: { id: true, gmailMensagemId: true, classeCorreta: true, trecho: true },
  });
  // Autolimpeza: o que foi guardado com um filtro mais fraco e hoje não passa é apagado e coletado de novo.
  const inseguros = existentes.filter((e) => !parecerAnonimo(e.trecho).ok);
  let removidos = 0;
  if (inseguros.length > 0) {
    const r = await db.exemploClassificacaoIa.deleteMany({ where: { id: { in: inseguros.map((e) => e.id) } } });
    removidos = r.count;
  }
  const idsInseguros = new Set(inseguros.map((e) => e.gmailMensagemId));
  const classeGuardada = new Map(existentes.filter((e) => !idsInseguros.has(e.gmailMensagemId)).map((e) => [e.gmailMensagemId, e.classeCorreta]));

  // Decisão corrigida depois da coleta: só a classe muda, o trecho continua valendo.
  let atualizados = 0;
  for (const d of decisoes.values()) {
    const guardada = classeGuardada.get(d.gmailMensagemId);
    if (guardada !== undefined && guardada !== d.classe) {
      const r = await db.exemploClassificacaoIa.updateMany({
        where: { gmailMensagemId: d.gmailMensagemId, classeCorreta: guardada },
        data: { classeCorreta: d.classe, origem: d.origem },
      });
      atualizados += r.count;
    }
  }

  const faltando = [...decisoes.values()].filter((d) => !classeGuardada.has(d.gmailMensagemId));
  const pedir = faltando.slice(0, MAX_COLETA_POR_RODADA);
  const base: ResultadoColeta = {
    decisoes: decisoes.size,
    jaTinham: decisoes.size - faltando.length,
    pedidos: pedir.length,
    gravados: 0,
    atualizados,
    rejeitados: {},
    semTexto: 0,
    restantes: faltando.length,
    removidos,
  };
  if (pedir.length === 0) return { ok: true, resultado: base };

  let corpo: unknown;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segredo, acao: "trechos", ids: pedir.map((p) => p.gmailMensagemId) }),
      signal: AbortSignal.timeout(TIMEOUT_SCRIPT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, erro: "O Google recusou a leitura dos casos. Tente novamente em instantes." };
    corpo = await res.json();
  } catch {
    return { ok: false, erro: "Não foi possível ler os casos agora. Tente novamente em instantes." };
  }
  const parsed = respostaTrechosSchema.safeParse(corpo);
  if (!parsed.success) {
    // Não detalha: o erro do Zod pode citar o que veio. Causa comum: script do Google sem a ação `trechos`.
    return { ok: false, erro: "A resposta do script não tem o formato esperado. Confira se o script do Google foi atualizado." };
  }

  const pedidos = new Map(pedir.map((p) => [p.gmailMensagemId, p]));
  const aGravar: Array<{ gmailMensagemId: string; classeCorreta: string; origem: string; trecho: string; anexosPdf: number; anexosOutros: number }> = [];
  const rejeitados: Record<string, number> = {};
  const devolvidos = new Set<string>();
  for (const t of parsed.data.trechos) {
    const decisao = pedidos.get(t.id);
    if (!decisao || devolvidos.has(t.id)) continue; // id que não foi pedido ou repetido: ignora
    devolvidos.add(t.id);
    // Corta a assinatura (nome, empresa, telefone) e SÓ ENTÃO avalia: guarda o que o fornecedor escreveu sobre o pedido.
    const limpo = limparTrecho(t.trecho);
    const avaliacao = parecerAnonimo(limpo);
    if (!avaliacao.ok) {
      rejeitados[avaliacao.motivo] = (rejeitados[avaliacao.motivo] ?? 0) + 1;
      continue;
    }
    aGravar.push({
      gmailMensagemId: decisao.gmailMensagemId,
      classeCorreta: decisao.classe,
      origem: decisao.origem,
      trecho: limpo,
      anexosPdf: t.anexosPdf,
      anexosOutros: t.anexosOutros,
    });
  }
  const semTexto = pedir.length - devolvidos.size;
  const criados = aGravar.length > 0 ? await db.exemploClassificacaoIa.createMany({ data: aGravar, skipDuplicates: true }) : { count: 0 };

  return {
    ok: true,
    resultado: { ...base, gravados: criados.count, rejeitados, semTexto, restantes: faltando.length - criados.count },
  };
}

/** Apaga TODOS os exemplos: devolve a IA ao comportamento anterior. Devolve quantos foram apagados. */
export async function apagarTodosOsExemplos(): Promise<number> {
  const r = await db.exemploClassificacaoIa.deleteMany({});
  return r.count;
}
