import "server-only";
import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import type {
  ItemExtraidoTR,
  CandidatoSimilaridade,
  ScoreSimilaridade,
  ProvedorIA,
} from "./types";

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

function parseJsonResponse<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(limpo) as T;
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
    return parseJsonResponse<ItemExtraidoTR[]>(texto);
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
    type AvaliacaoBruta = {
      scoreDescricao: number;
      scoreEspecificacao: number;
      scoreUnidadeQuantidade: number;
      adaptado: boolean;
      justificativa: string;
    };
    const avaliacoes = parseJsonResponse<AvaliacaoBruta[]>(texto);

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
