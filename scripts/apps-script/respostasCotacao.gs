/**
 * M30.d — Leitura das respostas de cotação na caixa divisaocompras@ (SPIKE).
 *
 * Duas leituras: os ENVIOS ("Solicitação de Orçamento Proc. N … / Entrega:
 * dd/mm/aaaa", na pasta Enviados) viram cotações no sistema; as RESPOSTAS
 * recebidas são ligadas a essas cotações e classificadas.
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

/** "Entrega: 16/10/2026" no assunto → "2026-10-16" (ou null). */
function prazoDoAssunto_(assunto) {
  var m = /entrega\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(assunto || "");
  if (!m) return null;
  var dia = ("0" + m[1]).slice(-2), mes = ("0" + m[2]).slice(-2);
  return m[3] + "-" + mes + "-" + dia;
}

/** Lista de endereços ("Nome <a@b>, c@d") → só os e-mails, minúsculos. */
function enderecos_(campo) {
  return (campo || "")
    .split(",")
    .map(function (x) { return ((/<([^>]+)>/.exec(x) || [null, x])[1] || "").trim().toLowerCase(); })
    .filter(function (x) { return x.indexOf("@") !== -1; });
}

/**
 * Solicitações de orçamento ENVIADAS pela caixa nos últimos `dias` dias. Cada
 * envio pode ter vários fornecedores (Para, Cc e Cco); cada um vira uma cotação.
 */
function buscarEnvios_(dias) {
  var threads = GmailApp.search('in:sent subject:("Solicitação de Orçamento") newer_than:' + dias + "d", 0, 200);
  var eu = Session.getActiveUser().getEmail().toLowerCase();
  var saida = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (enderecos_(m.getFrom())[0] !== eu) return; // só o que a própria caixa enviou
      var assunto = m.getSubject();
      if (/^\s*(re|res|enc|fwd?)\s*:/i.test(assunto)) return; // resposta/encaminhamento não é solicitação
      saida.push({
        id: m.getId(),
        data: m.getDate().toISOString(),
        destinatarios: enderecos_([m.getTo(), m.getCc(), m.getBcc()].join(",")),
        processo: numeroProcessoDoAssunto_(assunto),
        prazo: prazoDoAssunto_(assunto),
      });
    });
  });
  return saida;
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
  var envios = buscarEnvios_(30);
  Logger.log("envios: " + envios.length);
  Logger.log("envios com número de processo: " + envios.filter(function (x) { return x.processo; }).length);
  Logger.log("envios com prazo (Entrega:): " + envios.filter(function (x) { return x.prazo; }).length);
  Logger.log("fornecedores consultados (destinatários): " +
    envios.reduce(function (a, x) { return a + x.destinatarios.length; }, 0));

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
  return ContentService.createTextOutput(
    JSON.stringify({ envios: buscarEnvios_(dias), respostas: buscarRespostas_(dias) }),
  )
    .setMimeType(ContentService.MimeType.JSON);
}
