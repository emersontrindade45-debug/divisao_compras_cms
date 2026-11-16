/**
 * M30.d — Leitura das respostas de cotação na caixa divisaocompras@ (SPIKE).
 *
 * REGRA DE SIGILO (inegociável — CLAUDE.md / docs/PLAN.md M30.d):
 *   - Este script roda DENTRO do Google, na própria conta. O conteúdo dos
 *     e-mails (assunto, corpo, anexos) NUNCA é devolvido nem enviado para fora.
 *   - A saída é só: id da mensagem, data, remetente, número do processo
 *     extraído do assunto e marcadores booleanos.
 *   - Anexos nunca são lidos: só se verifica tipo/extensão.
 *
 * Instalação (uma vez, sem TI):
 *   1. Entrar em script.google.com logado como divisaocompras@camarasantos.sp.gov.br
 *   2. Novo projeto → colar este arquivo → Salvar.
 *   3. Configurações do projeto → Propriedades do script → SEGREDO = <valor longo aleatório>.
 *   4. Rodar `testeLeitura` uma vez no editor e autorizar (escopo de leitura do Gmail).
 *      O log mostra só CONTAGENS — confira que nenhum assunto/corpo aparece.
 */

/** Frases de recusa — conferidas no Google; só o booleano sai. */
var FRASES_RECUSA = [
  "nao temos interesse", "não temos interesse", "nao atendemos", "não atendemos",
  "declinamos", "nao trabalhamos", "não trabalhamos", "nao fornecemos", "não fornecemos",
  "nao participaremos", "não participaremos", "sem interesse",
];

var EXTENSOES_ORCAMENTO = /\.(pdf|xlsx?|docx?|ods|odt)$/i;

/** Extrai "382" de "RE: Solicitação de Orçamento Proc. 382 - …" (Proc / Proc. / Processo). */
function numeroProcessoDoAssunto_(assunto) {
  var m = /\bproc(?:esso)?\.?\s*(?:n[ºo°.]?\s*)?(\d{1,6})/i.exec(assunto || "");
  return m ? String(Number(m[1])) : null; // Number() tira zeros à esquerda
}

function metadadosDaMensagem_(msg) {
  var assunto = msg.getSubject();
  var corpo = (msg.getPlainBody() || "").toLowerCase();
  var anexos = msg.getAttachments({ includeInlineImages: false });
  return {
    id: msg.getId(),
    data: msg.getDate().toISOString(),
    remetente: (/<([^>]+)>/.exec(msg.getFrom()) || [null, msg.getFrom()])[1].trim().toLowerCase(),
    processo: numeroProcessoDoAssunto_(assunto),
    temAnexoOrcamento: anexos.some(function (a) { return EXTENSOES_ORCAMENTO.test(a.getName()); }),
    contemRecusa: FRASES_RECUSA.some(function (f) { return corpo.indexOf(f) !== -1; }),
  };
}

/**
 * Respostas recebidas (não enviadas pela própria caixa) a e-mails de
 * "Solicitação de Orçamento", nos últimos `dias` dias.
 */
function buscarRespostas_(dias) {
  var eu = Session.getActiveUser().getEmail().toLowerCase();
  var threads = GmailApp.search('subject:("Solicitação de Orçamento") newer_than:' + dias + "d -in:sent", 0, 200);
  var saida = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var meta = metadadosDaMensagem_(m);
      if (meta.remetente !== eu) saida.push(meta);
    });
  });
  return saida;
}

/** Passo 1 do spike: rode no editor. Loga SÓ contagens. */
function testeLeitura() {
  var r = buscarRespostas_(30);
  Logger.log("respostas: " + r.length);
  Logger.log("com número de processo no assunto: " + r.filter(function (x) { return x.processo; }).length);
  Logger.log("com anexo de orçamento: " + r.filter(function (x) { return x.temAnexoOrcamento; }).length);
  Logger.log("com frase de recusa: " + r.filter(function (x) { return x.contemRecusa; }).length);
}

/**
 * Passo 2 do spike: Implantar → Nova implantação → App da Web
 * (Executar como: eu; Quem pode acessar: Qualquer pessoa). O sistema chama
 * com POST {"segredo": "...", "dias": 30}. Sem o segredo, nada é lido.
 */
function doPost(e) {
  var segredo = PropertiesService.getScriptProperties().getProperty("SEGREDO");
  var corpo = {};
  try { corpo = JSON.parse(e.postData.contents); } catch (err) { corpo = {}; }
  // Fail-closed (CLAUDE.md §9.45): sem segredo configurado, nega.
  if (!segredo || corpo.segredo !== segredo) {
    return ContentService.createTextOutput(JSON.stringify({ erro: "nao_autorizado" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var dias = Math.min(Math.max(Number(corpo.dias) || 30, 1), 180);
  return ContentService.createTextOutput(JSON.stringify({ respostas: buscarRespostas_(dias) }))
    .setMimeType(ContentService.MimeType.JSON);
}
