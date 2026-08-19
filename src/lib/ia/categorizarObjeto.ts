// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62) — mesmo motivo de `openaiClient.ts`.
import { z } from "zod";
import { getOpenAIClient, OPENAI_MODEL } from "./openaiClient";
import { parseJsonResponse } from "./openaiProvider";

const categoriasSugeridasSchema = z.object({ categorias: z.array(z.string()) });

function montarPrompt(objeto: string, categoriasDisponiveis: string[]): string {
  return `Você ajuda a Divisão de Compras a achar fornecedores para consultar por e-mail numa pesquisa
de preços. Dado o objeto de um processo de compra, escolha quais categorias de fornecedor (da lista
abaixo, cadastrada na planilha de fornecedores) são relevantes para esse objeto.

OBJETO DO PROCESSO:
${objeto}

CATEGORIAS DISPONÍVEIS (escolha SOMENTE destas, copiando o texto exatamente como está — não invente
categoria nova nem corrija ortografia):
${JSON.stringify(categoriasDisponiveis)}

Escolha só as categorias realmente pertinentes ao objeto (normalmente 1 a 3). Se nenhuma categoria da
lista for pertinente, retorne uma lista vazia — não force uma escolha aproximada.

Responda com um objeto JSON no formato { "categorias": [...] }.`;
}

/**
 * Sugere, via IA, quais categorias reais de fornecedor (cadastradas na planilha — texto livre, não
 * um enum fechado) combinam com o objeto de um processo. Nunca confia cegamente no retorno do modelo:
 * filtra qualquer categoria que a IA "inventou" e que não está em `categoriasDisponiveis`, porque o
 * casamento posterior (`buscarFornecedorPorCamada`) é por igualdade exata de string — uma categoria
 * alucinada nunca bateria com nenhum fornecedor mesmo sem esse filtro, mas filtrar explicitamente
 * documenta a garantia e evita propagar lixo para a UI (CLAUDE.md §9.12).
 */
export async function sugerirCategoriasParaObjeto(
  objeto: string,
  categoriasDisponiveis: string[],
): Promise<string[]> {
  if (!objeto.trim() || categoriasDisponiveis.length === 0) return [];

  const ai = getOpenAIClient();
  const response = await ai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: montarPrompt(objeto, categoriasDisponiveis) }],
  });

  const texto = response.choices[0]?.message?.content ?? "{}";
  const { categorias } = parseJsonResponse(texto, categoriasSugeridasSchema, "sugerirCategoriasParaObjeto");

  const disponiveisSet = new Set(categoriasDisponiveis);
  return categorias.filter((c) => disponiveisSet.has(c));
}
