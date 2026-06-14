export type TipoAlerta =
  | "cotacao_vencendo"
  | "cotacao_vencida"
  | "processo_sem_fonte_publica"
  | "pendencia_documental"
  | "dispersao_preco";

export type SeveridadeAlerta = "info" | "aviso" | "critico";

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  mensagem: string;
  processoId?: string;
  processoNumero?: string;
  cotacaoId?: string;
  href?: string;
}

export interface AlertaInput {
  cotacoesVencendo: Array<{
    id: string;
    processoId: string;
    processoNumero: string;
    fornecedorNome: string;
    diasRestantes: number;
  }>;
  processosSemFontePublica: Array<{
    id: string;
    numero: string;
  }>;
  cotacoesComPendenciaDocumental: Array<{
    id: string;
    processoId: string;
    processoNumero: string;
    fornecedorNome: string;
  }>;
  itensComDispersao: Array<{
    processoId: string;
    processoNumero: string;
    itemDescricao: string;
    coeficienteVariacao: number;
  }>;
}

export function gerarAlertas(input: AlertaInput): Alerta[] {
  const alertas: Alerta[] = [];

  for (const c of input.cotacoesVencendo) {
    const vencida = c.diasRestantes < 0;
    alertas.push({
      id: `cotacao-${c.id}`,
      tipo: vencida ? "cotacao_vencida" : "cotacao_vencendo",
      severidade: vencida ? "critico" : c.diasRestantes <= 1 ? "aviso" : "info",
      mensagem: vencida
        ? `Cotação de ${c.fornecedorNome} (proc. ${c.processoNumero}) venceu há ${Math.abs(c.diasRestantes)} dia(s) sem resposta.`
        : `Cotação de ${c.fornecedorNome} (proc. ${c.processoNumero}) vence em ${c.diasRestantes} dia(s).`,
      processoId: c.processoId,
      processoNumero: c.processoNumero,
      cotacaoId: c.id,
      href: `/cotacoes`,
    });
  }

  for (const p of input.processosSemFontePublica) {
    alertas.push({
      id: `sem-fonte-${p.id}`,
      tipo: "processo_sem_fonte_publica",
      severidade: "aviso",
      mensagem: `Processo ${p.numero} não possui fonte pública registrada (exigido pela IN 65/2021).`,
      processoId: p.id,
      processoNumero: p.numero,
      href: `/processos/${p.id}`,
    });
  }

  for (const c of input.cotacoesComPendenciaDocumental) {
    alertas.push({
      id: `pendencia-${c.id}`,
      tipo: "pendencia_documental",
      severidade: "aviso",
      mensagem: `Proposta de ${c.fornecedorNome} (proc. ${c.processoNumero}) tem pendência documental.`,
      processoId: c.processoId,
      processoNumero: c.processoNumero,
      cotacaoId: c.id,
      href: `/cotacoes`,
    });
  }

  for (const i of input.itensComDispersao) {
    alertas.push({
      id: `dispersao-${i.processoId}-${i.itemDescricao}`,
      tipo: "dispersao_preco",
      severidade: "aviso",
      mensagem: `Item "${i.itemDescricao}" (proc. ${i.processoNumero}) com CV de ${i.coeficienteVariacao.toFixed(1)}% — exige análise crítica.`,
      processoId: i.processoId,
      processoNumero: i.processoNumero,
      href: `/processos/${i.processoId}`,
    });
  }

  // Critérios primeiro, informações depois
  return alertas.sort((a, b) => {
    const ordem = { critico: 0, aviso: 1, info: 2 };
    return ordem[a.severidade] - ordem[b.severidade];
  });
}
