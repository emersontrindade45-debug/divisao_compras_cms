/**
 * Fila de trabalho do dashboard: ordena processos por urgência e diz qual é a
 * próxima ação de cada um. Puro — recebe agregados prontos, não consulta banco.
 */
import { CV_ANALISE_CRITICA } from "./priceStats";

export interface FilaInput {
  processoId: string;
  numero: string;
  objeto: string;
  status: "aderente" | "parcial" | "nao_aderente" | "pendente";
  temFontePublica: boolean;
  cotacoesVencidas: number;
  propostasPendentes: number;
  precosIncluidos: number;
  coeficienteVariacao: number | null;
  temPesquisaIniciada: boolean;
}

export interface FilaItem {
  processoId: string;
  numero: string;
  objeto: string;
  /** Menor = mais urgente (1..5). */
  urgencia: number;
  proximaAcao: string;
  href: string;
}

interface Regra {
  urgencia: number;
  aplica: (p: FilaInput) => boolean;
  acao: string;
  etapa: "estrategia" | "pesquisa" | "validacao" | "consolidacao";
}

const REGRAS: Regra[] = [
  {
    urgencia: 1,
    aplica: (p) => p.cotacoesVencidas > 0,
    acao: "Cotação vencida sem resposta",
    etapa: "validacao",
  },
  {
    urgencia: 2,
    aplica: (p) => !p.temFontePublica,
    acao: "Sem fonte pública — pesquisar ou justificar",
    etapa: "pesquisa",
  },
  {
    urgencia: 3,
    aplica: (p) => p.propostasPendentes > 0,
    acao: "Proposta pendente de validação",
    etapa: "validacao",
  },
  {
    urgencia: 4,
    aplica: (p) => p.temPesquisaIniciada && p.precosIncluidos < 3,
    acao: "Série incompleta — coletar mais preços",
    etapa: "pesquisa",
  },
  {
    urgencia: 5,
    aplica: (p) =>
      p.coeficienteVariacao !== null && p.coeficienteVariacao > CV_ANALISE_CRITICA,
    acao: "Dispersão alta — registrar análise crítica",
    etapa: "consolidacao",
  },
];

export function priorizarFilaTrabalho(processos: FilaInput[]): FilaItem[] {
  const itens: FilaItem[] = [];

  for (const p of processos) {
    // Processos concluídos (aderentes) não entram na fila.
    if (p.status === "aderente") continue;

    const regra = REGRAS.find((r) => r.aplica(p));
    if (!regra) continue;

    itens.push({
      processoId: p.processoId,
      numero: p.numero,
      objeto: p.objeto,
      urgencia: regra.urgencia,
      proximaAcao: regra.acao,
      href: `/processos/${p.processoId}?etapa=${regra.etapa}`,
    });
  }

  return itens.sort(
    (a, b) => a.urgencia - b.urgencia || a.numero.localeCompare(b.numero),
  );
}
