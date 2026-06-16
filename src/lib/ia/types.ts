export interface ItemExtraidoTR {
  descricao: string;
  especificacaoTecnica: string;
  unidade: string;
  quantidade: number;
}

export interface CandidatoSimilaridade {
  tipoCandidato: "contratacao_publica" | "painel_precos";
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  fonteUrl?: string;
  valorUnitario: number;
  dataReferencia: Date;
  unidade: string;
  quantidade: number;
}

export interface ScoreSimilaridade {
  candidato: CandidatoSimilaridade;
  scoreFinal: number;
  scoreDescricao: number;
  scoreEspecificacao: number;
  scoreUnidadeQuantidade: number;
  adaptado: boolean;
  justificativa: string;
}

export interface ProvedorIA {
  extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]>;
  rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]>;
}
