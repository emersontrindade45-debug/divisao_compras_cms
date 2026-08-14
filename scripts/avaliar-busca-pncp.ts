import * as dotenv from "dotenv";

dotenv.config();

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { buscarContratosPNCP } from "../src/lib/integracoes/pncp";
import { MAX_SUGESTOES_POR_BUSCA } from "../src/lib/assistente/sugestoes";
import { processarComConcorrencia } from "../src/lib/similaridade/processarComConcorrencia";
import type { CandidatoSimilaridade } from "../src/lib/ia/types";

/**
 * Régua de avaliação da busca de contratações no PNCP.
 *
 * **Por que existe.** Toda mudança no ranqueamento ou no corte de candidatos é
 * hoje injulgável: `pnpm test` passa igual antes e depois, e a única verificação
 * disponível é abrir o assistente e olhar. Este script responde à pergunta do
 * CLAUDE.md §7 ("como você confirma que isso está correto?") com um número, e
 * não com uma impressão — é a aplicação da §9.67 antes de gastar a
 * implementação, não depois dela.
 *
 * **De onde vem o gabarito.** Não foi preciso rotular nada à mão: o analista já
 * rotulou 73+ candidatos em produção, clicando. Cada `ResultadoSimilaridade` de
 * origem `assistente` guarda o `termoBuscaUsado` que o achou, e o desfecho dele
 * é o rótulo:
 *
 *   promovidoParaFonte = true  → POSITIVO FORTE  (virou fonte da estimativa)
 *   descartado         = true  → NEGATIVO        (lápide, ver CLAUDE.md §9.66b)
 *   nenhum dos dois            → POSITIVO FRACO  (adicionado e mantido na lista)
 *
 * **Como se mede.** Cada termo distinto é reexecutado contra o PNCP real e se
 * pergunta onde os rotulados caíram no resultado de hoje. As duas taxas que
 * importam são deliberadamente separadas:
 *
 *   recall@25    — o candidato apareceria na TELA do analista (25 é o corte de
 *                  `MAX_SUGESTOES_POR_BUSCA`, aplicado em `ferramentas.ts`)
 *   recall total — o candidato foi devolvido pela busca, em qualquer posição
 *
 * A diferença entre as duas é exatamente o custo do corte por ordem de chegada:
 * candidato encontrado mas invisível. Já o que não aparece em nenhuma das duas
 * mede a outra falha — busca que não reproduz o próprio resultado anterior.
 *
 * **O replay roda sem filtro de valor, de propósito.** O filtro incide sobre o
 * valor como a fonte publicou, antes de qualquer normalização por unidade, e
 * está ele próprio sob suspeita. Misturá-lo aqui contaminaria a medição do
 * ranqueamento, que é o que este script existe para julgar.
 *
 * Uso (o `--conditions=react-server` NÃO é opcional — sem ele o
 * `import "server-only"` no topo de `pncp.ts` derruba o processo, CLAUDE.md §9.62):
 *
 *   npx tsx --conditions=react-server scripts/avaliar-busca-pncp.ts
 *   npx tsx --conditions=react-server scripts/avaliar-busca-pncp.ts --termos=5
 *   npx tsx --conditions=react-server scripts/avaliar-busca-pncp.ts --comparar=.avaliacao/<arquivo>.json
 *
 * Só lê o banco (`AVALIACAO_DB_URL` ou `PROD_READ_URL`) e a API pública do PNCP;
 * não grava nada em lugar nenhum além do relatório em `.avaliacao/`.
 */

const DIR_SAIDA = ".avaliacao";

/**
 * Concorrência 1 por padrão, e não por timidez: medido em 2026-08-13, o PNCP
 * derruba a conexão (ECONNRESET) sob rajada vinda de um mesmo IP — 16 de 20
 * requisições seguidas foram recusadas, e `curl` sofreu na mesma proporção que o
 * `fetch` do Node, o que descarta culpa do runtime. Espaçar ajuda mas não cura
 * (25% de recusa mesmo com 1s entre requisições). Cada termo já dispara dezenas
 * de requisições internas; somar concorrência em cima disso transforma a régua
 * numa medida da paciência do PNCP, não da qualidade da busca.
 *
 * A detecção de falha abaixo só é confiável com concorrência 1 — ela observa o
 * console, que é global.
 */
const CONCORRENCIA_PADRAO = 1;
const PAUSA_ENTRE_TERMOS_MS = 1_500;
const MAX_TENTATIVAS_TERMO = 3;
const PAUSA_ENTRE_TENTATIVAS_MS = 8_000;

/**
 * Marcadores que `pncp.ts` escreve no console quando a rede falha.
 *
 * **Por que observar o console em vez de o valor de retorno:**
 * `buscarContratosPNCP` devolve `CandidatoSimilaridade[]` e engole toda exceção
 * num `catch` que retorna `[]` — o tipo não tem onde carregar "eu falhei". De
 * fora é impossível distinguir "o PNCP não tem nada para este termo" de "o PNCP
 * recusou a conexão", e tratar os dois como iguais faria a régua registrar uma
 * recusa de rede como queda de recall. Ou seja: a régua tropeça exatamente no
 * defeito que ela existe para ajudar a corrigir.
 *
 * Isto é um paliativo declarado, não um desenho. Quando `buscarContratosPNCP`
 * passar a devolver um resultado que sabe se foi truncado ou recusado, esta
 * função inteira sai daqui e a leitura vira um campo.
 */
const MARCADOR_FALHA_PNCP =
  /\[PNCP\] (Falha de rede|Erro inesperado|Falha na busca textual|Falha ao buscar itens|HTTP \d|Prazo)/;

async function comDeteccaoDeFalha<T>(
  executar: () => Promise<T>,
): Promise<{ valor: T; falhasDeRede: number }> {
  const warnOriginal = console.warn;
  const errorOriginal = console.error;
  let falhasDeRede = 0;

  const observar =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      const texto = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
      if (MARCADOR_FALHA_PNCP.test(texto)) {
        // Contadas, não impressas: com o PNCP recusando em rajada, cada termo
        // gera dezenas dessas linhas e elas afogariam o progresso da régua.
        falhasDeRede++;
        return;
      }
      original(...args);
    };

  console.warn = observar(warnOriginal as (...args: unknown[]) => void);
  console.error = observar(errorOriginal as (...args: unknown[]) => void);
  try {
    const valor = await executar();
    return { valor, falhasDeRede };
  } finally {
    console.warn = warnOriginal;
    console.error = errorOriginal;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Gabarito
// ---------------------------------------------------------------------------

type Rotulo = "fonte" | "mantido" | "descartado";

interface LinhaRotulada {
  termo: string;
  fonteUrl: string;
  fonteDescricao: string;
  valorUnitario: number;
  rotulo: Rotulo;
  itemDescricao: string;
}

/**
 * Os rótulos vêm de cliques reais e não são perfeitos: um descarte pode ter sido
 * motivado por duplicidade, e não por falta de aderência. Isso é ruído
 * conhecido, registrado aqui em vez de escondido — ele afeta a taxa de negativos
 * ranqueados acima dos positivos, não o recall dos positivos, que é a métrica
 * principal.
 */
const SQL_GABARITO = `
  select r."termoBuscaUsado"   as termo,
         r."fonteUrl"          as fonte_url,
         r."fonteDescricao"    as fonte_descricao,
         r."valorUnitario"::float8 as valor_unitario,
         r."promovidoParaFonte"    as promovido,
         r.descartado          as descartado,
         i.descricao           as item_descricao
  from resultados_similaridade r
  join itens i on i.id = r."itemId"
  where r.origem = 'assistente'
    and r."termoBuscaUsado" is not null
    and r."fonteUrl" is not null
  order by r."termoBuscaUsado"
`;

async function carregarGabarito(): Promise<LinhaRotulada[]> {
  const url = process.env.AVALIACAO_DB_URL ?? process.env.PROD_READ_URL;
  if (!url) {
    throw new Error(
      "Defina AVALIACAO_DB_URL (ou PROD_READ_URL) no .env com uma conexão de LEITURA ao banco " +
        "que contém os julgamentos do analista. Sem gabarito não há o que medir.",
    );
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{
      termo: string;
      fonte_url: string;
      fonte_descricao: string;
      valor_unitario: number;
      promovido: boolean;
      descartado: boolean;
      item_descricao: string;
    }>(SQL_GABARITO);

    return rows.map((linha) => ({
      termo: linha.termo,
      fonteUrl: linha.fonte_url,
      fonteDescricao: linha.fonte_descricao,
      valorUnitario: linha.valor_unitario,
      // A ordem importa: uma linha promovida também pode estar descartada por um
      // ciclo de descarte/revival, e "virou fonte" é o rótulo mais informativo.
      rotulo: linha.promovido ? "fonte" : linha.descartado ? "descartado" : "mantido",
      itemDescricao: linha.item_descricao,
    }));
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------------------
// Casamento entre rotulado e devolvido
// ---------------------------------------------------------------------------

/**
 * `fonteUrl` identifica o EDITAL, não o item — vários itens da mesma compra
 * compartilham a URL. Por isso o casamento tem dois níveis, e os dois são
 * reportados: o de item é a medida honesta de "achou o preço certo"; o de edital
 * mostra quando a compra certa voltou mas o item específico ficou de fora do
 * ranqueamento interno da compra, que é um modo de falha diferente.
 */
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, " ").trim();
}

interface Achado {
  /** Posição no array devolvido pela busca (0-based); null quando não voltou. */
  posicao: number | null;
  /** Casou pela URL do edital, mesmo que o item exato não tenha voltado. */
  editalVoltou: boolean;
}

function localizar(linha: LinhaRotulada, devolvidos: CandidatoSimilaridade[]): Achado {
  const alvoDescricao = normalizar(linha.fonteDescricao);
  let editalVoltou = false;

  for (let i = 0; i < devolvidos.length; i++) {
    const candidato = devolvidos[i]!;
    if (candidato.fonteUrl !== linha.fonteUrl) continue;
    editalVoltou = true;
    if (normalizar(candidato.fonteDescricao) === alvoDescricao) {
      return { posicao: i, editalVoltou: true };
    }
  }
  return { posicao: null, editalVoltou };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

/**
 * `indeterminado` é a diferença entre uma régua honesta e uma que mente: termo
 * que voltou vazio depois de a rede ter falhado NÃO conta como candidato não
 * encontrado. Os rótulos dele saem do denominador — misturá-los faria uma recusa
 * do PNCP parecer regressão de ranqueamento na comparação entre duas execuções.
 */
type StatusTermo = "ok" | "indeterminado";

interface ResultadoTermo {
  termo: string;
  status: StatusTermo;
  tentativas: number;
  falhasDeRede: number;
  duracaoMs: number;
  totalDevolvido: number;
  erro?: string;
  linhas: {
    rotulo: Rotulo;
    fonteDescricao: string;
    itemDescricao: string;
    valorUnitario: number;
    posicao: number | null;
    editalVoltou: boolean;
    visivel: boolean;
  }[];
}

interface Relatorio {
  geradoEm: string;
  corteExibicao: number;
  termosAvaliados: number;
  rotulosAvaliados: number;
  resumo: Resumo;
  termos: ResultadoTermo[];
}

interface Resumo {
  termosIndeterminados: number;
  rotulosDescartadosPorIndeterminacao: number;
  positivos: number;
  positivosVisiveis: number;
  positivosAchadosForaDoCorte: number;
  positivosNaoAchados: number;
  fontes: number;
  fontesVisiveis: number;
  negativos: number;
  negativosVisiveis: number;
  posicaoMedianaPositivos: number | null;
  termosSemNenhumResultado: number;
}

function resumir(termos: ResultadoTermo[]): Resumo {
  const confiaveis = termos.filter((t) => t.status === "ok");
  const indeterminados = termos.filter((t) => t.status === "indeterminado");
  const linhas = confiaveis.flatMap((t) => t.linhas);
  const positivos = linhas.filter((l) => l.rotulo !== "descartado");
  const negativos = linhas.filter((l) => l.rotulo === "descartado");
  const fontes = linhas.filter((l) => l.rotulo === "fonte");

  const posicoes = positivos
    .map((l) => l.posicao)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);

  return {
    termosIndeterminados: indeterminados.length,
    rotulosDescartadosPorIndeterminacao: indeterminados.reduce((n, t) => n + t.linhas.length, 0),
    positivos: positivos.length,
    positivosVisiveis: positivos.filter((l) => l.visivel).length,
    positivosAchadosForaDoCorte: positivos.filter((l) => l.posicao !== null && !l.visivel).length,
    positivosNaoAchados: positivos.filter((l) => l.posicao === null).length,
    fontes: fontes.length,
    fontesVisiveis: fontes.filter((l) => l.visivel).length,
    negativos: negativos.length,
    negativosVisiveis: negativos.filter((l) => l.visivel).length,
    posicaoMedianaPositivos: posicoes.length ? posicoes[Math.floor(posicoes.length / 2)]! : null,
    termosSemNenhumResultado: confiaveis.filter((t) => t.totalDevolvido === 0).length,
  };
}

/**
 * Reexecuta o termo até obter uma resposta que não esteja contaminada por falha
 * de rede. Só o par (vazio + falha de rede observada) motiva nova tentativa:
 * vazio limpo é resultado legítimo e precisa ser medido como tal, senão a régua
 * perde justamente o sinal de "o PNCP não tem isto".
 */
async function avaliarTermo(termo: string, linhas: LinhaRotulada[]): Promise<ResultadoTermo> {
  const inicio = Date.now();
  let devolvidos: CandidatoSimilaridade[] = [];
  let erro: string | undefined;
  let falhasDeRede = 0;
  let tentativas = 0;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_TERMO; tentativa++) {
    tentativas = tentativa;
    erro = undefined;
    try {
      // Sem filtro de valor: ver a nota no cabeçalho deste arquivo.
      const execucao = await comDeteccaoDeFalha(() => buscarContratosPNCP(termo));
      devolvidos = execucao.valor;
      falhasDeRede = execucao.falhasDeRede;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      falhasDeRede++;
    }
    const contaminado = devolvidos.length === 0 && falhasDeRede > 0;
    if (!contaminado || tentativa === MAX_TENTATIVAS_TERMO) break;
    await esperar(PAUSA_ENTRE_TENTATIVAS_MS * tentativa);
  }

  const duracaoMs = Date.now() - inicio;
  const status: StatusTermo =
    devolvidos.length === 0 && falhasDeRede > 0 ? "indeterminado" : "ok";

  return {
    termo,
    status,
    tentativas,
    falhasDeRede,
    duracaoMs,
    totalDevolvido: devolvidos.length,
    ...(erro ? { erro } : {}),
    linhas: linhas.map((linha) => {
      const achado = localizar(linha, devolvidos);
      return {
        rotulo: linha.rotulo,
        fonteDescricao: linha.fonteDescricao,
        itemDescricao: linha.itemDescricao,
        valorUnitario: linha.valorUnitario,
        posicao: achado.posicao,
        editalVoltou: achado.editalVoltou,
        visivel: achado.posicao !== null && achado.posicao < MAX_SUGESTOES_POR_BUSCA,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

function pct(parte: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((100 * parte) / total)}%`;
}

function imprimirRelatorio(relatorio: Relatorio): void {
  const r = relatorio.resumo;
  console.log("");
  console.log("═".repeat(72));
  console.log(`RÉGUA DA BUSCA PNCP — ${relatorio.geradoEm}`);
  console.log(
    `${relatorio.termosAvaliados} termos · ${relatorio.rotulosAvaliados} rótulos · corte de exibição: ${relatorio.corteExibicao}`,
  );
  console.log("═".repeat(72));
  console.log("");
  if (r.termosIndeterminados > 0) {
    console.log(
      `⚠  ${r.termosIndeterminados} termo(s) INDETERMINADO(S) — voltaram vazios depois de falha de\n` +
        `   rede, mesmo após ${MAX_TENTATIVAS_TERMO} tentativas. Os ${r.rotulosDescartadosPorIndeterminacao} rótulos deles ficaram FORA\n` +
        `   das contas abaixo. Se este número for alto, a baseline não vale: repita mais tarde.`,
    );
    console.log("");
  }
  console.log("POSITIVOS (o analista adicionou e manteve)");
  console.log(`  visíveis na tela ........ ${r.positivosVisiveis}/${r.positivos}  ${pct(r.positivosVisiveis, r.positivos)}   ← métrica principal`);
  console.log(`  achados fora do corte ... ${r.positivosAchadosForaDoCorte}/${r.positivos}  ${pct(r.positivosAchadosForaDoCorte, r.positivos)}   ← custo do corte por ordem de chegada`);
  console.log(`  não achados ............. ${r.positivosNaoAchados}/${r.positivos}  ${pct(r.positivosNaoAchados, r.positivos)}   ← busca não reproduziu o resultado`);
  console.log(`  posição mediana ......... ${r.posicaoMedianaPositivos ?? "—"}`);
  console.log("");
  console.log("FONTES (gabarito forte — viraram fonte da estimativa)");
  console.log(`  visíveis na tela ........ ${r.fontesVisiveis}/${r.fontes}  ${pct(r.fontesVisiveis, r.fontes)}`);
  console.log("");
  console.log("NEGATIVOS (o analista descartou)");
  console.log(`  visíveis na tela ........ ${r.negativosVisiveis}/${r.negativos}  ${pct(r.negativosVisiveis, r.negativos)}   ← quanto menor, melhor`);
  console.log("");
  console.log(`termos que voltaram vazios .. ${r.termosSemNenhumResultado}/${relatorio.termosAvaliados}`);
  console.log("");
}

function imprimirDetalhe(relatorio: Relatorio): void {
  console.log("─".repeat(72));
  console.log("POR TERMO");
  console.log("─".repeat(72));
  for (const termo of [...relatorio.termos].sort((a, b) => a.termo.localeCompare(b.termo))) {
    const marca =
      termo.status === "indeterminado"
        ? `INDETERMINADO após ${termo.tentativas} tentativas`
        : `${termo.totalDevolvido} devolvidos`;
    const rede = termo.falhasDeRede > 0 ? ` · ${termo.falhasDeRede} falhas de rede` : "";
    console.log(`\n"${termo.termo}"  (${(termo.duracaoMs / 1000).toFixed(1)}s · ${marca}${rede})`);
    if (termo.erro) console.log(`  ! ${termo.erro}`);
    if (termo.status === "indeterminado") {
      console.log("  (rótulos deste termo não entraram nas contas)");
      continue;
    }
    for (const linha of termo.linhas) {
      const onde =
        linha.posicao === null
          ? linha.editalVoltou
            ? "edital voltou, item não"
            : "não voltou"
          : `pos ${linha.posicao}${linha.visivel ? "" : " (fora do corte)"}`;
      const sinal = linha.rotulo === "descartado" ? "−" : linha.rotulo === "fonte" ? "★" : "+";
      console.log(`  ${sinal} [${onde}] ${linha.fonteDescricao.slice(0, 58)}`);
    }
  }
  console.log("");
}

function compararCom(anterior: Relatorio, atual: Relatorio): void {
  const linha = (rotulo: string, a: number, b: number, total: number) => {
    const delta = b - a;
    const seta = delta > 0 ? "▲" : delta < 0 ? "▼" : "=";
    console.log(
      `  ${rotulo.padEnd(26)} ${String(a).padStart(3)} → ${String(b).padStart(3)}  ${seta} ${
        delta > 0 ? "+" : ""
      }${delta}  (de ${total})`,
    );
  };
  console.log("─".repeat(72));
  console.log(`COMPARAÇÃO com ${anterior.geradoEm}`);
  console.log("─".repeat(72));
  linha("positivos visíveis", anterior.resumo.positivosVisiveis, atual.resumo.positivosVisiveis, atual.resumo.positivos);
  linha("positivos fora do corte", anterior.resumo.positivosAchadosForaDoCorte, atual.resumo.positivosAchadosForaDoCorte, atual.resumo.positivos);
  linha("positivos não achados", anterior.resumo.positivosNaoAchados, atual.resumo.positivosNaoAchados, atual.resumo.positivos);
  linha("fontes visíveis", anterior.resumo.fontesVisiveis, atual.resumo.fontesVisiveis, atual.resumo.fontes);
  linha("negativos visíveis", anterior.resumo.negativosVisiveis, atual.resumo.negativosVisiveis, atual.resumo.negativos);
  linha("termos vazios", anterior.resumo.termosSemNenhumResultado, atual.resumo.termosSemNenhumResultado, atual.termosAvaliados);
  linha("termos indeterminados", anterior.resumo.termosIndeterminados, atual.resumo.termosIndeterminados, atual.termosAvaliados);
  console.log("");
  console.log(
    "  Duas execuções seguidas SEM mudança de código também divergem — é a própria\n" +
      "  instabilidade da busca sendo medida. Rode a baseline duas vezes antes de\n" +
      "  atribuir uma diferença a uma alteração de código.\n" +
      "  E confira os indeterminados dos DOIS lados: se um deles tinha muitos, os\n" +
      "  denominadores não são os mesmos e a comparação não significa nada.",
  );
  console.log("");
}

// ---------------------------------------------------------------------------

function lerArg(nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length);
}

async function main(): Promise<void> {
  const limiteTermos = Number(lerArg("termos") ?? "0");
  const concorrencia = Number(lerArg("concorrencia") ?? CONCORRENCIA_PADRAO);
  const arquivoComparacao = lerArg("comparar");
  const detalhar = process.argv.includes("--detalhe");

  console.log("Carregando gabarito do banco…");
  const gabarito = await carregarGabarito();
  if (gabarito.length === 0) {
    throw new Error(
      "Nenhum candidato de origem `assistente` com `termoBuscaUsado` foi encontrado. " +
        "Confira se AVALIACAO_DB_URL aponta para o banco onde o assistente rodou.",
    );
  }

  const porTermo = new Map<string, LinhaRotulada[]>();
  for (const linha of gabarito) {
    const lista = porTermo.get(linha.termo) ?? [];
    lista.push(linha);
    porTermo.set(linha.termo, lista);
  }

  // Termos com mais rótulos primeiro: um `--termos=5` de fumaça mede o que há de
  // mais informativo, em vez de cinco termos com um rótulo cada.
  let entradas = [...porTermo.entries()].sort((a, b) => b[1].length - a[1].length);
  if (limiteTermos > 0) entradas = entradas.slice(0, limiteTermos);

  const totalRotulos = entradas.reduce((n, [, linhas]) => n + linhas.length, 0);
  console.log(
    `${gabarito.length} rótulos em ${porTermo.size} termos; avaliando ${entradas.length} termos ` +
      `(${totalRotulos} rótulos) com concorrência ${concorrencia}.`,
  );
  console.log("Consultando o PNCP — cada termo leva de 3 a 12 segundos.\n");

  if (concorrencia > 1) {
    console.warn(
      "⚠  Com concorrência > 1 a detecção de falha de rede observa um console compartilhado\n" +
        "   e atribui falhas ao termo errado. Use 1 para uma baseline confiável.\n",
    );
  }

  let concluidos = 0;
  const termos = await processarComConcorrencia(
    entradas,
    concorrencia,
    async ([termo, linhas], indice) => {
      // Espaçar o início evita transformar a régua numa rajada — ver CONCORRENCIA_PADRAO.
      if (indice > 0) await esperar(PAUSA_ENTRE_TERMOS_MS);
      const resultado = await avaliarTermo(termo, linhas);
      concluidos++;
      const marca =
        resultado.status === "indeterminado"
          ? "INDETERMINADO"
          : `${String(resultado.totalDevolvido).padStart(3)} devolvidos`;
      console.log(
        `  [${String(concluidos).padStart(2)}/${entradas.length}] ${(resultado.duracaoMs / 1000)
          .toFixed(1)
          .padStart(5)}s  ${marca}  "${termo}"`,
      );
      return resultado;
    },
    ([termo], erro) => console.error(`  ! falha no termo "${termo}":`, erro),
  );

  const avaliados = termos.filter((t): t is ResultadoTermo => t !== undefined);
  const relatorio: Relatorio = {
    geradoEm: new Date().toISOString(),
    corteExibicao: MAX_SUGESTOES_POR_BUSCA,
    termosAvaliados: avaliados.length,
    rotulosAvaliados: avaliados.reduce((n, t) => n + t.linhas.length, 0),
    resumo: resumir(avaliados),
    termos: avaliados,
  };

  mkdirSync(DIR_SAIDA, { recursive: true });
  const caminho = join(DIR_SAIDA, `busca-${relatorio.geradoEm.replace(/[:.]/g, "-")}.json`);
  writeFileSync(caminho, JSON.stringify(relatorio, null, 2), "utf8");

  imprimirRelatorio(relatorio);
  if (detalhar) imprimirDetalhe(relatorio);
  if (arquivoComparacao) {
    const anterior = JSON.parse(readFileSync(arquivoComparacao, "utf8")) as Relatorio;
    compararCom(anterior, relatorio);
  }
  console.log(`Relatório completo: ${caminho}`);
}

main().catch((erro: unknown) => {
  console.error("\nFalhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
