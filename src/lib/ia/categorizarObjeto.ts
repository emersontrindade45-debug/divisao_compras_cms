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

function montarPromptTagCnae(cnaeDescricao: string): string {
  return `Você ajuda a Divisão de Compras a organizar fornecedores por categoria numa planilha de
pesquisa de preços. Dada a descrição oficial de uma atividade CNAE (Receita Federal), gere um
rótulo curto de categoria de fornecedor que resuma essa atividade — o tipo de bem/serviço que uma
empresa com esse CNAE fornece.

DESCRIÇÃO OFICIAL DO CNAE:
${cnaeDescricao}

Regras:
- 1 a 2 palavras (raramente 3), em português, minúsculas (exceto siglas como "TI", "EPI").
- Não copie a descrição inteira — resuma o SUBSTANTIVO principal (ex.: "Comércio varejista de
  artigos de iluminação" → "elétrica"; "Locação de automóveis sem condutor" → "automóvel";
  "Provedores de acesso às redes de comunicações" → "telecomunicações").
- SEMPRE gere um rótulo, mesmo para atividade pouco comum em compra pública (ex.: "Cultivo de
  mamona" → "agricultura") — nunca responda vazio.
- Não se prenda a nenhuma lista de categorias pré-existente: o rótulo pode ser novo.

Responda com um objeto JSON no formato { "categorias": ["rótulo"] } (normalmente 1 item, no
máximo 2 se a atividade cobrir claramente dois ramos distintos).`;
}

/**
 * Gera, via IA, um rótulo curto de categoria a partir da descrição oficial de um CNAE — sem
 * restringir a escolha a uma lista pré-cadastrada (ao contrário de `sugerirCategoriasParaObjeto`).
 *
 * Existe porque o casamento contra `Fornecedor.categoria` (só ~75 tags reais, cadastradas à mão ao
 * longo do tempo) deixava a grande maioria dos ~1.300 CNAEs distintos da base de candidatos CNPJ
 * sem categoria — não por falta de categoria PLAUSÍVEL, mas por falta de categoria já cadastrada
 * que casasse. Decisão do usuário (2026-08-24): a Tag da planilha deve ter o CNAE como referência,
 * não o cadastro atual — mesmo que isso crie tags novas, porque a alternativa é a maioria das
 * empresas descobertas via CNAE ficar sem Tag nenhuma.
 */
export async function gerarTagCnae(cnaeDescricao: string): Promise<string[]> {
  if (!cnaeDescricao.trim()) return [];

  const ai = getOpenAIClient();
  const response = await ai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: montarPromptTagCnae(cnaeDescricao) }],
  });

  const texto = response.choices[0]?.message?.content ?? "{}";
  const { categorias } = parseJsonResponse(texto, categoriasSugeridasSchema, "gerarTagCnae");
  return categorias.map((c) => c.trim()).filter((c) => c.length > 0);
}
