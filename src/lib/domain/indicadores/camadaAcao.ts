/**
 * Camada de AÇÃO do dashboard (M30.a) — contagens do "o que fazer agora".
 * Pura: recebe agregados prontos e o instante atual.
 *
 * A camada de ação não usa período: pendência é pendência, seja de quando for.
 */

export interface ProcessoAcaoInput {
  status: "aderente" | "parcial" | "nao_aderente" | "pendente";
  faseAndamento: "nao_iniciado" | "em_andamento" | "concluido" | "em_correcao";
  responsavelId: string | null;
  /** Há preço `incluido` com fonte `contratacao_publica` em algum item (PrecoConsolidado). */
  temPrecoPublico: boolean;
}

export interface CotacaoAcaoInput {
  status: "positiva" | "negativa" | "incompleta" | "silenciosa";
  dataLimite: Date;
}

export interface ResumoAcao {
  /** Processos ainda em trabalho (nem aderentes nem concluídos). */
  ativos: number;
  /** Ativos sem nenhum preço de contratação pública — a fonte prioritária da IN 65/2021. */
  semFontePublica: number;
  /** Ativos sem responsável atribuído. */
  semResponsavel: number;
  /** Cotações ainda sem resposta. */
  semResposta: number;
  /** Das sem resposta, as com prazo vencido. */
  vencidas: number;
}

export function processoAtivo(p: Pick<ProcessoAcaoInput, "status" | "faseAndamento">): boolean {
  return p.status !== "aderente" && p.faseAndamento !== "concluido";
}

export function resumirCamadaAcao(
  processos: ProcessoAcaoInput[],
  cotacoes: CotacaoAcaoInput[],
  agora: Date,
): ResumoAcao {
  const ativos = processos.filter(processoAtivo);
  const semResposta = cotacoes.filter((c) => c.status === "silenciosa");
  return {
    ativos: ativos.length,
    semFontePublica: ativos.filter((p) => !p.temPrecoPublico).length,
    semResponsavel: ativos.filter((p) => p.responsavelId === null).length,
    semResposta: semResposta.length,
    vencidas: semResposta.filter((c) => c.dataLimite < agora).length,
  };
}

/**
 * Escopo padrão do filtro "Meus / Todos": o analista vê os seus; a chefia vê
 * todos. Analista sem nenhum processo atribuído cai em "Todos" — senão a tela
 * abriria vazia enquanto os processos antigos ainda não têm dono.
 */
export function escopoPadrao(
  papel: "pesquisa" | "revisao" | "aprovacao",
  processosDoUsuario: number,
): "meus" | "todos" {
  return papel === "pesquisa" && processosDoUsuario > 0 ? "meus" : "todos";
}
