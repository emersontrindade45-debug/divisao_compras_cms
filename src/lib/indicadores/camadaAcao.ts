import "server-only";
import { db } from "@/lib/db";
import { priorizarFilaTrabalho, type FilaItem } from "@/lib/domain/filaTrabalho";
import {
  processoAtivo,
  resumirCamadaAcao,
  type ResumoAcao,
} from "@/lib/domain/indicadores/camadaAcao";

export type Escopo = "meus" | "todos";

export interface CotacaoPendente {
  id: string;
  fornecedor: string;
  processoNumero: string;
  processoId: string;
  dataLimite: Date;
  lembreteEnviado: boolean;
}

export interface ProcessoSemResponsavel {
  id: string;
  numero: string;
  objeto: string;
}

export interface CamadaAcao {
  resumo: ResumoAcao;
  fila: FilaItem[];
  cotacoesPendentes: CotacaoPendente[];
  /** Sempre global (não respeita o escopo): é trabalho da chefia distribuir. */
  semResponsavel: ProcessoSemResponsavel[];
}

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Lê o banco para a camada de ação (M30.a). `select` explícito em tudo
 * (CLAUDE.md §9.46).
 *
 * Preço público vem de `PrecoConsolidado` (fonte canônica, M30.0/Q13): cobre
 * planilha, promoção de candidato e inclusão manual — `Fonte` não vê os preços
 * que chegam pela planilha.
 */
export async function carregarCamadaAcao(
  escopo: Escopo,
  usuarioId: string,
  agora: Date,
): Promise<CamadaAcao> {
  const [processos, cotacoes] = await Promise.all([
    db.processo.findMany({
      orderBy: { dataAbertura: "desc" },
      select: {
        id: true,
        numero: true,
        objeto: true,
        status: true,
        faseAndamento: true,
        responsavelId: true,
        responsavelUser: { select: { name: true } },
        itens: {
          select: {
            seriePrecos: {
              select: {
                precosIncluidos: true,
                coeficienteVariacao: true,
                precos: { where: { status: "incluido" }, select: { fonte: true } },
              },
            },
          },
        },
        cotacoes: {
          select: {
            status: true,
            dataLimite: true,
            proposta: { select: { statusGeral: true } },
          },
        },
      },
    }),
    db.cotacao.findMany({
      orderBy: { dataLimite: "asc" },
      select: {
        id: true,
        status: true,
        dataLimite: true,
        lembreteEnviado: true,
        fornecedor: { select: { razaoSocial: true } },
        processo: { select: { id: true, numero: true, responsavelId: true } },
      },
    }),
  ]);

  const doEscopo = (responsavelId: string | null) =>
    escopo === "todos" || responsavelId === usuarioId;

  const processosEscopo = processos.filter((p) => doEscopo(p.responsavelId));
  const cotacoesEscopo = cotacoes.filter((c) => doEscopo(c.processo.responsavelId));

  const linhas = processosEscopo.map((p) => {
    const series = p.itens.flatMap((i) => i.seriePrecos);
    const precos = series.flatMap((s) => s.precos);
    const cvs = series.map((s) => Number(s.coeficienteVariacao));
    return {
      p,
      temPrecoPublico: precos.some((x) => x.fonte === "contratacao_publica"),
      series,
      cvs,
      temPesquisa: precos.length > 0 || p.cotacoes.length > 0,
    };
  });

  const resumo = resumirCamadaAcao(
    linhas.map(({ p, temPrecoPublico }) => ({
      status: p.status,
      faseAndamento: p.faseAndamento,
      responsavelId: p.responsavelId,
      temPrecoPublico,
    })),
    cotacoesEscopo,
    agora,
  );
  // "Sem responsável" é global: no escopo "meus" ele seria sempre zero.
  resumo.semResponsavel = processos.filter(
    (p) => processoAtivo(p) && p.responsavelId === null,
  ).length;

  const fila = priorizarFilaTrabalho(
    linhas
      .filter(({ p }) => processoAtivo(p))
      .map(({ p, temPrecoPublico, series, cvs, temPesquisa }) => ({
        processoId: p.id,
        numero: p.numero,
        objeto: p.objeto,
        status: p.status,
        temFontePublica: temPrecoPublico,
        cotacoesVencidas: p.cotacoes.filter(
          (c) => c.status === "silenciosa" && c.dataLimite < agora,
        ).length,
        propostasPendentes: p.cotacoes.filter(
          (c) => c.proposta && c.proposta.statusGeral !== "valida",
        ).length,
        precosIncluidos: Math.max(0, ...series.map((s) => s.precosIncluidos)),
        coeficienteVariacao: cvs.length > 0 ? Math.max(...cvs) : null,
        temPesquisaIniciada: temPesquisa,
        responsavel: p.responsavelUser?.name ?? null,
      })),
  );

  const limite = new Date(agora.getTime() + TRES_DIAS_MS);
  const cotacoesPendentes = cotacoesEscopo
    .filter(
      (c) => (c.status === "silenciosa" || c.status === "incompleta") && c.dataLimite <= limite,
    )
    .map((c) => ({
      id: c.id,
      fornecedor: c.fornecedor.razaoSocial,
      processoNumero: c.processo.numero,
      processoId: c.processo.id,
      dataLimite: c.dataLimite,
      lembreteEnviado: c.lembreteEnviado,
    }));

  const semResponsavel = processos
    .filter((p) => processoAtivo(p) && p.responsavelId === null)
    .map((p) => ({ id: p.id, numero: p.numero, objeto: p.objeto }));

  return { resumo, fila, cotacoesPendentes, semResponsavel };
}

/** Quantos processos ativos o usuário tem — decide o escopo padrão. */
export async function contarProcessosDoUsuario(usuarioId: string): Promise<number> {
  return db.processo.count({ where: { responsavelId: usuarioId } });
}

export async function listarUsuariosAtribuiveis(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
