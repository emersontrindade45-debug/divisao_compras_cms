import type { DomainResult } from "./types";

export function calcularScore(dados: {
  totalCotacoes: number;
  totalRespostas: number;
  historicoRespostas: Array<{
    dataEnvio: Date;
    dataResposta?: Date;
  }>;
}): DomainResult<{
  score: number;
  taxaResposta: number;
  velocidadeMedia: number;
  breakdown: { pontosResposta: number; pontosVelocidade: number };
}> {
  if (dados.totalCotacoes === 0) {
    return {
      value: {
        score: 0,
        taxaResposta: 0,
        velocidadeMedia: 0,
        breakdown: { pontosResposta: 0, pontosVelocidade: 0 },
      },
      valid: true,
      violations: [],
    };
  }

  const taxaResposta = (dados.totalRespostas / dados.totalCotacoes) * 100;
  const pontosResposta = taxaResposta * 0.6;

  const respondidas = dados.historicoRespostas.filter((h) => h.dataResposta != null);
  let velocidadeMedia = 0;
  let pontosVelocidade = 0;
  if (respondidas.length > 0) {
    const diasTotal = respondidas.reduce((acc, h) => {
      const diffMs = h.dataResposta!.getTime() - h.dataEnvio.getTime();
      return acc + diffMs / (1000 * 60 * 60 * 24);
    }, 0);
    velocidadeMedia = diasTotal / respondidas.length;
    pontosVelocidade = Math.max(0, 40 - velocidadeMedia * 4);
  }
  const score = Math.round(pontosResposta + pontosVelocidade);

  return {
    value: {
      score,
      taxaResposta,
      velocidadeMedia,
      breakdown: {
        pontosResposta: Math.round(pontosResposta * 100) / 100,
        pontosVelocidade: Math.round(pontosVelocidade * 100) / 100,
      },
    },
    valid: true,
    violations: [],
  };
}
