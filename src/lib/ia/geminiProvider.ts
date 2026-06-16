import "server-only";
import { z } from "zod";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ProvedorIA } from "./types";

const itemExtraidoTRSchema = z.object({
  descricao: z.string(),
  especificacaoTecnica: z.string(),
  unidade: z.string(),
  quantidade: z.number(),
});

const itensExtraidosTRSchema = z.array(itemExtraidoTRSchema);

const avaliacaoSimilaridadeSchema = z.object({
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
- "unidade": unidade de medida (ex.: "unidade", "caixa", "metro linear", "pacote")
- "quantidade": quantidade numérica

Responda APENAS com um array JSON de objetos, sem texto adicional, sem markdown.`;

function montarPromptRanking(itemTR: ItemExtraidoTR, candidatos: CandidatoSimilaridade[]): string {
  return `Você é um analista de compras públicas avaliando se contratos públicos são similares a um item de
Termo de Referência (TR), para servir de justificativa formal de preço público (IN SEGES/ME 65/2021).

ITEM DO TR:
${JSON.stringify(itemTR)}

CANDIDATOS A CONTRATO PÚBLICO (avalie cada um independentemente):
${JSON.stringify(candidatos)}

Para CADA candidato, avalie 3 parâmetros de 0 a 100:
1. "scoreDescricao": quão parecida é a descrição do objeto do candidato com a do item do TR (semântica, não palavra-chave exata).
2. "scoreEspecificacao": quão bem as características técnicas do candidato batem com a especificação técnica do TR.
3. "scoreUnidadeQuantidade": se a unidade de medida e a ordem de grandeza da quantidade são compatíveis.

Se o candidato vier desmembrado (ex.: TR pede "1 conjunto" e o candidato é só uma parte, como "mesa"), ou a
unidade não bate diretamente e precisar de conversão (ex.: metro linear vs. unidade), marque "adaptado": true
e reduza "scoreUnidadeQuantidade" proporcionalmente à incerteza da conversão. Caso contrário "adaptado": false.

Preencha "justificativa" com 1-2 frases explicando o principal motivo do score, citando o parâmetro mais
relevante e sua porcentagem — isso será usado como justificativa formal num processo administrativo.

Responda APENAS com um array JSON, na mesma ordem dos candidatos, sem texto adicional, sem markdown, no formato:
[{ "scoreDescricao": number, "scoreEspecificacao": number, "scoreUnidadeQuantidade": number, "adaptado": boolean, "justificativa": string }]`;
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
      const avaliacao = avaliacoes[idx];
      if (!avaliacao) {
        throw new Error(`Resposta da IA não cobre o candidato ${idx}.`);
      }
      return {
        candidato,
        scoreFinal: 0, // calculado pelo orquestrador via calcularScoreFinal
        scoreDescricao: avaliacao.scoreDescricao,
        scoreEspecificacao: avaliacao.scoreEspecificacao,
        scoreUnidadeQuantidade: avaliacao.scoreUnidadeQuantidade,
        adaptado: avaliacao.adaptado,
        justificativa: avaliacao.justificativa,
      };
    });
  }
}
