/**
 * M30.d — Ação `trechos` do app da web: devolve o trecho ANONIMIZADO de mensagens pedidas por id, para
 * o sistema guardá-lo como EXEMPLO da IA (casos que a Divisão decidiu ou conferiu).
 * Cole NO MESMO projeto de `respostasCotacao.gs` (reaproveita anonimizarParaIa_, contaCerta_,
 * EXTENSOES_ORCAMENTO). SÓ LEITURA do Gmail: nada é enviado, movido, apagado nem gravado aqui.
 *
 * O que sai: o texto anonimizado (e-mail, telefone, CNPJ/CPF, link e valor em reais já trocados por
 * marcadores) e a CONTAGEM de anexos. Nunca o endereço de quem escreveu, nunca o assunto, nunca o nome
 * de anexo. O sistema ainda confere o texto de novo antes de guardar.
 *
 * Limites: até 30 ids por chamada; id fora do formato do Gmail é descartado; mensagem que não existe
 * ou não pode ser lida é pulada (o sistema conta como "sem texto").
 *
 * Depois de colar: Implantar → Gerenciar implantações → editar → NOVA VERSÃO (o app da web serve a
 * versão publicada, não a do editor).
 */

var TRECHOS_MAX_IDS = 30;
var TRECHOS_LIMITE_CARACTERES = 600;

/** Ids de mensagem do Gmail são hexadecimais curtos; qualquer outra coisa nunca chega ao GmailApp. */
function trechosIdsValidos_(ids) {
  var vistos = {};
  var saida = [];
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    var s = String(id == null ? "" : id).trim();
    if (!/^[0-9a-f]{8,32}$/i.test(s) || vistos[s]) return;
    vistos[s] = true;
    if (saida.length < TRECHOS_MAX_IDS) saida.push(s);
  });
  return saida;
}

/** Quantos anexos são PDF e quantos são de outro tipo (só a contagem). */
function trechosContarAnexos_(nomes) {
  var pdf = nomes.filter(function (n) { return EXTENSOES_ORCAMENTO.test(n); }).length;
  return { anexosPdf: pdf, anexosOutros: nomes.length - pdf };
}

/** Uma mensagem → { id, trecho, anexosPdf, anexosOutros }, ou null se não puder ser lida. */
function trechosDaMensagem_(id) {
  var msg;
  try { msg = GmailApp.getMessageById(id); } catch (err) { return null; }
  if (!msg) return null;
  var texto;
  var nomes;
  try {
    texto = anonimizarParaIa_(msg.getPlainBody(), TRECHOS_LIMITE_CARACTERES);
    nomes = msg.getAttachments({ includeInlineImages: false }).map(function (a) { return a.getName(); });
  } catch (err) { return null; }
  if (!texto) return null;
  var c = trechosContarAnexos_(nomes);
  return { id: id, trecho: texto, anexosPdf: c.anexosPdf, anexosOutros: c.anexosOutros };
}

/** Resposta da ação (o segredo e a conta já foram conferidos pelo doPost). */
function trechosResponder_(corpo) {
  var trechos = trechosIdsValidos_(corpo.ids).map(trechosDaMensagem_).filter(function (t) { return t !== null; });
  return ContentService.createTextOutput(JSON.stringify({
    diagnostico: { versao: "ia-5", acao: "trechos", pedidos: trechosIdsValidos_(corpo.ids).length, devolvidos: trechos.length },
    trechos: trechos,
  })).setMimeType(ContentService.MimeType.JSON);
}
