import "server-only";
import { z } from "zod";
import { getOpenAIClient, OPENAI_MODEL } from "./openaiClient";
import type { ItemExtraidoTR, CandidatoSimilaridade, ScoreSimilaridade, ContextoTR, ProvedorIA } from "./types";

const itemExtraidoTRSchema = z.object({
  descricao: z.string(),
  especificacaoTecnica: z.string(),
  unidade: z.string(),
  quantidade: z.number(),
  termoBusca: z.string().optional(),
});

const extracaoTRSchema = z.object({ itens: z.array(itemExtraidoTRSchema) });

const avaliacaoSimilaridadeSchema = z.object({
  indice: z.number(),
  scoreDescricao: z.number(),
  scoreEspecificacao: z.number(),
  scoreUnidadeQuantidade: z.number(),
  adaptado: z.boolean(),
  justificativa: z.string(),
});

const rankingSchema = z.object({ avaliacoes: z.array(avaliacaoSimilaridadeSchema) });

/** Avaliação bruta retornada pela IA para um candidato, antes do cálculo do scoreFinal. */
type AvaliacaoBruta = Omit<ScoreSimilaridade, "candidato" | "scoreFinal"> & { indice: number };

const contextoTRSchema = z.object({
  tabelaItens: z.string(),
  modeloExecucao: z.string(),
  materiaisEquipamentos: z.string(),
});

const PROMPT_CONTEXTO_TR = `Você é um analista de compras públicas. Leia o Termo de Referência (TR) em anexo
e extraia EXATAMENTE as três seções abaixo, copiando fielmente o conteúdo do documento (sem resumir,
sem parafrasear, sem omitir detalhes técnicos):

1. "tabelaItens": Copie integralmente a tabela de itens do objeto da contratação — aquela que lista
   número do item, especificação/descrição, frequência (quando houver), unidade de medida e quantidade.
   Inclua o parágrafo introdutório que precede a tabela (ex.: "1.1 Contratação de serviços de...").
   Se não houver tabela explícita mas houver lista numerada de itens, copie-a integralmente.

2. "modeloExecucao": Copie integralmente a seção de MODELO DE EXECUÇÃO DO OBJETO (normalmente
   intitulada "Modelo de execução" ou numerada como seção 4, 5 ou 6 do TR). Inclua todas as
   subseções: condições de execução, prazos, dinâmica, especificações técnicas por área/elemento,
   exigências de EPI, restrições de acesso, obrigações de relatório etc.
   Se esta seção não existir no documento, retorne string vazia.

3. "materiaisEquipamentos": Copie integralmente a seção sobre MATERIAIS E EQUIPAMENTOS (normalmente
   intitulada "Materiais e equipamentos" ou similar, geralmente após o modelo de execução).
   Inclua todas as subseções: fornecimento de materiais, armazenamento, EPI/EPC, amostras, prazo
   de correção de negligências etc.
   Se esta seção não existir no documento, retorne string vazia.

Retorne um objeto JSON com os campos "tabelaItens", "modeloExecucao" e "materiaisEquipamentos".
Não resuma — copie o texto original integralmente.`;

const PROMPT_EXTRACAO = `Você é um analista de compras públicas. Leia o Termo de Referência (TR) em anexo
e extraia cada item a ser cotado. Para cada item, retorne um objeto com:
- "descricao": descrição normalizada e objetiva do item
- "especificacaoTecnica": características técnicas detalhadas (material, dimensão, voltagem, etc.)
- "unidade": unidade de medida (ex.: "unidade", "caixa", "metro linear", "pacote")
- "quantidade": quantidade numérica
- "termoBusca": termo curto (2 a 4 palavras) para busca textual em portais de compras públicas.
  Comece SEMPRE pelo substantivo que nomeia o produto (ex.: "caneta", "impressora"), seguido de
  1-3 qualificadores essenciais (ex.: "caneta esferográfica azul"). Não inclua marca, quantidade,
  verbos ("fornecimento", "aquisição", "instalação") nem detalhes de especificação.

Responda com um objeto JSON no formato { "itens": [...] }.`;

function montarPromptRanking(itemTR: ItemExtraidoTR, candidatos: CandidatoSimilaridade[]): string {
  // Só os campos usados na avaliação semântica vão ao prompt — metadados como
  // valor, data e URL não influenciam o score e são reanexados pelo índice depois.
  const candidatosResumidos = candidatos.map((c) => ({
    descricao: c.fonteDescricao,
    unidade: c.unidade,
    quantidade: c.quantidade,
  }));

  return `Você é um analista de produtos especializado em compras públicas, avaliando se contratos
públicos reais são similares a um item de Termo de Referência (TR), para servir de justificativa
formal de preço público (IN SEGES/ME 65/2021).

Sua tarefa é responder, para cada candidato: "isto é o mesmo tipo de produto que o item do TR?" —
como faria um comprador experiente olhando duas descrições de produto, não como um sistema de
correspondência exata de texto. Contratos públicos reais quase nunca repetem a especificação técnica
do TR palavra por palavra (ex.: o TR pode pedir "ponta de tungstênio, 0.7mm, corpo sextavado" e o
contrato só diz "caneta esferográfica azul, escrita fina") — isso NÃO significa que são produtos
diferentes. Identifique primeiro a CATEGORIA/NATUREZA do produto (é uma caneta? um marcador? uma
pasta?); se a categoria bate, o item já é candidato válido, mesmo com detalhes técnicos divergentes
ou ausentes na fonte pública.

ITEM DO TR:
${JSON.stringify(itemTR)}

CANDIDATOS A CONTRATO PÚBLICO, indexados de 0 a ${candidatos.length - 1} (avalie cada um independentemente):
${JSON.stringify(candidatosResumidos)}

Inclua em cada avaliação o campo "indice" com a posição (0-based) do candidato correspondente na lista acima.
É obrigatório retornar exatamente uma avaliação para CADA um dos ${candidatos.length} candidatos, sem pular nenhum.

Para CADA candidato, avalie 3 parâmetros de 0 a 100:
1. "scoreDescricao": é o MESMO TIPO de produto? Pontue alto (70-100) sempre que a categoria/função do
   objeto coincidir (ex.: "caneta esferográfica" do TR vs. "caneta esferográfica" do candidato, mesmo
   com cor ou marca diferentes). Pontue baixo (0-30) apenas quando o produto for de categoria distinta
   (ex.: caneta vs. livro, cadeira vs. mesa).
2. "scoreEspecificacao": dado que já é o mesmo tipo de produto, quão compatíveis são as características
   técnicas disponíveis (material, dimensão, cor, etc.). Quando o candidato não detalha uma característica
   do TR, trate como neutro (não penalize abaixo de 50 só por ausência de informação) — penalize forte
   apenas quando houver characterística CONTRADITÓRIA explícita (ex.: TR pede ponta fina e o candidato
   especifica ponta grossa).
3. "scoreUnidadeQuantidade": se a unidade de medida e a ordem de grandeza da quantidade são compatíveis.

Se o candidato vier desmembrado (ex.: TR pede "1 conjunto" e o candidato é só uma parte, como "mesa"), ou a
unidade não bate diretamente e precisar de conversão (ex.: metro linear vs. unidade), marque "adaptado": true
e reduza "scoreUnidadeQuantidade" proporcionalmente à incerteza da conversão. Caso contrário "adaptado": false.

Preencha "justificativa" com 1-2 frases explicando o principal motivo do score, citando o parâmetro mais
relevante e sua porcentagem — isso será usado como justificativa formal num processo administrativo.

Responda com um objeto JSON no formato { "avaliacoes": [...] }.`;
}

function parseJsonResponse<T>(texto: string, schema: z.ZodType<T>, contexto: string): T {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    throw new Error(
      `[${contexto}] Falha ao fazer parse do JSON retornado pela IA. Trecho recebido: "${texto.slice(0, 500)}"`,
      { cause: erro },
    );
  }

  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(
      `[${contexto}] Resposta da IA não corresponde ao formato esperado: ${resultado.error.message}. Trecho recebido: "${texto.slice(0, 500)}"`,
      { cause: resultado.error },
    );
  }

  return resultado.data;
}

/**
 * Teto por chamada só para a extração do TR (`extrairContextoTR`/`extrairEspecificacaoTR`),
 * mais alto que o padrão de `openaiClient.ts` (20s). Desde que a extração passou a ser uma
 * Server Action isolada, sem o laço de busca por item competindo pelo mesmo `maxDuration`
 * (ver `extrairTR` em `pesquisaSimilaridade.ts`), sobra orçamento para um único attempt mais
 * longo. `maxRetries: 0` é deliberado: repetir uma chamada de visão sobre um PDF grande que já
 * estourou o timeout tende a estourar de novo pelo mesmo motivo — dois attempts curtos têm
 * menos chance de concluir do que um attempt longo.
 */
const OPCOES_EXTRACAO_TR = { timeout: 50_000, maxRetries: 0 };

export class OpenAIProvider implements ProvedorIA {
  async extrairContextoTR(pdfBuffer: Buffer): Promise<ContextoTR> {
    const ai = getOpenAIClient();
    const response = await ai.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_CONTEXTO_TR },
              {
                type: "file",
                file: {
                  filename: "tr.pdf",
                  file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
      },
      OPCOES_EXTRACAO_TR,
    );

    const texto = response.choices[0]?.message?.content ?? "{}";
    return parseJsonResponse(texto, contextoTRSchema, "extrairContextoTR");
  }

  async extrairEspecificacaoTR(pdfBuffer: Buffer): Promise<ItemExtraidoTR[]> {
    const ai = getOpenAIClient();
    const response = await ai.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_EXTRACAO },
              {
                type: "file",
                file: {
                  filename: "tr.pdf",
                  file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
      },
      OPCOES_EXTRACAO_TR,
    );

    const texto = response.choices[0]?.message?.content ?? "{}";
    const { itens } = parseJsonResponse(texto, extracaoTRSchema, "extrairEspecificacaoTR");
    return itens;
  }

  async rankearSimilaridade(
    itemTR: ItemExtraidoTR,
    candidatos: CandidatoSimilaridade[],
  ): Promise<ScoreSimilaridade[]> {
    if (candidatos.length === 0) return [];

    const ai = getOpenAIClient();
    const response = await ai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: montarPromptRanking(itemTR, candidatos) }],
    });

    const texto = response.choices[0]?.message?.content ?? "{}";
    const { avaliacoes } = parseJsonResponse(texto, rankingSchema, "rankearSimilaridade") as {
      avaliacoes: AvaliacaoBruta[];
    };
    const avaliacoesPorIndice = new Map(avaliacoes.map((a) => [a.indice, a]));

    return candidatos.map((candidato, idx) => {
      const avaliacao = avaliacoesPorIndice.get(idx);
      if (!avaliacao) {
        // A IA ocasionalmente omite algum índice em lotes grandes; em vez de
        // descartar o item inteiro, score neutro mantém o candidato visível
        // (com prioridade baixa) para revisão manual.
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
