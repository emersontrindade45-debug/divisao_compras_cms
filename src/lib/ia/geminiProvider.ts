import "server-only";
import { z } from "zod";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";

const itemExtraidoTRSchema = z.object({
  descricao: z.string(),
  especificacaoTecnica: z.string(),
  unidade: z.string(),
  quantidade: z.number(),
  termoBusca: z.string().optional(),
});

const itensExtraidosTRSchema = z.array(itemExtraidoTRSchema);

const avaliacaoSimilaridadeSchema = z.object({
  indice: z.number().optional(),
  scoreDescricao: z.number(),
  scoreEspecificacao: z.number(),
  scoreUnidadeQuantidade: z.number(),
  adaptado: z.boolean(),
  justificativa: z.string(),
});

const avaliacoesSimilaridadeSchema = z.array(avaliacaoSimilaridadeSchema);

/** Avaliação bruta retornada pela IA para um candidato, antes do cálculo do scoreFinal. */
type AvaliacaoBruta = Omit<ScoreSimilaridade, "candidato" | "scoreFinal">;

const PROMPT_EXTRACAO = `Você é um analista de compras públicas. Leia o Termo de Referência (TR) em anexo
e extraia cada item a ser cotado. Para cada item, retorne um objeto JSON com:
- "descricao": descrição normalizada e objetiva do item
- "especificacaoTecnica": características técnicas detalhadas (material, dimensão, voltagem, etc.)
- "unidade": unidade de medida (ex.: "unidade", "caixa", "metro linear", "pacote", "serviço")
- "quantidade": quantidade numérica
- "termoBusca": termo curto (2 a 4 palavras) para busca textual em portais de compras públicas.
  Comece SEMPRE pelo substantivo que nomeia o produto ou serviço (ex.: "lavagem", "cadeira"),
  seguido de 1-3 qualificadores essenciais (ex.: "lavagem fachada vidro"). Não inclua marca,
  quantidade, verbos genéricos ("fornecimento", "aquisição") nem artigos.

Responda APENAS com um array JSON de objetos, sem texto adicional, sem markdown.`;

function montarPromptRanking(itemTR: ItemExtraidoTR, candidatos: CandidatoSimilaridade[]): string {
  const candidatosResumidos = candidatos.map((c) => ({
    descricao: c.fonteDescricao,
    unidade: c.unidade,
    quantidade: c.quantidade,
  }));

  return `Você é um analista de compras públicas avaliando se contratos públicos são similares a um item de
Termo de Referência (TR), para servir de justificativa formal de preço público (IN SEGES/ME 65/2021).

Sua tarefa é responder: "isto é o mesmo tipo de produto/serviço que o item do TR?" — como faria
um comprador experiente, não um sistema de correspondência exata de texto. Contratos públicos
raramente repetem a especificação do TR palavra por palavra — isso NÃO significa produtos diferentes.
Identifique primeiro a CATEGORIA/NATUREZA (é o mesmo serviço? o mesmo tipo de material?); se a
categoria bate, o item já é candidato válido mesmo com detalhes técnicos divergentes ou ausentes.

ITEM DO TR:
${JSON.stringify(itemTR)}

CANDIDATOS (indexados de 0 a ${candidatos.length - 1}):
${JSON.stringify(candidatosResumidos)}

Para CADA candidato, avalie 3 parâmetros de 0 a 100 e inclua o campo "indice" (0-based):
1. "scoreDescricao": é o MESMO TIPO de produto/serviço? Pontue alto (70-100) quando a categoria/
   função coincide. Pontue baixo (0-30) apenas quando for categoria completamente diferente.
2. "scoreEspecificacao": quão compatíveis são as características técnicas disponíveis. NÃO penalize
   abaixo de 50 por ausência de informação — penalize forte apenas quando houver característica
   CONTRADITÓRIA explícita (ex.: TR pede lavagem interna e candidato especifica pintura externa).
3. "scoreUnidadeQuantidade": se unidade e ordem de grandeza da quantidade são compatíveis.

"adaptado": true se precisar de conversão de unidade ou o candidato for só parte do conjunto do TR.
"justificativa": 1-2 frases explicando o principal motivo do score para uso como justificativa formal.

Responda APENAS com um array JSON, na mesma ordem, sem markdown:
[{ "indice": number, "scoreDescricao": number, "scoreEspecificacao": number, "scoreUnidadeQuantidade": number, "adaptado": boolean, "justificativa": string }]`;
}

const TAMANHO_TRECHO_DIAGNOSTICO = 500;

/**
 * Extrai o "ilhote" de JSON de uma resposta de modelo de linguagem, tolerando ruído
 * ao redor (cercas de markdown não exatamente no início/fim, comentários após o
 * bloco, etc.).
 *
 * Estratégia:
 * 1. Procura um bloco cercado por ``` (ou ```json) em qualquer posição do texto.
 * 2. Se não houver cerca, cai para o trecho entre o primeiro `[`/`{` e o último
 *    `]`/`}` correspondente, que cobre a resposta "JSON puro com texto solto ao redor".
 */
function extrairJson(texto: string): string {
  const textoTrim = texto.trim();

  const fenceMatch = textoTrim.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const inicioArray = textoTrim.indexOf("[");
  const inicioObjeto = textoTrim.indexOf("{");
  const candidatosInicio = [inicioArray, inicioObjeto].filter((idx) => idx !== -1);
  if (candidatosInicio.length === 0) {
    return textoTrim;
  }
  const inicio = Math.min(...candidatosInicio);
  const charAbertura = textoTrim[inicio];
  const charFechamento = charAbertura === "[" ? "]" : "}";
  const fim = textoTrim.lastIndexOf(charFechamento);
  if (fim === -1 || fim < inicio) {
    return textoTrim;
  }

  return textoTrim.slice(inicio, fim + 1).trim();
}

function truncar(texto: string, tamanho: number): string {
  return texto.length > tamanho ? `${texto.slice(0, tamanho)}…` : texto;
}

/**
 * Faz o parse da resposta textual do modelo e valida seu formato contra `schema`.
 * Lança um erro com contexto (`contexto`) e um trecho truncado da resposta crua,
 * essencial para depuração quando o modelo retorna algo fora do esperado.
 */
function parseJsonResponse<T>(texto: string, schema: z.ZodType<T>, contexto: string): T {
  const limpo = extrairJson(texto);

  let bruto: unknown;
  try {
    bruto = JSON.parse(limpo);
  } catch (erro) {
    throw new Error(
      `[${contexto}] Falha ao fazer parse do JSON retornado pela IA. Trecho recebido: "${truncar(texto, TAMANHO_TRECHO_DIAGNOSTICO)}"`,
      { cause: erro },
    );
  }

  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(
      `[${contexto}] Resposta da IA não corresponde ao formato esperado: ${resultado.error.message}. Trecho recebido: "${truncar(texto, TAMANHO_TRECHO_DIAGNOSTICO)}"`,
      { cause: resultado.error },
    );
  }

  return resultado.data;
}

export class GeminiProvider implements ProvedorIA {
  async extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]> {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT_EXTRACAO },
            { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
          ],
        },
      ],
    });

    const texto = response.text ?? "[]";
    return parseJsonResponse(texto, itensExtraidosTRSchema, "extrairEspecificacaoTR");
  }

  async rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]> {
    if (candidatos.length === 0) return [];

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: montarPromptRanking(itemTR, candidatos) }] }],
    });

    const texto = response.text ?? "[]";
    const avaliacoes: AvaliacaoBruta[] = parseJsonResponse(
      texto,
      avaliacoesSimilaridadeSchema,
      "rankearSimilaridade",
    );

    return candidatos.map((candidato, idx) => {
      const avaliacao = avaliacoes[idx] as (typeof avaliacoes)[number] & { indice?: number };
      const av = avaliacoes.find((a) => (a as typeof avaliacao).indice === idx) ?? avaliacao;
      if (!av) {
        return {
          candidato,
          scoreFinal: 0,
          scoreDescricao: 0,
          scoreEspecificacao: 0,
          scoreUnidadeQuantidade: 0,
          adaptado: false,
          justificativa: "A IA não retornou avaliação para este candidato; requer revisão manual.",
        };
      }
      return {
        candidato,
        scoreFinal: 0,
        scoreDescricao: av.scoreDescricao,
        scoreEspecificacao: av.scoreEspecificacao,
        scoreUnidadeQuantidade: av.scoreUnidadeQuantidade,
        adaptado: av.adaptado,
        justificativa: av.justificativa,
      };
    });
  }
}
