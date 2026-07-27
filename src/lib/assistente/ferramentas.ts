import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { registrarAuditoria } from "@/lib/auth/audit";
import { avaliarConformidade } from "@/lib/domain/conformidade";
import { buscarContratosPNCP } from "@/lib/integracoes/pncp";
import {
  buscarWebPerplexity,
  perplexityConfigurada,
  type ResultadoWeb,
} from "@/lib/integracoes/perplexity";
import { rankearCandidatos } from "@/lib/similaridade/rankearCandidatos";
import { getProvedorIA } from "@/lib/ia";
import type { CandidatoSimilaridade, ItemExtraidoTR } from "@/lib/ia/types";
import { filtrarResultadosWeb, resumirDescartes } from "./guardas";
import type { ChamadaFerramenta, ExecutorFerramenta, ResultadoFerramenta } from "./laco";

// Registry de ferramentas do assistente (M13).
//
// Duas decisões estruturais valem mais que o resto do arquivo:
//
// 1. **O modelo nunca digita um preço.** `registrar_candidatos` não aceita
//    valor, órgão nem data: aceita apenas IDs de candidatos que uma busca DESTA
//    conversa devolveu, guardados em `catalogo`. Um id desconhecido é recusado.
//    Sem isso, "não invente valores" seria só uma frase no prompt — e a §9.33
//    registra o custo de confundir regra documentada com regra implementada.
//
// 2. **O modelo nunca atribui um score.** `registrar_candidatos` roda o mesmo
//    `rankearCandidatos` do pipeline automático (filtro de recência da IN 65 +
//    corte por score incluídos), para que candidato do assistente e candidato do
//    robô fiquem comparáveis lado a lado na mesma tabela.
//
// A ferramenta de escrita é uma só, e ela cria `ResultadoSimilaridade` — nunca
// `Fonte`, `Evidencia` ou `PrecoConsolidado`. Promover é clique do servidor.

/** Teto de candidatos aceitos numa única chamada de escrita. */
const MAX_CANDIDATOS_POR_REGISTRO = 15;

/** Quantos resultados de busca web voltam ao modelo (o resto vira ruído caro). */
const MAX_RESULTADOS_WEB = 8;

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

const buscarPncpSchema = z.object({
  termo: z.string().min(2, "O termo de busca precisa de ao menos 2 caracteres."),
});

const buscarWebSchema = z.object({
  consulta: z.string().min(3, "A consulta precisa de ao menos 3 caracteres."),
  recencia: z.enum(["day", "week", "month", "year"]).optional(),
});

const registrarSchema = z.object({
  itemId: z.string().min(1),
  candidatoIds: z
    .array(z.string().min(1))
    .min(1, "Informe ao menos um id de candidato devolvido por uma busca.")
    .max(MAX_CANDIDATOS_POR_REGISTRO),
  termoBuscaUsado: z.string().min(1),
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

  async function buscarPncp(termo: string) {
    const candidatos = await buscarContratosPNCP(termo);
    if (candidatos.length === 0) {
      return {
        termo,
        total: 0,
        candidatos: [],
        observacao:
          "O PNCP não devolveu nada para este termo. Tente outro recorte: troque o " +
          "substantivo-núcleo, remova qualificadores ou use o nome comercial do produto.",
      };
    }
    return {
      termo,
      total: candidatos.length,
      candidatos: catalogar(candidatos),
      observacao:
        "Para registrar algum destes, chame `registrar_candidatos` com os ids desta lista. " +
        "Os scores são calculados pelo sistema — não os estime.",
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
  // Escrita — única ferramenta que grava
  // -------------------------------------------------------------------------

  async function registrarCandidatos(args: z.infer<typeof registrarSchema>) {
    const item = await db.item.findUnique({
      where: { id: args.itemId },
      select: {
        id: true,
        processoId: true,
        descricao: true,
        unidade: true,
        quantidade: true,
        caracteristicasTecnicas: true,
      },
    });
    if (!item) throw new ArgumentosInvalidosError("Item não encontrado.");

    // Escopo: numa conversa de processo, não se escreve em item de outro.
    if (ctx.processoId && item.processoId !== ctx.processoId) {
      throw new ArgumentosInvalidosError(
        "Este item pertence a outro processo. Esta conversa só pode registrar candidatos no processo aberto.",
      );
    }

    const desconhecidos = args.candidatoIds.filter((id) => !catalogo.has(id));
    if (desconhecidos.length > 0) {
      throw new ArgumentosInvalidosError(
        `Ids não reconhecidos: ${desconhecidos.join(", ")}. Só é possível registrar candidatos ` +
          "devolvidos por uma busca desta conversa — os dados de preço vêm da fonte, nunca de você.",
      );
    }

    const escolhidos = args.candidatoIds.map((id) => catalogo.get(id)!);

    const itemTR: ItemExtraidoTR = {
      descricao: item.descricao,
      especificacaoTecnica: item.caracteristicasTecnicas ?? "",
      unidade: item.unidade,
      quantidade: item.quantidade,
    };

    // Mesmo motor do pipeline automático: aplica o filtro de recência da IN 65,
    // pontua com os mesmos pesos e corta abaixo do score mínimo. O modelo não
    // participa da nota — só da escolha de quais candidatos submeter.
    const ranqueados = await rankearCandidatos(itemTR, escolhidos, getProvedorIA());

    if (ranqueados.length === 0) {
      return {
        registrados: 0,
        motivo:
          "Nenhum dos candidatos passou no corte: ou está fora da janela de 365 dias da IN 65/2021, " +
          "ou a similaridade com o item ficou abaixo do mínimo. Tente outro termo de busca.",
      };
    }

    // Dedupe best-effort por URL dentro do item: registrar o mesmo candidato
    // duas vezes polui a lista, mas não corrompe a estimativa — o que entra na
    // série é a Fonte, e *aquela* promoção tem guarda atômica e constraint
    // @unique (CLAUDE.md §9.14). Não vale uma migration nova só por isto.
    const urlsExistentes = new Set(
      (
        await db.resultadoSimilaridade.findMany({
          where: { itemId: item.id, fonteUrl: { not: null } },
          select: { fonteUrl: true },
        })
      ).map((r) => r.fonteUrl),
    );

    const novos = ranqueados.filter(
      (r) => !r.candidato.fonteUrl || !urlsExistentes.has(r.candidato.fonteUrl),
    );

    if (novos.length > 0) {
      await db.resultadoSimilaridade.createMany({
        data: novos.map((r) => ({
          itemId: item.id,
          tipoCandidato: r.candidato.tipoCandidato,
          fonteDescricao: r.candidato.fonteDescricao,
          fonteOrgaoOuId: r.candidato.fonteOrgaoOuId,
          fonteUrl: r.candidato.fonteUrl ?? null,
          valorUnitario: r.candidato.valorUnitario,
          dataReferencia: r.candidato.dataReferencia,
          scoreFinal: r.scoreFinal,
          scoreDescricao: r.scoreDescricao,
          scoreEspecificacao: r.scoreEspecificacao,
          scoreUnidadeQuantidade: r.scoreUnidadeQuantidade,
          adaptado: r.adaptado,
          justificativa: r.justificativa,
          origem: "assistente" as const,
          conversaId: ctx.conversaId,
          termoBuscaUsado: args.termoBuscaUsado,
        })),
      });

      await registrarAuditoria({
        userId: ctx.userId,
        processoId: item.processoId,
        acao: "assistente_registrar_candidatos",
        detalhes: {
          itemId: item.id,
          conversaId: ctx.conversaId,
          termoBuscaUsado: args.termoBuscaUsado,
          total: novos.length,
        },
      });
    }

    return {
      registrados: novos.length,
      duplicadosIgnorados: ranqueados.length - novos.length,
      candidatos: novos.map((r) => ({
        descricao: r.candidato.fonteDescricao,
        orgao: r.candidato.fonteOrgaoOuId,
        valorUnitario: r.candidato.valorUnitario,
        score: r.scoreFinal,
      })),
      lembrete:
        "Registrado como CANDIDATO. Ele ainda não é fonte da estimativa: quem promove é o " +
        "servidor, clicando na aba de similaridade do processo.",
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
        "Busca contratações públicas no PNCP — a fonte prioritária da IN 65/2021. Devolve " +
        "candidatos com id, valor unitário, órgão e data. Contratações da própria Câmara já são " +
        "excluídas. Varie o termo entre chamadas em vez de repetir o mesmo.",
      parametros: {
        type: "object",
        properties: {
          termo: {
            type: "string",
            description:
              "Termo curto, com o substantivo que nomeia o produto primeiro. Ex.: 'cadeira " +
              "giratória ergonômica', não 'aquisição de mobiliário para escritório'.",
          },
        },
        required: ["termo"],
      },
    },
    {
      nome: "registrar_candidatos",
      descricao:
        "Registra candidatos no item. Aceita SOMENTE ids devolvidos por `buscar_pncp` nesta " +
        "conversa — você não informa valor, órgão nem data, e não atribui score: o sistema " +
        "recalcula tudo com o mesmo motor do pipeline automático. Não cria fonte da estimativa.",
      parametros: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "Id do item, vindo de `ler_processo`." },
          candidatoIds: {
            type: "array",
            items: { type: "string" },
            description: "Ids dos candidatos (ex.: ['c1','c4']) devolvidos por `buscar_pncp`.",
          },
          termoBuscaUsado: {
            type: "string",
            description: "O termo que produziu estes candidatos. Fica registrado para análise.",
          },
        },
        required: ["itemId", "candidatoIds", "termoBuscaUsado"],
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
          return ok(await buscarPncp(args.termo));
        }
        case "buscar_web": {
          const args = parseArgumentos(buscarWebSchema, chamada.argumentos);
          return ok(await buscarWeb(args.consulta, args.recencia));
        }
        case "registrar_candidatos": {
          const args = parseArgumentos(registrarSchema, chamada.argumentos);
          return ok(await registrarCandidatos(args));
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

export { MAX_CANDIDATOS_POR_REGISTRO, MAX_RESULTADOS_WEB };
