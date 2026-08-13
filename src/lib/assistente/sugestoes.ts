import { z } from "zod";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

// Candidatos que a busca do assistente encontrou e que aguardam aprovação.
//
// Por que existe um tipo persistido em vez de o cliente devolver o candidato no
// clique: **o preço nunca pode vir do navegador**. O que a busca achou é gravado
// junto da mensagem do assistente (`MensagemAssistente.ferramentasUsadas`), e o
// clique de "Adicionar à lista" manda apenas um identificador — o servidor
// releva o candidato da própria mensagem. Assim a invariante do M13 ("o modelo
// nunca digita um preço") continua valendo depois de passar pela tela: nem o
// modelo nem o cliente conseguem injetar valor, órgão ou data.
//
// O catálogo em memória do registry não serve para isso: ele é reconstruído a
// cada requisição, então já não existe quando o usuário clica.

/**
 * Teto de sugestões por busca.
 *
 * Vale tanto para o que o modelo lê quanto para o que vira cartão na tela —
 * mostrar 25 e o modelo enxergar 100 faria ele citar um candidato sem botão.
 * O PNCP devolve os itens por relevância, então o corte mantém os melhores.
 */
export const MAX_SUGESTOES_POR_BUSCA = 25;

/**
 * Identidade estruturada da contratação de origem, quando o provedor a expõe
 * (hoje só o PNCP — ver `IdentidadeContratacao` em `lib/ia/types`). Sem ela o
 * card não tem como pedir ao servidor os outros itens da mesma licitação.
 *
 * `.nullable().optional()` (não só `.nullable()`) porque mensagens gravadas
 * antes deste campo existir não têm a chave — exigi-la quebraria a leitura de
 * conversas antigas (CLAUDE.md §9.12).
 */
const identidadeContratacaoSchema = z.object({
  cnpjOrgao: z.string(),
  ano: z.string(),
  numeroSequencial: z.string(),
  numeroItem: z.number(),
});

export const candidatoSugeridoSchema = z.object({
  /** Estável dentro do passo (`c1`, `c2`...): é o que o clique manda de volta. */
  id: z.string().min(1),
  tipoCandidato: z.enum(["contratacao_publica", "painel_precos", "preco_referencia"]),
  fonteDescricao: z.string(),
  fonteOrgaoOuId: z.string(),
  fonteUrl: z.string().nullable(),
  valorUnitario: z.number(),
  /** ISO — `Json` não guarda `Date`. */
  dataReferencia: z.string(),
  unidade: z.string(),
  quantidade: z.number(),
  /** Item que o modelo disse estar pesquisando; a tela permite corrigir. */
  itemIdSugerido: z.string().nullable(),
  termoBuscaUsado: z.string(),
  identidadeContratacao: identidadeContratacaoSchema.nullable().optional(),
});

export type CandidatoSugerido = z.infer<typeof candidatoSugeridoSchema>;

export const listaSugestoesSchema = z.array(candidatoSugeridoSchema);

/**
 * Mesmo formato produzido por `montarUrlEdital` em `lib/integracoes/pncp.ts`
 * (`/app/editais/{cnpj}/{ano}/{sequencial}`) — duplicado aqui porque aquele
 * módulo é `server-only` e não pode ser importado por este (usado também no
 * cliente). Se o formato da URL mudar lá, mudar aqui também.
 */
const REGEX_URL_EDITAL_PNCP = /^https:\/\/pncp\.gov\.br\/app\/editais\/([^/]+)\/([^/]+)\/([^/]+)$/;

/**
 * Identidade (cnpj/ano/sequencial) da contratação de origem de uma sugestão —
 * preferindo `identidadeContratacao` quando presente e caindo para o parse do
 * `fonteUrl` quando ausente. A segunda via existe para candidatos gravados
 * ANTES de `identidadeContratacao` existir no schema (mensagens antigas): sem
 * ela, o picker de "outros itens desta licitação" nunca apareceria nesses
 * cards, mesmo eles tendo o link do PNCP com tudo que é preciso.
 *
 * `numeroItem` só vem pela primeira via — quem usa o resultado para excluir o
 * item que já é o próprio card precisa tratar a ausência dele.
 */
export function identidadeDaContratacao(
  sugestao: Pick<CandidatoSugerido, "identidadeContratacao" | "fonteUrl">,
): { cnpjOrgao: string; ano: string; numeroSequencial: string } | null {
  if (sugestao.identidadeContratacao) return sugestao.identidadeContratacao;
  const match = sugestao.fonteUrl?.match(REGEX_URL_EDITAL_PNCP);
  if (!match) return null;
  const [, cnpjOrgao, ano, numeroSequencial] = match;
  return { cnpjOrgao: cnpjOrgao!, ano: ano!, numeroSequencial: numeroSequencial! };
}

/** Converte o candidato da busca no formato serializável que fica na mensagem. */
export function paraSugestao(
  id: string,
  candidato: CandidatoSimilaridade,
  contexto: { itemIdSugerido: string | null; termoBuscaUsado: string },
): CandidatoSugerido {
  return {
    id,
    tipoCandidato: candidato.tipoCandidato,
    fonteDescricao: candidato.fonteDescricao,
    fonteOrgaoOuId: candidato.fonteOrgaoOuId,
    fonteUrl: candidato.fonteUrl ?? null,
    valorUnitario: candidato.valorUnitario,
    dataReferencia: candidato.dataReferencia.toISOString(),
    unidade: candidato.unidade,
    quantidade: candidato.quantidade,
    itemIdSugerido: contexto.itemIdSugerido,
    termoBuscaUsado: contexto.termoBuscaUsado,
    identidadeContratacao: candidato.identidadeContratacao ?? null,
  };
}

/** Caminho inverso, para o ranqueamento na hora da aprovação. */
export function paraCandidato(sugestao: CandidatoSugerido): CandidatoSimilaridade {
  return {
    tipoCandidato: sugestao.tipoCandidato,
    fonteDescricao: sugestao.fonteDescricao,
    fonteOrgaoOuId: sugestao.fonteOrgaoOuId,
    ...(sugestao.fonteUrl ? { fonteUrl: sugestao.fonteUrl } : {}),
    valorUnitario: sugestao.valorUnitario,
    dataReferencia: new Date(sugestao.dataReferencia),
    unidade: sugestao.unidade,
    quantidade: sugestao.quantidade,
  };
}

/**
 * Procura uma sugestão no rastro de ferramentas gravado com a mensagem.
 *
 * Lê defensivamente: o campo é `Json` e pode ter sido gravado por uma versão
 * anterior do código, sem `sugestoes` nenhuma (CLAUDE.md §9.12).
 */
export function acharSugestao(
  ferramentasUsadas: unknown,
  candidatoId: string,
): CandidatoSugerido | null {
  const passos = z
    .array(z.object({ sugestoes: listaSugestoesSchema.optional() }).passthrough())
    .safeParse(ferramentasUsadas);
  if (!passos.success) return null;

  for (const passo of passos.data) {
    const achada = passo.sugestoes?.find((s) => s.id === candidatoId);
    if (achada) return achada;
  }
  return null;
}
