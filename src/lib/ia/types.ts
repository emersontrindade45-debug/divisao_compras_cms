export interface ItemExtraidoTR {
  descricao: string;
  especificacaoTecnica: string;
  unidade: string;
  quantidade: number;
  /** Termo curto para busca textual (substantivo-núcleo primeiro), gerado na extração do TR. */
  termoBusca?: string;
}

/**
 * Identidade estruturada da contratação de origem de um candidato, quando o
 * provedor a expõe (hoje só o PNCP — ver `buscarContratosPNCP`). Alimenta a
 * deduplicação entre provedores do registry (docs/ApiPlan.md §3.4): duas
 * fontes podem republicar o mesmo item da mesma compra pública.
 */
export interface IdentidadeContratacao {
  cnpjOrgao: string;
  ano: string;
  numeroSequencial: string;
  numeroItem: number;
}

export interface CandidatoSimilaridade {
  tipoCandidato: "contratacao_publica" | "painel_precos" | "preco_referencia";
  fonteDescricao: string;
  fonteOrgaoOuId: string;
  fonteUrl?: string;
  valorUnitario: number;
  dataReferencia: Date;
  unidade: string;
  quantidade: number;
  /** Ausente quando o provedor não expõe a identidade estruturada da compra (ver `IdentidadeContratacao`). */
  identidadeContratacao?: IdentidadeContratacao;
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

/**
 * Contexto extraído do TR para referência permanente do assistente.
 * Armazenado como JSON em Processo.trContexto.
 */
export interface ContextoTR {
  /** Tabela de itens do objeto (item, especificação, frequência, unidade, quantidade). */
  tabelaItens: string;
  /** Seção de modelo de execução do objeto (prazos, dinâmica, especificações técnicas por área). */
  modeloExecucao: string;
  /** Seção de materiais e equipamentos. Vazio quando não constar no TR. */
  materiaisEquipamentos: string;
}

export interface ProvedorIA {
  extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]>;
  extrairContextoTR(pdfBuffer: Buffer): Promise<ContextoTR>;
  rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]>;
}
