import "server-only";
import type { CandidatoSimilaridade } from "@/lib/ia/types";
import type { FiltrosBuscaPNCP } from "@/lib/integracoes/pncp";
import {
  buscarPrecosMaterialPorPdm,
  consultarPdmDoItemCatmat,
  type FamiliaMaterial,
  type PrecoMaterialPainel,
  urlEditalHomologadoPncp,
} from "@/lib/integracoes/comprasGovMateriais";
import { contemCnpjProprio } from "@/lib/domain/orgaoProprio";
import { encontrarCodigosCatalogoLocal } from "./matchingCatalogoLocal";
import { processarComConcorrencia } from "./processarComConcorrencia";
import { chaveDescricao } from "./chaveDescricao";
import { normalizar, raizPlural, tokenizar } from "./texto";
// Só tipo: o registry importa este módulo, e um import de valor fecharia o ciclo.
import type { ContextoBuscaItem } from "./registryProvedores";

/**
 * Provedor de busca pública sobre o Painel de Preços de MATERIAIS
 * (`comprasGovMateriais.ts`). Cadeia:
 *
 *   termo → códigos CATMAT (matching local, `ItemCatalogoReferencia`)
 *         → família PDM de cada código (nome compatível com o termo; depois voto)
 *         → preços homologados da família, com o recorte UF/esfera do analista
 *         → ranqueamento lexical local e teto por descrição
 *         → prova de homologação no PNCP + link do edital (`urlEditalHomologadoPncp`)
 *
 * **Só entra candidato com link verificado.** A linha do Painel já traz
 * `dataResultado`, mas a §9.76 exige mais quando a compra está no PNCP
 * (`existeResultado` + valor homologado > 0), e sem link o analista não tem
 * evidência para instruir o processo (IN 65/2021). Por isso a validação é a
 * etapa cara, e só roda para os `MAX_CANDIDATOS_VALIDAR` mais aderentes —
 * validar as 500 linhas da página (como o provedor de serviços faz) não cabe
 * no orçamento de ~12s por provedor do assistente.
 *
 * **Próprio órgão (§9.9).** A linha do Painel não traz CNPJ do comprador; a
 * exclusão é feita sobre a URL resolvida, que para compra homologada no PNCP
 * contém o CNPJ (`/app/editais/{cnpj}/…`). Compra da Câmara feita sob a Lei
 * 14.133 está no PNCP, então resolve para essa forma.
 */

/** Janela de recência igual à do provedor de serviços (`comprasGov.ts`). */
const JANELA_DIAS = 730;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Códigos CATMAT do matching local usados para votar a família (termo inteiro). */
const MAX_CODIGOS_CATALOGO = 6;
/** Códigos CATMAT casados só pela primeira palavra do termo (o núcleo). */
const MAX_CODIGOS_NUCLEO = 4;
/** Famílias consultadas — a segunda cobre termo ambíguo sem dobrar o custo à toa. */
const MAX_PDMS = 2;
/** Candidatos que passam pela validação de homologação/link (etapa de rede por linha). */
const MAX_CANDIDATOS_VALIDAR = 20;
/** Mesma régua do assistente (`MAX_POR_DESCRICAO`, §9.101): frase de catálogo não toma a lista. */
const MAX_POR_DESCRICAO = 3;
/** Baixa de propósito: o Compras.gov responde 429 em rajada (medido em 2026-11-09). */
const CONCORRENCIA_PDM = 3;
const CONCORRENCIA_VALIDACAO = 5;

/**
 * Prazo total do provedor. Fica abaixo do teto que o assistente dá a cada
 * provedor (`TEMPO_MAX_BUSCA_MS + MARGEM_ENTREGA_MS` = 12s) para que o que já
 * foi validado seja ENTREGUE em vez de descartado pelo `comTimeout` de fora
 * (§9.105). A validação usa o que sobra; o que não terminar a tempo fica de
 * fora — degrada em quantidade, nunca em tudo-ou-nada.
 */
export const TEMPO_MAX_PAINEL_MATERIAIS_MS = 9_000;

function janelaRecencia(agora: Date): { dataInicio: Date; dataFim: Date } {
  return { dataInicio: new Date(agora.getTime() - JANELA_DIAS * MS_POR_DIA), dataFim: agora };
}

/** Resolve com o valor da promessa ou com `null` se o prazo vencer antes. */
function ateOPrazo<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  if (ms <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promessa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Preposições/artigos de 2 letras — sem eles, "de" casaria com metade dos nomes de família. */
const PALAVRAS_VAZIAS_CURTAS = new Set(["de", "da", "do", "em", "no", "na", "ou", "um"]);

/** Como `tokenizar`, mas mantém siglas de 2 letras ("HP", "A4"), que distinguem família. */
function tokensComSiglas(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 2 && !PALAVRAS_VAZIAS_CURTAS.has(p))
      .map(raizPlural),
  );
}

function aderenciaComSiglas(tokensTermo: Set<string>, nome: string): number {
  if (tokensTermo.size === 0) return 0;
  const tokensNome = tokensComSiglas(nome);
  let casados = 0;
  for (const token of tokensTermo) if (tokensNome.has(token)) casados++;
  return casados / tokensTermo.size;
}

/**
 * Escolhe as famílias a consultar. Só vale família cujo NOME compartilha ao
 * menos uma palavra com o termo; entre elas, vence a de maior aderência de
 * nome e, no empate, a que mais códigos casados citaram.
 *
 * O filtro pelo nome existe porque o matching do catálogo ancora na palavra
 * mais longa do termo: medido em 2026-11-09, "scanner alta produção" ancorou
 * em "produção" e caiu em "EQUIPAMENTOS PARA COZINHAR" — 19 preços de fogão no
 * lugar de scanner. Família sem nenhuma palavra do termo no nome é descartada:
 * melhor devolver nada que ocupar a tela com objeto de outra natureza.
 *
 * A comparação de nome usa `tokensComSiglas`, não `tokenizar`: este descarta
 * palavras de até 2 letras, e com isso "cartucho toner HP" perdia o "HP",
 * empatava HP com XEROX e a família errada vencia pelos votos (medido em
 * 2026-11-09). Exportada para teste.
 */
export function escolherFamilias(
  termo: string,
  familias: (FamiliaMaterial | null | undefined)[],
  limite: number = MAX_PDMS,
): number[] {
  const tokensTermo = tokensComSiglas(termo);
  const porCodigo = new Map<number, { votos: number; aderenciaNome: number }>();
  for (const familia of familias) {
    if (!familia) continue;
    const atual = porCodigo.get(familia.codigo);
    if (atual) {
      atual.votos++;
      continue;
    }
    porCodigo.set(familia.codigo, {
      votos: 1,
      aderenciaNome: familia.nome ? aderenciaComSiglas(tokensTermo, familia.nome) : 0,
    });
  }
  // `Map` preserva a ordem de inserção e `sort` é estável: empate total mantém a ordem do matching.
  return [...porCodigo.entries()]
    .filter(([, f]) => f.aderenciaNome > 0)
    .sort((a, b) => b[1].aderenciaNome - a[1].aderenciaNome || b[1].votos - a[1].votos)
    .slice(0, limite)
    .map(([codigo]) => codigo);
}

/**
 * Códigos CATMAT a partir de duas âncoras: o termo inteiro (o matching ancora
 * na palavra mais longa) e a PRIMEIRA palavra, que em descrição de compra em
 * português costuma ser o núcleo do objeto ("scanner", "tablet", "impressora").
 */
async function codigosCandidatos(termo: string): Promise<number[]> {
  const nucleo = tokenizar(termo)[0];
  const [peloTermo, peloNucleo] = await Promise.all([
    encontrarCodigosCatalogoLocal(termo, { maxResultados: MAX_CODIGOS_CATALOGO }),
    nucleo
      ? encontrarCodigosCatalogoLocal(nucleo, { maxResultados: MAX_CODIGOS_NUCLEO })
      : Promise.resolve([]),
  ]);
  return [...new Set([...peloTermo, ...peloNucleo])];
}

function aderencia(tokensTermo: Set<string>, descricao: string): number {
  if (tokensTermo.size === 0) return 0;
  const tokensDescricao = new Set(tokenizar(descricao).map(raizPlural));
  let casados = 0;
  for (const token of tokensTermo) if (tokensDescricao.has(token)) casados++;
  return casados / tokensTermo.size;
}

/**
 * Ordena por aderência ao termo (e, no empate, pelo resultado mais recente),
 * remove a mesma linha repetida entre famílias e limita cada descrição a
 * `MAX_POR_DESCRICAO`. Exportada para teste.
 */
export function selecionarParaValidacao(
  termo: string,
  precos: PrecoMaterialPainel[],
  limite: number = MAX_CANDIDATOS_VALIDAR,
): PrecoMaterialPainel[] {
  const tokensTermo = new Set(tokenizar(termo).map(raizPlural));
  const pontuados = precos
    .map((preco) => ({ preco, score: aderencia(tokensTermo, preco.descricaoItem) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.preco.dataResultado.getTime() - a.preco.dataResultado.getTime(),
    );

  const vistos = new Set<string>();
  const porDescricao = new Map<string, number>();
  const selecionados: PrecoMaterialPainel[] = [];
  for (const { preco } of pontuados) {
    if (selecionados.length >= limite) break;
    const chaveLinha = `${preco.idCompra}|${preco.numeroItemCompra ?? preco.descricaoItem}`;
    if (vistos.has(chaveLinha)) continue;
    const chave = chaveDescricao(preco.descricaoItem);
    const usados = porDescricao.get(chave) ?? 0;
    if (usados >= MAX_POR_DESCRICAO) continue;
    vistos.add(chaveLinha);
    porDescricao.set(chave, usados + 1);
    selecionados.push(preco);
  }
  return selecionados;
}

function mapearParaCandidato(preco: PrecoMaterialPainel, fonteUrl: string): CandidatoSimilaridade {
  return {
    tipoCandidato: "painel_precos",
    fonteDescricao: preco.descricaoItem,
    fonteOrgaoOuId: preco.nomeOrgao,
    fonteUrl,
    valorUnitario: preco.precoUnitario,
    dataReferencia: preco.dataResultado,
    unidade: preco.unidade,
    quantidade: preco.quantidade,
  };
}

/**
 * Palavra que, no INÍCIO da descrição do item, marca contratação de serviço.
 * Só o início: descrição de material costuma citar "instalação" ou "assistência
 * técnica" no meio do texto (garantia), e isso não a torna serviço.
 */
const INICIO_DE_SERVICO =
  /^(loca[cç][aã]o|aluguel|servi[cç]os?|presta[cç][aã]o|manuten[cç][aã]o|contrata[cç][aã]o de (empresa|servi\w*)|hospedagem|licen[cç]a|licenciamento|assinatura|suporte|outsourcing)\b/;
/** No termo (curto, reescrito pelo modelo) basta a palavra aparecer. */
const TERMO_DE_LOCACAO = /\b(loca[cç][aã]o|aluguel|locar|outsourcing)\b/;

/**
 * Esta fonte só tem preço de COMPRA de material. Para locação ou serviço ela
 * traria preço de natureza diferente — a compra de um nobreak custa dezenas de
 * vezes a mensalidade da locação — e ainda gastaria a cota de requisições do
 * Compras.gov que as outras fontes dividem (medido em 2026-11-09, processo
 * 95/2026). A natureza do item vem em branco em 80 de 84 itens de produção, por
 * isso a descrição e o termo também contam. Exportada para teste.
 */
export function ehObjetoDeServico(termo: string, contexto?: ContextoBuscaItem): boolean {
  if (contexto?.naturezaObjeto === "servico_continuo") return true;
  const descricao = contexto?.descricaoItem ? normalizarSemAcento(contexto.descricaoItem) : "";
  if (descricao && INICIO_DE_SERVICO.test(descricao)) return true;
  return TERMO_DE_LOCACAO.test(normalizarSemAcento(termo));
}

function normalizarSemAcento(texto: string): string {
  return normalizar(texto).trim();
}

/**
 * Busca candidatos de preço de material no Painel de Preços.
 *
 * Desfechos (§9.93, §9.103):
 * - `[]` sem consultar nada quando o objeto é serviço/locação (`ehObjetoDeServico`);
 * - `[]` sem lançar quando não há código CATMAT/família para o termo ou a fonte
 *   respondeu sem preço aproveitável — resposta legítima;
 * - LANÇA quando todas as consultas de preço falharam por rede — o registry
 *   registra o provedor em `provedoresQueFalharam` em vez de reportar ausência.
 */
export async function buscarCandidatosPainelMateriais(
  termo: string,
  filtros?: FiltrosBuscaPNCP,
  contexto?: ContextoBuscaItem,
  agora: Date = new Date(),
): Promise<CandidatoSimilaridade[]> {
  if (!termo.trim()) return [];
  if (ehObjetoDeServico(termo, contexto)) return [];
  const inicio = Date.now();

  const codigos = await codigosCandidatos(termo);
  if (codigos.length === 0) return [];

  let falhasPdm = 0;
  const pdms = await processarComConcorrencia(
    codigos,
    CONCORRENCIA_PDM,
    (codigo) => consultarPdmDoItemCatmat(codigo),
    () => {
      falhasPdm++;
    },
  );
  // Nenhuma família identificada porque a FONTE falhou não é "sem preço" (§9.103).
  if (falhasPdm === codigos.length) {
    throw new Error(`Catálogo de materiais do Compras.gov não respondeu para "${termo}".`);
  }
  const familias = escolherFamilias(termo, pdms);
  if (familias.length === 0) return [];

  const { dataInicio, dataFim } = janelaRecencia(agora);
  let falhas = 0;
  const porFamilia = await processarComConcorrencia(
    familias,
    MAX_PDMS,
    (codigoPdm) =>
      buscarPrecosMaterialPorPdm({
        codigoPdm,
        dataInicio,
        dataFim,
        estado: filtros?.uf,
        esfera: filtros?.esfera,
      }),
    (codigoPdm, erro) => {
      falhas++;
      console.warn(`[PainelMateriais] Falha ao consultar a família PDM ${codigoPdm}:`, erro);
    },
  );
  if (falhas === familias.length) {
    throw new Error(`Painel de Preços (materiais) não respondeu para "${termo}".`);
  }

  const precos = porFamilia.filter((r): r is PrecoMaterialPainel[] => Array.isArray(r)).flat();
  const selecionados = selecionarParaValidacao(termo, precos);
  if (selecionados.length === 0) return [];

  // Prazo ABSOLUTO: cada linha recebe só o que falta até o fim, não um prazo
  // novo — senão a fila de 20 linhas com concorrência 5 somaria 4 prazos.
  const prazoFinal = inicio + TEMPO_MAX_PAINEL_MATERIAIS_MS;
  const urls = await processarComConcorrencia(selecionados, CONCORRENCIA_VALIDACAO, (preco) =>
    ateOPrazo(urlEditalHomologadoPncp(preco.idCompra), prazoFinal - Date.now()),
  );

  const candidatos: CandidatoSimilaridade[] = [];
  selecionados.forEach((preco, i) => {
    const url = urls[i];
    // Sem link: compra fora do PNCP, sem homologação, consulta que falhou
    // (inclusive 429) ou prazo vencido. Em todos os casos falta a prova de
    // homologação e a evidência — o candidato não entra.
    if (!url) return;
    if (contemCnpjProprio(url)) return;
    candidatos.push(mapearParaCandidato(preco, url));
  });
  return candidatos;
}
