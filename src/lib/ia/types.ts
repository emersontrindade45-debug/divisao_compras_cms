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

/**
 * Metadados específicos de fonte de tabela de referência oficial (SINAPI —
 * M17), sem os quais dois preços legítimos para o mesmo código podem se
 * misturar na série sem distinção: regime de desoneração (desonerado /
 * não-desonerado são valores diferentes, publicados em arquivos separados —
 * docs/ApiPlan-M17-spike.md §4) e localidade (cada "UF" do SINAPI é a
 * capital de referência do IBGE, não o estado inteiro). Só preenchido por
 * provedores de `tipoCandidato: "preco_referencia"`.
 */
export interface MetadadosPrecoReferencia {
  /** "AAAA-MM" — competência de publicação do preço. */
  competencia: string;
  regime: "desonerado" | "nao_desonerado";
  /** Nome da localidade de referência IBGE (ex.: "SAO PAULO") — a capital, não a sigla de UF. */
  localidade: string;
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
  /** Presente quando `tipoCandidato === "preco_referencia"` (ver `MetadadosPrecoReferencia`). */
  metadadosPrecoReferencia?: MetadadosPrecoReferencia;
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
