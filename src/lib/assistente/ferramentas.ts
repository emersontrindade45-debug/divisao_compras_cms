import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { avaliarConformidade } from "@/lib/domain/conformidade";
import { MIN_FORNECEDORES_PESQUISA_DIRETA } from "@/lib/domain/in65Rules";
import { CV_ANALISE_CRITICA } from "@/lib/domain/priceStats";
import { filtrarPorValor } from "@/lib/integracoes/pncp";
import { buscarCandidatosPublicos } from "@/lib/similaridade/buscarCandidatosPublicos";
import { ordenarResultadoBusca } from "@/lib/similaridade/ordenarResultadoBusca";
import {
  buscarWebPerplexity,
  perplexityConfigurada,
  type ResultadoWeb,
} from "@/lib/integracoes/perplexity";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import { filtrarResultadosWeb, resumirDescartes } from "./guardas";
import type { ChamadaFerramenta, ExecutorFerramenta, ResultadoFerramenta } from "./laco";
import {
  MAX_SUGESTOES_POR_BUSCA,
  paraSugestao,
  type CandidatoSugerido,
} from "./sugestoes";

// Registry de ferramentas do assistente (M13).
//
// **Todas as ferramentas aqui são de leitura.** O assistente não grava nada:
// ele busca, comenta e propõe. Quem registra um candidato na lista do processo
// é o servidor, clicando no cartão que aparece no chat — ver
// `adicionarCandidatoSugerido` em `lib/actions/assistente.ts`.
//
// Foi uma decisão tomada com o usuário: ele quer conferir o link da contratação
// antes de ela entrar na lista. O efeito colateral é de conformidade e é bem-
// vindo — a escrita passa a ser ato humano registrado, não decisão do modelo.
//
// As duas invariantes do M13 continuam valendo, agora do outro lado do clique:
//
// 1. **O modelo nunca digita um preço.** `buscar_pncp` devolve as sugestões
//    junto do passo, e elas são persistidas com a mensagem; a aprovação relê o
//    candidato de lá pelo id. Nem o modelo nem o navegador conseguem injetar
//    valor, órgão ou data — o preço só existe onde a fonte o colocou.
//
// 2. **O modelo nunca atribui um score.** A aprovação roda o mesmo
//    `rankearCandidatos` do pipeline automático, para candidato do assistente e
//    candidato do robô ficarem comparáveis na mesma tabela.

/** Quantos resultados de busca web voltam ao modelo (o resto vira ruído caro). */
const MAX_RESULTADOS_WEB = 8;

/**
 * Teto de tempo por provedor em `buscar_pncp`, sobrescrevendo o padrão de 25s
 * do registry (`REGISTRY_PROVEDORES_PUBLICOS`). Igual ao prazo real que o
 * próprio PNCP já se impõe internamente (`TEMPO_MAX_BUSCA_MS` em
 * `integracoes/pncp.ts`) — os outros três provedores (Painel de Preços,
 * Compras.gov/catálogo, SINAPI) passam a respeitar o mesmo teto, então trocar
 * de 1 para 4 fontes não muda o pior caso de tempo que `ORCAMENTO_TEMPO_TURNO_MS`
 * (35s, `laco.ts`) já foi calibrado para tolerar.
 */
const TIMEOUT_BUSCA_ASSISTENTE_MS = 12_000;

export interface ContextoFerramentas {
  userId: string;
  /** Nulo na conversa global; preenchido na aba de um processo. */
  processoId: string | null;
  conversaId: string;
}

/** Definição enviada ao modelo — espelha `DefinicaoFerramenta` de `lib/ia`. */
export interface DefinicaoFerramentaJson {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
}

export interface Registry {
  definicoes: DefinicaoFerramentaJson[];
  executar: ExecutorFerramenta;
}

/** Erro de argumento inválido: volta ao modelo como resultado, não derruba o turno. */
class ArgumentosInvalidosError extends Error {}

// ---------------------------------------------------------------------------
// Schemas dos argumentos (CLAUDE.md §9.12 — tool call de modelo é entrada não
// confiável e passa por Zod como qualquer outra fronteira).
// ---------------------------------------------------------------------------

const comProcesso = z.object({
  processoId: z.string().min(1).optional(),
});

const buscaGlobalSchema = z.object({
  termo: z.string().min(2, "O termo de busca precisa de ao menos 2 caracteres."),
});

const buscarPncpSchema = z
  .object({
    termo: z.string().min(2, "O termo de busca precisa de ao menos 2 caracteres."),
    /** Item para o qual a busca foi feita; vira o destino sugerido nos cartões. */
    itemId: z.string().min(1).optional(),
    /**
     * Faixa de valor opcional, aplicada sobre o preço homologado dos
     * candidatos (o PNCP não tem esse filtro nativamente — ver `pncp.ts`).
     */
    valorMinimo: z.number().positive().optional(),
    valorMaximo: z.number().positive().optional(),
  })
  .refine(
    (v) => v.valorMinimo === undefined || v.valorMaximo === undefined || v.valorMinimo <= v.valorMaximo,
    { message: "valorMinimo não pode ser maior que valorMaximo.", path: ["valorMinimo"] },
  );

const buscarWebSchema = z.object({
  consulta: z.string().min(3, "A consulta precisa de ao menos 3 caracteres."),
  recencia: z.enum(["day", "week", "month", "year"]).optional(),
});

const rascunharSchema = z.object({
  tipo: z.enum(["aderencia_fonte", "metodologia_serie", "rota_fornecedores"], {
    message:
      "tipo deve ser um de: aderencia_fonte, metodologia_serie, rota_fornecedores.",
  }),
  processoId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------

function parseArgumentos<T>(schema: z.ZodType<T>, bruto: string): T {
  let json: unknown;
  try {
    json = bruto.trim() ? JSON.parse(bruto) : {};
  } catch {
    throw new ArgumentosInvalidosError(
      "Os argumentos não são JSON válido. Reenvie a chamada com JSON bem formado.",
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const detalhe = parsed.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    throw new ArgumentosInvalidosError(`Argumentos inválidos — ${detalhe.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Resolve de qual processo a ferramenta fala.
 *
 * Numa conversa de processo o escopo é fixo: aceitar um `processoId` diferente
 * vindo do modelo deixaria o assistente ler (e escrever) num processo que não é
 * o da tela.
 */
function resolverProcesso(ctx: ContextoFerramentas, informado?: string): string {
  if (ctx.processoId) {
    if (informado && informado !== ctx.processoId) {
      throw new ArgumentosInvalidosError(
        "Esta conversa está presa ao processo aberto; não é possível consultar outro processo por aqui.",
      );
    }
    return ctx.processoId;
  }
  if (!informado) {
    throw new ArgumentosInvalidosError(
      "Esta é a conversa geral: informe o processoId. Use `busca_global` para descobri-lo.",
    );
  }
  return informado;
}

export function montarRegistry(ctx: ContextoFerramentas): Registry {
  /**
   * Candidatos devolvidos pelas buscas deste turno, por id curto. É o que torna
   * impossível registrar um preço que nenhuma busca produziu.
   */
  const catalogo = new Map<string, CandidatoSimilaridade>();
  let sequencia = 0;

  /** Listas de sites, carregadas no máximo uma vez por conversa. */
  let listasSite: { permitidos: string[]; bloqueados: string[] } | null = null;
  async function carregarListasSite() {
    if (listasSite) return listasSite;
    const sites = await db.site.findMany({
      where: { lista: { in: ["branca", "vermelha"] } },
      select: { url: true, lista: true },
    });
    const dominio = (url: string) => {
      try {
        return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    };
    listasSite = {
      permitidos: sites.filter((s) => s.lista === "branca").map((s) => dominio(s.url)).filter((d): d is string => Boolean(d)),
      bloqueados: sites.filter((s) => s.lista === "vermelha").map((s) => dominio(s.url)).filter((d): d is string => Boolean(d)),
    };
    return listasSite;
  }

  function catalogar(candidatos: CandidatoSimilaridade[]) {
    return candidatos.map((candidato) => {
      const id = `c${++sequencia}`;
      catalogo.set(id, candidato);
      return {
        id,
        descricao: candidato.fonteDescricao,
        orgao: candidato.fonteOrgaoOuId,
        valorUnitario: candidato.valorUnitario,
        unidade: candidato.unidade,
        dataReferencia: candidato.dataReferencia.toISOString().slice(0, 10),
        url: candidato.fonteUrl ?? null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  async function lerTR(processoId: string) {
    const processo = await db.processo.findUnique({
      where: { id: processoId },
      select: { id: true, numero: true, trContexto: true },
    });
    if (!processo) throw new ArgumentosInvalidosError("Processo não encontrado.");
    if (!processo.trContexto) {
      return {
        disponivel: false,
        mensagem:
          "Nenhum TR foi processado para este processo ainda. " +
          "Peça ao servidor para fazer upload do PDF do Termo de Referência na aba de Pesquisa.",
      };
    }
    // Texto integral do PDF, sem interpretação prévia por IA — o TR varia muito de
    // estrutura por tipo de objeto (bens, serviços contínuos, obras), e uma extração
    // em campos fixos (tabela de itens / modelo de execução / materiais) descartava
    // silenciosamente conteúdo real quando a nomenclatura de seção não batia com a
    // esperada (processo 908/2022). O texto completo garante que nada se perde; cabe
    // ao próprio assistente localizar a informação relevante dentro dele.
    return {
      disponivel: true,
      numero: processo.numero,
      textoIntegral: processo.trContexto,
    };
  }

  async function lerProcesso(processoId: string) {
    const processo = await db.processo.findUnique({
      where: { id: processoId },
      select: {
        id: true,
        numero: true,
        objeto: true,
        status: true,
        responsavel: true,
        dataAbertura: true,
        itens: {
          select: {
            id: true,
            descricao: true,
            unidade: true,
            quantidade: true,
            classificacao: true,
            caracteristicasTecnicas: true,
            palavrasChave: true,
            _count: { select: { fontes: true, resultadosSimilaridade: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!processo) throw new ArgumentosInvalidosError("Processo não encontrado.");

    return {
      numero: processo.numero,
      objeto: processo.objeto,
      status: processo.status,
      responsavel: processo.responsavel,
      dataAbertura: processo.dataAbertura.toISOString().slice(0, 10),
      itens: processo.itens.map((item) => ({
        itemId: item.id,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        classificacao: item.classificacao,
        especificacao: item.caracteristicasTecnicas ?? "",
        palavrasChave: item.palavrasChave,
        totalFontes: item._count.fontes,
        totalCandidatos: item._count.resultadosSimilaridade,
      })),
    };
  }

  async function lerCandidatos(processoId: string) {
    const itens = await db.item.findMany({
      where: { processoId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        descricao: true,
        unidade: true,
        quantidade: true,
        resultadosSimilaridade: {
          orderBy: { scoreFinal: "desc" },
          take: 5,
          select: {
            id: true,
            tipoCandidato: true,
            fonteDescricao: true,
            fonteOrgaoOuId: true,
            fonteUrl: true,
            valorUnitario: true,
            dataReferencia: true,
            scoreFinal: true,
            justificativa: true,
            promovidoParaFonte: true,
          },
        },
      },
    });

    return itens.map((item) => ({
      itemId: item.id,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      candidatos: item.resultadosSimilaridade.map((r) => ({
        descricao: r.fonteDescricao,
        orgao: r.fonteOrgaoOuId,
        valorUnitario: Number(r.valorUnitario),
        dataReferencia: r.dataReferencia.toISOString().slice(0, 10),
        score: Number(r.scoreFinal),
        justificativa: r.justificativa,
        jaPromovido: r.promovidoParaFonte,
        url: r.fonteUrl,
      })),
    }));
  }

  async function lerConformidade(processoId: string) {
    const processo = await db.processo.findUnique({
      where: { id: processoId },
      select: {
        itens: {
          select: {
            natureza: true,
            fontes: {
              select: {
                id: true,
                tipo: true,
                status: true,
                dataReferencia: true,
                _count: { select: { evidencias: true } },
              },
            },
            seriePrecos: {
              select: {
                precosIncluidos: true,
                valorEstimado: true,
                coeficienteVariacao: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            _count: { select: { resultadosSimilaridade: true } },
          },
        },
        _count: { select: { capturas: true } },
        cotacoes: {
          select: {
            id: true,
            status: true,
            proposta: { select: { statusGeral: true } },
          },
        },
      },
    });
    if (!processo) throw new ArgumentosInvalidosError("Processo não encontrado.");

    const serie = processo.itens.flatMap((i) => i.seriePrecos)[0];

    return avaliarConformidade({
      temItens: processo.itens.length > 0,
      fontes: processo.itens.flatMap((item) =>
        item.fontes.map((f) => ({
          id: f.id,
          tipo: f.tipo,
          status: f.status,
          dataReferencia: f.dataReferencia,
          totalEvidencias: f._count.evidencias,
          naturezaObjeto: item.natureza,
        })),
      ),
      capturas: processo._count.capturas,
      resultadosSimilaridade: processo.itens.reduce(
        (total, item) => total + item._count.resultadosSimilaridade,
        0,
      ),
      cotacoes: processo.cotacoes.map((c) => ({
        id: c.id,
        status: c.status,
        temProposta: c.proposta !== null,
        propostaStatus: c.proposta?.statusGeral,
      })),
      serie: serie
        ? {
            precosIncluidos: serie.precosIncluidos,
            valorEstimado: Number(serie.valorEstimado),
            coeficienteVariacao: Number(serie.coeficienteVariacao),
          }
        : undefined,
    });
  }

  async function buscarProcessos(termo: string) {
    const processos = await db.processo.findMany({
      where: {
        OR: [
          { objeto: { contains: termo, mode: "insensitive" } },
          { numero: { contains: termo, mode: "insensitive" } },
        ],
      },
      select: { id: true, numero: true, objeto: true, status: true },
      take: 6,
      orderBy: { dataAbertura: "desc" },
    });
    return { processos };
  }

  // -------------------------------------------------------------------------
  // Busca externa
  // -------------------------------------------------------------------------

  /**
   * Empurra para o fim os candidatos cuja URL já foi descartada pelo analista
   * neste processo — sem excluir nenhum. `total`/`encontrados` continuam
   * intactos; só a ORDEM muda, e só entre eles mesmos e o resto (estável:
   * preserva a ordem relativa dentro de cada grupo).
   *
   * **Por que demover, não filtrar.** Até 2026-08-11 (commit eb9cf46) um
   * candidato descartado era EXCLUÍDO da busca para sempre: o analista mudava
   * de ideia e não tinha como reaproveitar, porque o card nunca mais aparecia.
   * A demoção preserva essa correção — o card ainda pode aparecer — e ataca o
   * problema oposto, medido em 2026-08-14 pela régua de
   * `scripts/avaliar-busca-pncp.ts`: sem nenhum sinal de descarte na ordem,
   * 76-79% dos candidatos já descartados reapareciam dentro do corte de 25,
   * empurrando candidato nunca visto para fora só porque o edital dele chegou
   * depois na busca textual do PNCP.
   *
   * **Por que é seguro para o recall.** Um candidato só entra no conjunto
   * demovido se JÁ tem `descartado: true` no banco — decisão humana anterior,
   * não inferência de texto. Um candidato "fonte" (virou preço) ou "mantido"
   * nunca é `descartado`, então esta função não pode empurrá-lo: ao contrário
   * do primeiro fix tentado aqui (reordenar por contagem de token, revertido
   * por derrubar a visibilidade de candidatos-fonte com correspondência
   * textual fraca — ver histórico do commit), este não tem como confundir
   * "texto parecido pouco" com "já julgado ruim".
   *
   * **A chave é (URL do edital + descrição do item), não a URL sozinha.**
   * `fonteUrl` de um candidato do PNCP é a URL do EDITAL
   * (`/app/editais/{cnpj}/{ano}/{seq}`), compartilhada por todos os itens da
   * mesma compra — ver `montarUrlEdital` em `integracoes/pncp.ts`. Enquanto a
   * chave era só a URL, descartar UM item de uma ata demovia todos os irmãos
   * dele junto, inclusive os bons: numa ata de registro de preços com dezenas
   * de itens comparáveis, um único descarte empurrava a ata inteira para o fim
   * da lista. `numeroItem` seria a chave exata, mas `ResultadoSimilaridade` não
   * tem essa coluna e criá-la exigiria migration (CLAUDE.md §9.19/§9.46); a
   * descrição já distingue itens dentro do mesmo edital com as colunas que
   * existem hoje.
   */
  function chaveDescarte(fonteUrl: string | null, fonteDescricao: string): string {
    return `${fonteUrl ?? ""} ${fonteDescricao.trim().toLowerCase()}`;
  }

  async function demoverJaDescartados(
    processoId: string | null,
    candidatos: CandidatoSimilaridade[],
  ): Promise<CandidatoSimilaridade[]> {
    if (!processoId || candidatos.length === 0) return candidatos;

    const descartados = await db.resultadoSimilaridade.findMany({
      where: { item: { processoId }, descartado: true, fonteUrl: { not: null } },
      select: { fonteUrl: true, fonteDescricao: true },
    });
    const chavesDescartadas = new Set(
      descartados.map((d) => chaveDescarte(d.fonteUrl, d.fonteDescricao)),
    );
    if (chavesDescartadas.size === 0) return candidatos;

    const foiDescartado = (c: CandidatoSimilaridade) =>
      Boolean(c.fonteUrl) && chavesDescartadas.has(chaveDescarte(c.fonteUrl ?? null, c.fonteDescricao));

    const novos = candidatos.filter((c) => !foiDescartado(c));
    const jaDescartados = candidatos.filter((c) => foiDescartado(c));
    return [...novos, ...jaDescartados];
  }

  /**
   * Natureza do item para a janela de recência da IN 65/2021. O `itemId` vem do
   * modelo e nem sempre é um id real — no uso medido em produção ele já chegou
   * como `"1"`, `"item-1"` e `"0908/2022"` (número do processo). Um id que não
   * resolve devolve `null`, que é a janela mais permissiva (730 dias): degrada
   * para o comportamento anterior em vez de falhar a busca.
   */
  async function naturezaDoItem(
    itemId: string | null,
  ): Promise<"bem_consumo" | "servico_continuo" | null> {
    if (!itemId) return null;
    const item = await db.item.findUnique({
      // `select` explícito, nunca `include`: coluna nova no schema quebraria a
      // consulta em produção antes da migration rodar (CLAUDE.md §9.46).
      where: { id: itemId },
      select: { natureza: true, processoId: true },
    });
    if (!item) return null;
    // Item de outro processo não governa a janela desta conversa.
    if (ctx.processoId && item.processoId !== ctx.processoId) return null;
    return item.natureza;
  }

  async function buscarPncp(
    termo: string,
    itemIdSugerido: string | null,
    valorMinimo?: number,
    valorMaximo?: number,
  ) {
    const temFiltroValor = valorMinimo !== undefined || valorMaximo !== undefined;
    const buscados = await buscarCandidatosPublicos(termo, {
      timeoutMsPorProvedor: TIMEOUT_BUSCA_ASSISTENTE_MS,
    });
    const filtrados = filtrarPorValor(buscados, { valorMinimo, valorMaximo });

    // Ranqueia ANTES de demover: a demoção precisa ter a última palavra sobre
    // candidato já rejeitado pelo analista, senão a aderência textual o traria
    // de volta para o topo — era exatamente o defeito de ordenar por texto que
    // levou à demoção existir (ver `demoverJaDescartados`).
    const ordenados = ordenarResultadoBusca(filtrados, termo, {
      naturezaObjeto: await naturezaDoItem(itemIdSugerido),
      minimoExibido: MAX_SUGESTOES_POR_BUSCA,
    });
    const encontrados = await demoverJaDescartados(ctx.processoId, ordenados);

    // Nenhum candidato é excluído por já ter sido descartado numa busca
    // anterior — o card continua podendo aparecer, e o analista pode mudar de
    // ideia. `demoverJaDescartados` só reordena: candidatos já descartados vão
    // para o fim, para não ocupar o corte de 25 na frente de algo nunca visto.
    if (encontrados.length === 0) {
      return {
        resposta: {
          termo,
          total: 0,
          candidatos: [],
          observacao: temFiltroValor
            ? "Nenhuma fonte pública devolveu nada para este termo dentro da faixa de valor " +
              "informada. Tente ampliar a faixa ou remover o filtro de valor antes de trocar o termo."
            : "Nenhuma fonte pública (PNCP, Painel de Preços, Compras.gov, SINAPI) devolveu nada " +
              "para este termo. Tente outro recorte: troque o substantivo-núcleo, remova " +
              "qualificadores ou use o nome comercial do produto.",
        },
        sugestoes: [] as CandidatoSugerido[],
      };
    }

    // O mesmo corte vale para o que o modelo lê e para o que vira cartão: se o
    // modelo enxergasse mais do que a tela mostra, ele citaria um candidato sem
    // botão para aprovar.
    const candidatos = encontrados.slice(0, MAX_SUGESTOES_POR_BUSCA);
    const catalogados = catalogar(candidatos);

    return {
      resposta: {
        termo,
        total: encontrados.length,
        exibidos: catalogados.length,
        candidatos: catalogados,
        observacao:
          "Estes candidatos já apareceram na tela do usuário, cada um com link e botão para " +
          "adicionar à lista do processo. Você NÃO registra nada: comente o que achou de cada " +
          "um (por que é ou não comparável) e deixe a decisão com o servidor. Os valores vêm " +
          "da fonte — não os repita de memória nem estime score.",
      },
      sugestoes: catalogados.map((c) =>
        paraSugestao(c.id, catalogo.get(c.id)!, {
          itemIdSugerido,
          termoBuscaUsado: termo,
        }),
      ),
    };
  }

  async function buscarWeb(consulta: string, recencia?: string) {
    const listas = await carregarListasSite();
    const resposta = await buscarWebPerplexity(consulta, {
      dominiosPermitidos: listas.permitidos,
      dominiosBloqueados: listas.bloqueados,
      ...(recencia ? { recencia } : {}),
    });

    // Guardas em código: o `search_domain_filter` tem teto de 20 domínios e não
    // conhece o CNPJ do próprio órgão. Ver `guardas.ts`.
    const { mantidos, descartados } = filtrarResultadosWeb(resposta.resultados, listas.bloqueados);

    return {
      consulta,
      resumo: resposta.resumo,
      buscadoEm: resposta.buscadoEm.toISOString(),
      resultados: mantidos.slice(0, MAX_RESULTADOS_WEB).map((r: ResultadoWeb) => ({
        titulo: r.titulo,
        url: r.url,
        trecho: r.trecho ?? null,
        dataPublicacao: r.dataPublicacao?.toISOString().slice(0, 10) ?? null,
      })),
      descartes: resumirDescartes(descartados),
      // A restrição precisa chegar ao modelo junto do resultado, e não só no
      // prompt de sistema: é aqui que ele decide o que fazer com o achado.
      aviso:
        "Resultado de web NÃO vira candidato nem evidência. Serve para descobrir onde procurar " +
        "(portais de outros órgãos, atas, editais). Se encontrar uma contratação promissora, " +
        "busque-a no PNCP com `buscar_pncp`. Para usar a página em si como fonte, o servidor " +
        "precisa capturá-la pelo módulo de Sites, que registra data/hora do acesso real.",
    };
  }

  // -------------------------------------------------------------------------
  // Rascunho de justificativa (fase 13.3)
  //
  // A ferramenta é de LEITURA, por decisão de escopo: ela reúne os números reais
  // do processo para o modelo redigir o texto no chat, e não grava em lugar
  // nenhum. Dois motivos concretos:
  //
  // 1. Justificativa é peça de instrução processual. Persistir texto de IA num
  //    campo que hoje só recebe texto humano apagaria a distinção entre os dois
  //    para quem ler os autos depois — e nenhum dos três destinos tem coluna
  //    marcando origem.
  // 2. Dos três, só `ContratacaoPublica.justificativaAderencia` existe no
  //    schema. Os outros dois exigiriam migration, e o M13 já quebrou duas vezes
  //    por código subir antes da migration (CLAUDE.md §9.46).
  //
  // O servidor lê o rascunho, edita e cola onde o fluxo já prevê. É a mesma
  // divisão de trabalho de `registrar_candidatos`: o sistema fornece os dados,
  // a decisão é humana.
  // -------------------------------------------------------------------------

  const dec = (v: { toString(): string } | null | undefined): number =>
    v == null ? 0 : Number(v.toString());

  async function rascunharJustificativa(tipo: string, processoId: string) {
    const processo = await db.processo.findUnique({
      where: { id: processoId },
      // `select` explícito, nunca `include`: coluna nova no schema quebraria a
      // consulta em produção antes da migration rodar (CLAUDE.md §9.46).
      select: {
        id: true,
        numero: true,
        objeto: true,
        itens: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            descricao: true,
            unidade: true,
            quantidade: true,
            fontes: {
              select: {
                id: true,
                tipo: true,
                descricao: true,
                status: true,
                valorUnitario: true,
                dataReferencia: true,
                _count: { select: { evidencias: true } },
              },
            },
            seriePrecos: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                metodo: true,
                valorEstimado: true,
                media: true,
                mediana: true,
                menorValor: true,
                coeficienteVariacao: true,
                totalPrecos: true,
                precosIncluidos: true,
                createdAt: true,
                precos: {
                  select: {
                    fonte: true,
                    descricaoFonte: true,
                    fornecedorOuOrgao: true,
                    valorUnitario: true,
                    dataReferencia: true,
                    status: true,
                    motivoExclusao: true,
                  },
                },
              },
            },
          },
        },
        cotacoes: {
          select: {
            id: true,
            status: true,
            fornecedor: { select: { razaoSocial: true } },
          },
        },
      },
    });
    if (!processo) throw new ArgumentosInvalidosError("Processo não encontrado.");

    const cabecalho = { numero: processo.numero, objeto: processo.objeto };
    const aviso =
      "Este é um RASCUNHO. Nada foi gravado no processo: o texto que você redigir volta ao " +
      "servidor, que revisa, ajusta e insere nos autos. Diga isso na sua resposta.";

    if (tipo === "aderencia_fonte") {
      const itens = processo.itens.map((item) => ({
        itemId: item.id,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        fontes: item.fontes.map((f) => ({
          descricao: f.descricao,
          tipo: f.tipo,
          status: f.status,
          valorUnitario: dec(f.valorUnitario),
          dataReferencia: f.dataReferencia.toISOString().slice(0, 10),
          totalEvidencias: f._count.evidencias,
        })),
      }));

      return {
        tipo,
        persistido: false,
        processo: cabecalho,
        dados: { itens },
        orientacao:
          "Para cada fonte, explique por que o objeto contratado é comparável ao item: mesma " +
          "natureza, especificação equivalente, unidade e quantidade em ordem compatível. " +
          "Aponte as diferenças em vez de omiti-las — adaptação declarada sustenta a fonte; " +
          "adaptação escondida a invalida. Fonte sem evidência anexada não pode ser afirmada " +
          "como comprovada.",
        aviso,
      };
    }

    if (tipo === "metodologia_serie") {
      const series = processo.itens.flatMap((item) =>
        item.seriePrecos.map((s) => {
          const cv = dec(s.coeficienteVariacao);
          return {
            itemId: item.id,
            item: item.descricao,
            metodo: s.metodo,
            valorEstimado: dec(s.valorEstimado),
            media: dec(s.media),
            mediana: dec(s.mediana),
            menorValor: dec(s.menorValor),
            coeficienteVariacao: cv,
            totalPrecos: s.totalPrecos,
            precosIncluidos: s.precosIncluidos,
            consolidadaEm: s.createdAt.toISOString().slice(0, 10),
            // O limite não é opinião do modelo: é o mesmo `CV_ANALISE_CRITICA`
            // que o painel de conformidade aplica (item R-06).
            analiseCriticaObrigatoria: cv > CV_ANALISE_CRITICA,
            precos: s.precos.map((p) => ({
              fonte: p.fonte,
              descricao: p.descricaoFonte,
              fornecedorOuOrgao: p.fornecedorOuOrgao,
              valorUnitario: dec(p.valorUnitario),
              dataReferencia: p.dataReferencia.toISOString().slice(0, 10),
              status: p.status,
              motivoExclusao: p.motivoExclusao,
            })),
          };
        }),
      );

      return {
        tipo,
        persistido: false,
        processo: cabecalho,
        dados: { series, limiteAnaliseCritica: CV_ANALISE_CRITICA },
        orientacao:
          series.length === 0
            ? "Não há série consolidada neste processo ainda. Não redija a memória de cálculo: " +
              "diga ao servidor que é preciso consolidar a série antes."
            : "Descreva a memória de cálculo: quantos preços entraram, quais foram excluídos e " +
              `por quê, qual método foi aplicado e por que ele cabe aqui. Se o CV passar de ` +
              `${CV_ANALISE_CRITICA}%, a análise crítica da dispersão é obrigatória pela IN ` +
              "65/2021 — trate-a como parte do texto, não como observação. Use os números como " +
              "vieram; não recalcule nem arredonde por conta própria.",
        aviso,
      };
    }

    // rota_fornecedores
    const fontesIncluidas = processo.itens.flatMap((i) =>
      i.fontes.filter((f) => f.status === "incluido"),
    );
    const usouFontePublica = fontesIncluidas.some((f) => f.tipo === "contratacao_publica");
    const semResposta = processo.cotacoes
      .filter((c) => c.status === "silenciosa")
      .map((c) => c.fornecedor?.razaoSocial ?? "(fornecedor sem razão social)");

    return {
      tipo,
      persistido: false,
      processo: cabecalho,
      dados: {
        usouFontePublica,
        tiposDeFonteUsados: [...new Set(fontesIncluidas.map((f) => f.tipo))],
        fornecedoresConsultados: processo.cotacoes.length,
        fornecedoresQueResponderam: processo.cotacoes.length - semResposta.length,
        semResposta,
        atendeMinimoTresFornecedores: processo.cotacoes.length >= MIN_FORNECEDORES_PESQUISA_DIRETA,
      },
      orientacao:
        (usouFontePublica
          ? "Houve fonte pública na pesquisa, que é a rota prioritária da IN 65/2021. Explique " +
            "por que as demais fontes foram somadas a ela."
          : "NÃO houve contratação pública entre as fontes. A IN 65/2021 trata a fonte pública " +
            "como prioritária, então o texto precisa justificar por que ela não foi usada — " +
            "ausência de contratação similar, objeto sem paralelo no PNCP, urgência motivada. " +
            "Sem essa justificativa nos autos, o item R-07 do checklist fica em aberto.") +
        ` A norma pede ao menos ${MIN_FORNECEDORES_PESQUISA_DIRETA} fornecedores consultados na pesquisa ` +
        "direta; registre também os que não responderam, porque a consulta sem resposta é " +
        "parte da diligência e precisa constar.",
      aviso,
    };
  }

  // -------------------------------------------------------------------------
  // Montagem
  // -------------------------------------------------------------------------

  const escopoProcessoParams: Record<string, unknown> = {
    type: "object",
    properties: {
      processoId: {
        type: "string",
        description: ctx.processoId
          ? "Opcional: esta conversa já está no processo aberto."
          : "Obrigatório nesta conversa geral. Descubra com `busca_global`.",
      },
    },
    required: ctx.processoId ? [] : ["processoId"],
  };

  const definicoes: DefinicaoFerramentaJson[] = [
    {
      nome: "ler_processo",
      descricao:
        "Lê o processo e seus itens (descrição, unidade, quantidade, especificação, palavras-chave) " +
        "e quantas fontes e candidatos cada item já tem. Use SEMPRE antes de buscar.",
      parametros: escopoProcessoParams,
    },
    {
      nome: "ler_tr",
      descricao:
        "Lê o texto integral do Termo de Referência (TR) do processo, extraído do PDF sem nenhum " +
        "resumo ou reestruturação prévia — é o documento completo, na íntegra. O TR varia muito de " +
        "estrutura conforme o tipo de objeto (aquisição de bens, serviço contínuo, obra, etc.): " +
        "às vezes há uma tabela explícita de itens com unidade/quantidade; em serviços contínuos " +
        "(ex.: limpeza, vigilância), o 'objeto' costuma ser descrito em metros quadrados/postos de " +
        "trabalho, e o que corresponde a 'materiais e equipamentos' ou 'modelo de execução' pode " +
        "estar disperso em subseções com nomes distintos (ex.: '5.11 Lista de equipamentos', " +
        "'5.3 Da limpeza do espelho d'água'). NÃO espere títulos de seção fixos — leia o texto " +
        "inteiro e localize você mesmo objeto, especificações técnicas, quantidades, frequência de " +
        "execução, materiais/equipamentos exigidos e obrigações contratuais relevantes à pergunta. " +
        "Use quando o usuário perguntar sobre especificações técnicas, exigências de execução ou " +
        "materiais do TR, ou quando precisar de especificações para avaliar candidatos de " +
        "similaridade. Não aceita processoId — opera sempre sobre o processo desta conversa.",
      parametros: { type: "object", properties: {} },
    },
    {
      nome: "ler_candidatos",
      descricao:
        "Lê os candidatos de similaridade já encontrados por item, com score e justificativa. " +
        "Use para diagnosticar por que o resultado ficou fraco antes de tentar outro termo.",
      parametros: escopoProcessoParams,
    },
    {
      nome: "ler_conformidade",
      descricao:
        "Avalia o processo contra a IN 65/2021: etapas do fluxo, checklist e se a suficiência " +
        "da pesquisa foi atingida. Use para saber o que ainda falta.",
      parametros: escopoProcessoParams,
    },
    {
      nome: "busca_global",
      descricao:
        "Procura processos por número ou objeto. Serve para descobrir o processoId quando o " +
        "usuário cita um processo pelo número.",
      parametros: {
        type: "object",
        properties: { termo: { type: "string", description: "Número ou parte do objeto." } },
        required: ["termo"],
      },
    },
    {
      nome: "buscar_pncp",
      descricao:
        "Busca contratações e preços públicos — a fonte prioritária da IN 65/2021 — em todas as " +
        "fontes conectadas de uma vez (PNCP, Painel de Preços, catálogo CATMAT/CATSER do " +
        "Compras.gov e SINAPI). Devolve candidatos com id, valor unitário, órgão e data, já " +
        "deduplicados entre fontes. Contratações da própria Câmara já são excluídas. Varie o " +
        "termo entre chamadas em vez de repetir o mesmo. Cada candidato já aparece na tela do " +
        "usuário como cartão com link e botão de adicionar — você não registra nada, apenas " +
        "ajuda a avaliar.",
      parametros: {
        type: "object",
        properties: {
          termo: {
            type: "string",
            description:
              "Termo curto, com o substantivo que nomeia o produto primeiro. Ex.: 'cadeira " +
              "giratória ergonômica', não 'aquisição de mobiliário para escritório'.",
          },
          itemId: {
            type: "string",
            description:
              "Id do item que você está pesquisando, vindo de `ler_processo`. Informe sempre " +
              "que souber: é ele que deixa o cartão do candidato já apontando para o item " +
              "certo quando o servidor for adicionar à lista.",
          },
          valorMinimo: {
            type: "number",
            description:
              "Opcional. Use quando o usuário pedir uma faixa de preço (ex.: 'entre R$ 18 e " +
              "R$ 25'). Filtra sobre o preço homologado do candidato — o PNCP não tem esse " +
              "filtro nativamente, é aplicado depois da busca.",
          },
          valorMaximo: {
            type: "number",
            description: "Opcional, junto de valorMinimo. Mesmo critério: preço homologado.",
          },
        },
        required: ["termo"],
      },
    },
    {
      nome: "rascunhar_justificativa",
      descricao:
        "Reúne os dados reais do processo para você redigir uma das três justificativas formais " +
        "da IN 65/2021. Devolve números, não texto pronto: quem escreve é você, a partir do que " +
        "vier. O resultado é um RASCUNHO exibido no chat — nada é gravado no processo, e o " +
        "servidor revisa antes de levar aos autos.",
      parametros: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["aderencia_fonte", "metodologia_serie", "rota_fornecedores"],
            description:
              "`aderencia_fonte`: por que cada fonte é comparável ao item. " +
              "`metodologia_serie`: memória de cálculo da série (método, exclusões, dispersão). " +
              "`rota_fornecedores`: a rota de pesquisa escolhida e os fornecedores consultados.",
          },
          processoId: {
            type: "string",
            description: ctx.processoId
              ? "Opcional: esta conversa já está no processo aberto."
              : "Obrigatório nesta conversa geral. Descubra com `busca_global`.",
          },
        },
        required: ctx.processoId ? ["tipo"] : ["tipo", "processoId"],
      },
    },
  ];

  // A busca web só é exposta quando existe chave configurada. Anunciar uma
  // ferramenta que sempre falha gastaria passos do orçamento e faria o modelo
  // insistir nela (CLAUDE.md §9.40 — nada oferecido pode não ter efeito).
  if (perplexityConfigurada()) {
    definicoes.push({
      nome: "buscar_web",
      descricao:
        "Busca na web aberta com citações. Use para DESCOBRIR onde procurar — portais de outros " +
        "órgãos, atas de registro de preços, editais — não para obter preço. Marketplaces e " +
        "contratações da própria Câmara são removidos automaticamente.",
      parametros: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Pergunta em linguagem natural." },
          recencia: {
            type: "string",
            enum: ["day", "week", "month", "year"],
            description: "Janela de recência. Padrão 'year', que casa com a validade da IN 65.",
          },
        },
        required: ["consulta"],
      },
    });
  }

  const executar: ExecutorFerramenta = async (
    chamada: ChamadaFerramenta,
  ): Promise<ResultadoFerramenta> => {
    try {
      switch (chamada.nome) {
        case "ler_processo": {
          const args = parseArgumentos(comProcesso, chamada.argumentos);
          return ok(await lerProcesso(resolverProcesso(ctx, args.processoId)));
        }
        case "ler_tr": {
          if (!ctx.processoId) {
            return ok({
              disponivel: false,
              mensagem: "ler_tr só funciona dentro de um processo. Abra o processo e use o assistente de lá.",
            });
          }
          return ok(await lerTR(ctx.processoId));
        }
        case "ler_candidatos": {
          const args = parseArgumentos(comProcesso, chamada.argumentos);
          return ok(await lerCandidatos(resolverProcesso(ctx, args.processoId)));
        }
        case "ler_conformidade": {
          const args = parseArgumentos(comProcesso, chamada.argumentos);
          return ok(await lerConformidade(resolverProcesso(ctx, args.processoId)));
        }
        case "busca_global": {
          const args = parseArgumentos(buscaGlobalSchema, chamada.argumentos);
          return ok(await buscarProcessos(args.termo));
        }
        case "buscar_pncp": {
          const args = parseArgumentos(buscarPncpSchema, chamada.argumentos);
          const { resposta, sugestoes } = await buscarPncp(
            args.termo,
            args.itemId ?? null,
            args.valorMinimo,
            args.valorMaximo,
          );
          // As sugestões viajam FORA do conteúdo devolvido ao modelo: elas são
          // para a tela e para a aprovação por clique, não para o prompt.
          return { conteudo: JSON.stringify(resposta), sugestoes };
        }
        case "buscar_web": {
          const args = parseArgumentos(buscarWebSchema, chamada.argumentos);
          return ok(await buscarWeb(args.consulta, args.recencia));
        }
        case "rascunhar_justificativa": {
          const args = parseArgumentos(rascunharSchema, chamada.argumentos);
          return ok(
            await rascunharJustificativa(args.tipo, resolverProcesso(ctx, args.processoId)),
          );
        }
        default:
          // `parseArgumentos` nunca roda aqui: nome desconhecido é erro do
          // modelo, e devolvê-lo como resultado deixa ele se corrigir sozinho.
          return falha(`Ferramenta desconhecida: ${chamada.nome}.`);
      }
    } catch (erro) {
      if (erro instanceof ArgumentosInvalidosError) return falha(erro.message);
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      // Erro de infraestrutura é logado no servidor e resumido para o modelo: o
      // laço segue, e ele decide tentar outra fonte (ver `laco.ts`).
      console.error(`[Assistente] Ferramenta ${chamada.nome} falhou:`, erro);
      return falha(`A ferramenta falhou: ${mensagem.slice(0, 300)}`);
    }
  };

  return { definicoes, executar };
}

function ok(dados: unknown): ResultadoFerramenta {
  return { conteudo: JSON.stringify(dados) };
}

function falha(mensagem: string): ResultadoFerramenta {
  return { conteudo: JSON.stringify({ erro: mensagem }), erro: mensagem };
}

export { MAX_RESULTADOS_WEB };
