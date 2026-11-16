import "server-only";
import { db } from "@/lib/db";
import {
  janelas,
  mediaFontesAteSuficiencia,
  percentualFontePublica,
  percentualPropostasInvalidas,
  consultasComoCotacoes,
  percentualEmailsInvalidos,
  taxaRespostaConsultas,
  taxaRespostaPorCategoria,
  tempoRespostaDias,
  type ConsultaDesempenhoInput,
  temTempoConfiavel,
  tempoAteMarco,
  type Indicador,
  type Periodo,
  type TaxaCategoria,
} from "@/lib/domain/indicadores/desempenho";
import type { Escopo } from "./camadaAcao";

export interface ParIndicador {
  atual: Indicador;
  anterior: Indicador;
}

export interface CamadaDesempenho {
  tempoPrimeiraReferencia: ParIndicador;
  tempoSerieMinima: ParIndicador;
  fontePublica: ParIndicador;
  taxaResposta: ParIndicador;
  tempoResposta: ParIndicador;
  emailsInvalidos: ParIndicador;
  propostasInvalidas: ParIndicador;
  fontesAteSuficiencia: ParIndicador;
  porCategoria: TaxaCategoria[];
  /** Primeiro processo com tempo confiável; null = ainda nenhum. */
  dadosTempoDesde: Date | null;
}

/**
 * Lê o banco para a camada de desempenho (M30.b) e calcula cada indicador na
 * janela atual e na anterior. `select` explícito em tudo (CLAUDE.md §9.46).
 */
export async function carregarCamadaDesempenho(
  periodo: Periodo,
  escopo: Escopo,
  usuarioId: string,
  agora: Date,
): Promise<CamadaDesempenho> {
  const { atual, anterior } = janelas(periodo, agora);
  const filtroResponsavel = escopo === "meus" ? { responsavelId: usuarioId } : {};

  const [processos, consultas, propostas] = await Promise.all([
    db.processo.findMany({
      where: filtroResponsavel,
      select: {
        createdAt: true,
        dataAbertura: true,
        dataAberturaOrigem: true,
        marcosIncertos: true,
        primeiraReferenciaEm: true,
        serieMinimaEm: true,
        itens: {
          select: {
            seriePrecos: {
              select: { precos: { select: { status: true, fonte: true } } },
            },
          },
        },
      },
    }),
    carregarConsultas(anterior.inicio, escopo === "meus" ? { responsavelId: usuarioId } : null),
    db.proposta.findMany({
      where: { createdAt: { gte: anterior.inicio }, cotacao: { processo: filtroResponsavel } },
      select: { createdAt: true, statusGeral: true },
    }),
  ]);

  const fontes = processos.map((p) => {
    const precos = p.itens.flatMap((i) => i.seriePrecos.flatMap((s) => s.precos));
    const incluidos = precos.filter((x) => x.status === "incluido");
    return {
      dataAbertura: p.dataAbertura,
      temPreco: incluidos.length > 0,
      temPrecoPublico: incluidos.some((x) => x.fonte === "contratacao_publica"),
    };
  });

  const itens = processos.flatMap((p) =>
    p.itens.map((i) => {
      const precos = i.seriePrecos.flatMap((s) => s.precos);
      return {
        dataAbertura: p.dataAbertura,
        incluidos: precos.filter((x) => x.status === "incluido").length,
        pesquisados: precos.length,
      };
    }),
  );

  const par = <T>(f: (dados: T, j: typeof atual) => Indicador, dados: T): ParIndicador => ({
    atual: f(dados, atual),
    anterior: f(dados, anterior),
  });

  const confiaveis = processos.filter(temTempoConfiavel).map((p) => p.createdAt.getTime());

  return {
    tempoPrimeiraReferencia: par((d, j) => tempoAteMarco(d, "primeiraReferenciaEm", j), processos),
    tempoSerieMinima: par((d, j) => tempoAteMarco(d, "serieMinimaEm", j), processos),
    fontePublica: par(percentualFontePublica, fontes),
    taxaResposta: par(taxaRespostaConsultas, consultas),
    tempoResposta: par(tempoRespostaDias, consultas),
    emailsInvalidos: par(percentualEmailsInvalidos, consultas),
    propostasInvalidas: par(percentualPropostasInvalidas, propostas),
    fontesAteSuficiencia: par(mediaFontesAteSuficiencia, itens),
    porCategoria: taxaRespostaPorCategoria(consultasComoCotacoes(consultas), atual),
    dadosTempoDesde: confiaveis.length > 0 ? new Date(Math.min(...confiaveis)) : null,
  };
}

/**
 * As consultas por e-mail (M30.d) são a base da taxa de resposta: uma por fornecedor consultado
 * em cada envio. Substitui a leitura da tabela `Cotacao`, que é o registro manual e hoje está vazio.
 *
 * Falha de leitura devolve lista vazia: o dashboard precisa abrir no intervalo entre o deploy do
 * código e a migration que cria a tabela (CLAUDE.md §9.19/§9.46).
 */
async function carregarConsultas(
  desde: Date,
  filtroProcesso: { responsavelId: string } | null,
): Promise<ConsultaDesempenhoInput[]> {
  try {
    const linhas = await db.consultaCotacao.findMany({
      where: {
        envio: { dataEnvio: { gte: desde }, ...(filtroProcesso ? { processo: filtroProcesso } : {}) },
      },
      select: {
        situacao: true,
        dataResposta: true,
        cnaeDescricao: true,
        envio: { select: { dataEnvio: true } },
      },
    });
    return linhas.map((l) => ({
      dataEnvio: l.envio.dataEnvio,
      dataResposta: l.dataResposta,
      situacao: l.situacao,
      categoria: l.cnaeDescricao,
    }));
  } catch {
    return [];
  }
}
