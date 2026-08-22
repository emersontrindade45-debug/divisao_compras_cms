// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62) — mesmo motivo de `categorizarObjeto.ts`:
// precisa ser importável por script administrativo fora do bundler do Next.
import { z } from "zod";
import { getOpenAIClient, OPENAI_MODEL } from "./openaiClient";
import { parseJsonResponse } from "./openaiProvider";

const cnaesSugeridosSchema = z.object({ cnaes: z.array(z.string()) });

/**
 * Subclasse CNAE (7 dígitos) com a descrição oficial, como aparece na base da Receita.
 *
 * São 7 dígitos, e não a classe de 5, por medição (2026-08-22): agrupar por 5 obriga a escolher UMA
 * descrição para representar o grupo, e a escolhida pode não descrever o que a Divisão procura — a
 * classe 47610 herdava "Comércio varejista de livros" da primeira subclasse, escondendo
 * "4761003 Comércio varejista de artigos de papelaria" (15.774 empresas). Buscar caneta não trazia
 * papelaria nenhuma. O catálogo de 1.313 subclasses ocupa ~23k tokens, que cabem no prompt.
 */
export interface ClasseCnae {
  classe: string;
  descricao: string;
}

function montarPrompt(objeto: string, classes: ClasseCnae[]): string {
  const catalogo = classes.map((c) => `${c.classe} ${c.descricao}`).join("\n");

  return `Você ajuda a Divisão de Compras da Câmara Municipal de Santos a encontrar empresas que
possam FORNECER o objeto de um processo de compra, para consultá-las por e-mail numa pesquisa de
preços (IN SEGES/ME 65/2021).

OBJETO DO PROCESSO:
${objeto}

Abaixo está o catálogo de subclasses CNAE (7 dígitos) presentes na base de empresas ativas de São
Paulo. Escolha as subclasses cujas empresas realmente PODEM FORNECER esse objeto.

REGRAS:
- Escolha SOMENTE códigos que aparecem no catálogo, copiando os 7 dígitos exatamente.
- Pense em quem VENDE ou EXECUTA o objeto, não em quem o consome.
- Se o objeto for um PRODUTO, percorra as três formas de fornecê-lo e inclua as que existirem no
  catálogo: (a) comércio VAREJISTA do produto, (b) comércio ATACADISTA/distribuidor do produto,
  (c) FABRICANTE. O órgão normalmente compra do comércio, então NUNCA devolva só o fabricante —
  se você listou uma fabricação, procure também o atacado e o varejo correspondentes.
- Se o objeto for um SERVIÇO, inclua quem executa o serviço. Um serviço não é fornecido por quem
  fabrica os insumos dele: para "lavagem de prédio", quem atende é limpeza predial e serviços de
  fachada — NÃO fabricante de sabão.
- Objetos vêm abreviados e truncados ("PM - Lavagem Prédio"). Interprete a intenção de compra por
  trás da abreviação em vez de casar palavra por palavra.
- Inclua APENAS códigos pertinentes: é melhor 2 certos que 5 com 3 irrelevantes, porque cada
  irrelevante enche a lista do analista de empresas que não atendem o objeto. Não force para atingir
  um número; se nada for pertinente, retorne lista vazia.

CATÁLOGO DE SUBCLASSES CNAE:
${catalogo}

Responda com um objeto JSON no formato { "cnaes": ["1234567", "8901234"] }.`;
}

/**
 * Sugere, via IA, quais subclasses CNAE (7 dígitos) reúnem empresas capazes de fornecer o objeto de um
 * processo. É a ponte entre a linguagem do processo ("lavagem de fachada", "caneta esferográfica") e
 * a taxonomia da Receita, que é o que permite alcançar os milhões de candidatos importados — o
 * cadastro próprio de `Fornecedor` tem poucas empresas e por si só não sustenta uma pesquisa de
 * preços com ≥3 fornecedores consultados.
 *
 * Mesmo filtro anti-alucinação de `sugerirCategoriasParaObjeto` (CLAUDE.md §9.12): descarta qualquer
 * código que a IA tenha inventado e que não esteja no catálogo recebido. Aqui o filtro é mais do que
 * documentação da garantia — um código inventado mas sintaticamente válido buscaria empresas reais
 * de uma atividade errada, trazendo fornecedor que não atende o objeto para dentro da cotação.
 */
/**
 * Tamanho do lote de subclasses por chamada. 200 foi o valor medido como suficiente para o modelo
 * enxergar o catálogo inteiro do lote; catálogos maiores degradam a escolha (ver comentário em
 * `sugerirCnaesParaObjeto`).
 */
const TAMANHO_LOTE = 200;

/**
 * Uma chamada de IA sobre um lote do catálogo. Erro em um lote não derruba a sugestão inteira: os
 * demais lotes já cobrem a maior parte do catálogo, e devolver as opções encontradas é melhor que
 * falhar a sugestão toda por causa de um lote (a alternativa seria o analista não receber nada).
 */
async function escolherNoLote(objeto: string, lote: ClasseCnae[]): Promise<string[]> {
  try {
    const ai = getOpenAIClient();
    const response = await ai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: montarPrompt(objeto, lote) }],
    });

    const texto = response.choices[0]?.message?.content ?? "{}";
    const { cnaes } = parseJsonResponse(texto, cnaesSugeridosSchema, "sugerirCnaesParaObjeto");

    const doLote = new Set(lote.map((c) => c.classe));
    // Normaliza antes de comparar: o modelo às vezes devolve o código com pontuação ("45.20-0/1"),
    // e só os dígitos identificam a subclasse.
    return cnaes.map((c) => c.replace(/\D/g, "").slice(0, 7)).filter((c) => doLote.has(c));
  } catch {
    return [];
  }
}

export async function sugerirCnaesParaObjeto(
  objeto: string,
  classesDisponiveis: ClasseCnae[],
): Promise<string[]> {
  if (!objeto.trim() || classesDisponiveis.length === 0) return [];

  // Lotes em vez de uma chamada com o catálogo inteiro. Medido em 2026-08-22 com o catálogo real
  // (1.313 subclasses): numa chamada única o modelo escolhia por proximidade de CÓDIGO em vez de
  // significado — para "caneta esferográfica" devolvia "Fabricação de guarda-chuvas" (3299001,
  // vizinho numérico de 3299002) e não enxergava "Comércio varejista de artigos de papelaria"
  // (4761003, 15.774 empresas), que é de quem o órgão de fato compra. Em lotes de 200 o mesmo
  // objeto passou a achar varejo E atacado de papelaria. Os lotes são independentes, então rodam em
  // paralelo: 7 chamadas levaram 1,5s no total.
  //
  // Ordenado por código para o particionamento ser estável entre execuções — com lotes variando a
  // cada chamada, o mesmo objeto poderia render listas diferentes.
  const ordenadas = [...classesDisponiveis].sort((a, b) => a.classe.localeCompare(b.classe));
  const lotes: ClasseCnae[][] = [];
  for (let i = 0; i < ordenadas.length; i += TAMANHO_LOTE) {
    lotes.push(ordenadas.slice(i, i + TAMANHO_LOTE));
  }

  const porLote = await Promise.all(lotes.map((lote) => escolherNoLote(objeto, lote)));

  const disponiveisSet = new Set(classesDisponiveis.map((c) => c.classe));
  return [...new Set(porLote.flat())].filter((c) => disponiveisSet.has(c)).sort();
}
