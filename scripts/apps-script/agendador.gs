/**
 * M30.d — Agendador da verificação de respostas (gatilho de hora em hora).
 *
 * POR QUE AQUI: o plano Hobby da Vercel não aceita cron mais frequente que uma vez por dia (e um cron
 * a mais frequente faz o DEPLOY FALHAR). O gatilho do Google é gratuito, roda de hora em hora e já
 * vive na conta da Divisão. Ele só CHAMA o sistema; quem lê a caixa, classifica e grava é o próprio
 * sistema (rota /api/jobs/verificar-respostas), pelo mesmo caminho do botão "Verificar respostas".
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não lê e-mail, não envia e-mail, não guarda segredo no código. A URL do
 * sistema e o segredo ficam em "Propriedades do script".
 *
 * Instalação (nesta ordem):
 *   1. Projeto do Apps Script → novo arquivo "agendador" → colar este conteúdo → Salvar.
 *   2. Configurações do projeto → Propriedades do script:
 *        SISTEMA_URL = https://divisao-compras-cms.vercel.app   (só o endereço, sem barra nem caminho)
 *        CRON_SECRET = <o MESMO valor da variável CRON_SECRET da Vercel>
 *   3. Rodar `agendadorTeste` uma vez e autorizar (precisa da permissão "Conectar-se a um serviço
 *      externo"). O log mostra só o código HTTP e contagens.
 *   4. Rodar `agendadorInstalar` UMA vez: cria o gatilho de hora em hora.
 *   Para parar: rodar `agendadorRemover`.
 *
 * NÃO use "Nova versão" na implantação só por causa deste arquivo: o app da web (doPost) não precisa dele.
 */

var AGENDADOR_FUNCAO = "agendadorVerificar";
var AGENDADOR_CAMINHO = "/api/jobs/verificar-respostas";

/**
 * Monta a chamada, ou devolve null se a configuração não presta. O segredo só viaja para um endereço
 * https:// de HOST PURO (sem usuário, caminho, parâmetro ou porta estranha) e a chamada NÃO segue
 * redirecionamento: o cabeçalho com o segredo nunca é reenviado a outro lugar.
 */
function agendadorPedido_(url, segredo) {
  var origem = String(url || "").trim().replace(/\/+$/, "");
  var chave = String(segredo || "").trim();
  if (!/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(origem) || chave.length < 16) return null;
  return {
    url: origem + AGENDADOR_CAMINHO,
    opcoes: {
      method: "get",
      headers: { Authorization: "Bearer " + chave },
      muteHttpExceptions: true,
      followRedirects: false,
    },
  };
}

var AGENDADOR_CAMPOS_LOG = ["enviosNovos", "consultasNovas", "respostasClassificadas", "respostasNaFila", "emailsInvalidos"];

/** Texto para o log: só contagens NUMÉRICAS de campos conhecidos. Nada que o servidor mande além disso é impresso. */
function agendadorResumo_(json) {
  if (!json || typeof json !== "object") return "sem resposta em JSON";
  if (json.pulou) return "pulou (houve verificação há menos de 10 min)";
  if (json.erro) return "falha informada pelo sistema";
  var r = json.resumo;
  if (!r || typeof r !== "object") return "sem resumo";
  return AGENDADOR_CAMPOS_LOG.filter(function (k) { return typeof r[k] === "number"; })
    .map(function (k) { return k + " " + r[k]; })
    .join(" | ");
}

/** Chamada de cada hora. Falha = exceção, para o Google avisar o dono do projeto por e-mail. */
function agendadorVerificar() {
  if (!contaCerta_()) {
    throw new Error("Conta errada (" + contaEfetiva_() + "): o agendador só roda na conta da Divisão.");
  }
  var props = PropertiesService.getScriptProperties();
  var pedido = agendadorPedido_(props.getProperty("SISTEMA_URL"), props.getProperty("CRON_SECRET"));
  if (!pedido) {
    throw new Error("SISTEMA_URL ou CRON_SECRET ausente ou inválido nas Propriedades do script.");
  }
  var res = UrlFetchApp.fetch(pedido.url, pedido.opcoes);
  var codigo = res.getResponseCode();
  var json = null;
  try { json = JSON.parse(res.getContentText()); } catch (err) { json = null; }
  Logger.log("AGENDADOR: HTTP " + codigo + " | " + agendadorResumo_(json));
  if (codigo !== 200) throw new Error("A verificação automática respondeu HTTP " + codigo + ".");
}

/** Roda uma vez à mão, para conferir a configuração antes de instalar o gatilho. */
function agendadorTeste() { agendadorVerificar(); }

function agendadorRemover() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === AGENDADOR_FUNCAO; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Cria o gatilho de hora em hora (apaga o anterior, então pode rodar de novo sem duplicar). */
function agendadorInstalar() {
  agendadorRemover();
  ScriptApp.newTrigger(AGENDADOR_FUNCAO).timeBased().everyHours(1).create();
  Logger.log("AGENDADOR: gatilho de hora em hora instalado.");
}
