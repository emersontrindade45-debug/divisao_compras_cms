/**
 * M30.d — Leitura das respostas de cotação na caixa compras@ (SPIKE).
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
 *   1. Entrar em script.google.com logado como compras@camarasantos.sp.gov.br
 *   2. Novo projeto → colar este arquivo → Salvar.
 *   3. Configurações do projeto → Propriedades do script → SEGREDO = <valor longo aleatório>.
 *   4. Rodar `testeLeitura` uma vez no editor e autorizar (escopo de leitura do Gmail).
 *      O log mostra só CONTAGENS — confira que nenhum assunto/corpo aparece.
 */

/**
 * Caixa que este script DEVE ler. Se ele rodar em outra conta (o navegador costuma ter várias
 * contas Google abertas), recusa em vez de ler a caixa errada e gravar dados de outra unidade.
 */
var CAIXA_ESPERADA = "compras@camarasantos.sp.gov.br";

function contaEfetiva_() {
  return Session.getEffectiveUser().getEmail().toLowerCase();
}

function contaCerta_() {
  return contaEfetiva_() === CAIXA_ESPERADA;
}

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

/**
 * Número do processo no TEXTO do e-mail ("Processo Administrativo nº 382/2026", "Proc. 382"). O
 * assunto não é padronizado na Divisão, mas o corpo sempre cita o processo. Só o número sai.
 *
 * Aceita "382", "382/2026" e "2026/382" (ano na frente). O texto de uma resposta cita o envio
 * original, então o mesmo número se repete — isso é normal. Se o texto citar NÚMEROS DIFERENTES,
 * devolve null: ligar ao processo errado não é recuperável, ficar sem ligação é (CLAUDE.md §9.93).
 */
function numeroProcessoDoCorpo_(corpo) {
  var re = /\bproc(?:esso)?\.?\s*(?:administrativo\s*)?(?:n[ºo°.]?\s*)?:?\s*(\d{1,6})(?:\s*\/\s*(\d{1,6}))?/gi;
  var achados = {};
  var m;
  while ((m = re.exec(corpo || "")) !== null) {
    var numero = m[2] && /^(19|20)\d\d$/.test(m[1]) ? m[2] : m[1];
    achados[String(Number(numero))] = 1;
  }
  var chaves = Object.keys(achados);
  return chaves.length === 1 ? chaves[0] : null;
}

/** "Entrega: 16/10/2026" no assunto → "2026-10-16" (ou null). */
function prazoDoAssunto_(assunto) {
  var m = /entrega\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(assunto || "");
  if (!m) return null;
  var dia = ("0" + m[1]).slice(-2), mes = ("0" + m[2]).slice(-2);
  return m[3] + "-" + mes + "-" + dia;
}

/**
 * Prazo no TEXTO do e-mail enviado pela própria Divisão (21 de 23 envios não
 * têm "Entrega:" no assunto — medido em 2026-11-16). Primeira data que vem
 * logo depois de "prazo", "até", "entrega" ou "validade". Só a data sai.
 */
function prazoDoCorpo_(corpo) {
  var m = /(prazo|at[eé]|entrega|validade)[^\d]{0,60}(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(corpo || "");
  if (!m) return null;
  return m[4] + "-" + ("0" + m[3]).slice(-2) + "-" + ("0" + m[2]).slice(-2);
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
// getEffectiveUser, NÃO getActiveUser: chamado como app da web por anônimo, o
// usuário ativo é vazio e todo envio seria descartado (medido em 2026-11-16).
/** Teto de fios por leitura — o sistema rejeita payload acima de 1000 envios. */
var MAX_FIOS = 800;

/** Consulta do Gmail para a janela [desdeDias + dias, desdeDias] dias atrás. */
function consultaEnvios_(dias, desdeDias) {
  var q = 'in:sent subject:("Solicitação de Orçamento") newer_than:' + (dias + desdeDias) + "d";
  return desdeDias > 0 ? q + " older_than:" + desdeDias + "d" : q;
}

/** Busca paginada (o Gmail devolve até 500 por chamada). `truncado` = havia mais que MAX_FIOS. */
function buscarFios_(dias, desdeDias) {
  var fios = [];
  var inicio = 0;
  while (fios.length < MAX_FIOS) {
    var lote = GmailApp.search(consultaEnvios_(dias, desdeDias), inicio, Math.min(100, MAX_FIOS - fios.length));
    fios = fios.concat(lote);
    if (lote.length < 100) return { fios: fios, truncado: false };
    inicio += lote.length;
  }
  var resto = GmailApp.search(consultaEnvios_(dias, desdeDias), inicio, 1);
  return { fios: fios, truncado: resto.length > 0 };
}

function buscarEnvios_(dias, desdeDias, fiosJaBuscados) {
  var threads = fiosJaBuscados || buscarFios_(dias, desdeDias || 0).fios;
  var eu = CAIXA_ESPERADA;
  var saida = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (enderecos_(m.getFrom())[0] !== eu) return; // só o que a própria caixa enviou
      var assunto = m.getSubject();
      if (/^\s*(re|res|enc|fwd?)\s*:/i.test(assunto)) return; // resposta/encaminhamento não é solicitação
      var prazoAssunto = prazoDoAssunto_(assunto);
      var corpoEnvio = m.getPlainBody();
      saida.push({
        id: m.getId(),
        fio: t.getId(),
        data: m.getDate().toISOString(),
        destinatarios: enderecos_([m.getTo(), m.getCc(), m.getBcc()].join(",")),
        // Assunto primeiro (mais específico); o corpo cobre os envios sem número no assunto.
        processo: numeroProcessoDoAssunto_(assunto) || numeroProcessoDoCorpo_(corpoEnvio),
        prazo: prazoAssunto || prazoDoCorpo_(corpoEnvio),
        prazoOrigem: prazoAssunto ? "assunto" : null,
      });
      var ultimo = saida[saida.length - 1];
      if (!ultimo.prazoOrigem && ultimo.prazo) ultimo.prazoOrigem = "corpo";
    });
  });
  return saida;
}

var ASSUNTO_AUTOMATICO = /^\s*(resposta autom[aá]tica|automatic reply|auto[- ]?reply|ausente|out of office|fora do escrit[oó]rio|recebemos sua mensagem)/i;
var REMETENTE_DEVOLUCAO = /^(mailer-daemon|postmaster|mail-daemon|no-?reply-?bounce)@/i;

/** Resposta automática, pelos cabeçalhos técnicos (RFC 3834) e pelo assunto. */
function ehAutomatica_(msg) {
  var auto = (msg.getHeader("Auto-Submitted") || "").toLowerCase();
  var prec = (msg.getHeader("Precedence") || "").toLowerCase();
  return (auto !== "" && auto !== "no") ||
    msg.getHeader("X-Autoreply") !== "" || msg.getHeader("X-Autorespond") !== "" ||
    prec === "auto_reply" || ASSUNTO_AUTOMATICO.test(msg.getSubject() || "");
}

function metadadosDaMensagem_(msg, envio) {
  var assunto = msg.getSubject();
  var corpo = (msg.getPlainBody() || "").toLowerCase();
  var anexos = msg.getAttachments({ includeInlineImages: false });
  var remetente = (/<([^>]+)>/.exec(msg.getFrom()) || [null, msg.getFrom()])[1].trim().toLowerCase();
  return {
    id: msg.getId(),
    fio: msg.getThread().getId(),
    envioId: envio ? envio.id : null,
    data: msg.getDate().toISOString(),
    remetente: remetente,
    // O número do processo vem do ENVIO do mesmo fio; o assunto da resposta é só reserva.
    processo: (envio && envio.processo) || numeroProcessoDoAssunto_(assunto) || numeroProcessoDoCorpo_(corpo),
    remetenteEraDestinatario: envio ? envio.destinatarios.indexOf(remetente) !== -1 : false,
    devolucao: REMETENTE_DEVOLUCAO.test(remetente),
    // Endereço que voltou: cabeçalho técnico do servidor, sem ler o texto da devolução.
    enderecosDevolvidos: REMETENTE_DEVOLUCAO.test(remetente)
      ? enderecos_(msg.getHeader("X-Failed-Recipients"))
      : [],
    automatica: ehAutomatica_(msg),
    temAnexoOrcamento: anexos.some(function (a) { return EXTENSOES_ORCAMENTO.test(a.getName()); }),
    contemRecusa: FRASES_RECUSA.some(function (f) { return corpo.indexOf(f) !== -1; }),
    contemValor: /r\$\s*\d/.test(corpo),
  };
}

/**
 * Respostas recebidas nos MESMOS FIOS das solicitações enviadas. Ligar pelo
 * fio, e não pelo assunto: só 245 de 647 respostas traziam o número do
 * processo no assunto (medido em 2026-11-16).
 */
function buscarRespostas_(envios) {
  var eu = CAIXA_ESPERADA;
  var envioPorFio = {};
  envios.forEach(function (e) { if (!envioPorFio[e.fio]) envioPorFio[e.fio] = e; });
  var saida = [];
  Object.keys(envioPorFio).forEach(function (fio) {
    var envio = envioPorFio[fio];
    GmailApp.getThreadById(fio).getMessages().forEach(function (m) {
      if (enderecos_(m.getFrom())[0] === eu) return;
      if (m.getDate() < new Date(envio.data)) return;
      saida.push(metadadosDaMensagem_(m, envio));
    });
  });
  return saida;
}

/** Passo 1 do spike: rode no editor. Loga SÓ contagens. */
function testeLeitura() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var envios = buscarEnvios_(30);
  var conta = function (lista, f) { return lista.filter(f).length; };
  var distintos = {};
  envios.forEach(function (e) { e.destinatarios.forEach(function (d) { distintos[d] = 1; }); });
  Logger.log("ENVIOS: " + envios.length +
    " | com processo: " + conta(envios, function (x) { return x.processo; }) +
    " | prazo no assunto: " + conta(envios, function (x) { return x.prazoOrigem === "assunto"; }) +
    " | prazo no texto: " + conta(envios, function (x) { return x.prazoOrigem === "corpo"; }) +
    " | sem prazo: " + conta(envios, function (x) { return !x.prazo; }));
  Logger.log("DESTINATÁRIOS: " + envios.reduce(function (a, x) { return a + x.destinatarios.length; }, 0) +
    " | distintos: " + Object.keys(distintos).length +
    " | média por envio: " + Math.round(envios.reduce(function (a, x) { return a + x.destinatarios.length; }, 0) / Math.max(envios.length, 1)));

  var r = buscarRespostas_(envios);
  var humanas = r.filter(function (x) { return !x.automatica && !x.devolucao; });
  Logger.log("RESPOSTAS no fio: " + r.length +
    " | devoluções: " + conta(r, function (x) { return x.devolucao; }) +
    " | automáticas: " + conta(r, function (x) { return x.automatica && !x.devolucao; }) +
    " | humanas: " + humanas.length);
  var devolvidos = {};
  r.forEach(function (x) { x.enderecosDevolvidos.forEach(function (d) { devolvidos[d] = 1; }); });
  Logger.log("DEVOLUÇÕES: com endereço identificado: " +
    conta(r, function (x) { return x.enderecosDevolvidos.length > 0; }) +
    " | endereços inválidos distintos: " + Object.keys(devolvidos).length);
  Logger.log("HUMANAS: com anexo: " + conta(humanas, function (x) { return x.temAnexoOrcamento; }) +
    " | com recusa: " + conta(humanas, function (x) { return x.contemRecusa; }) +
    " | com R$ no texto: " + conta(humanas, function (x) { return x.contemValor; }) +
    " | remetente era destinatário: " + conta(humanas, function (x) { return x.remetenteEraDestinatario; }) +
    " | sem nenhum sinal: " + conta(humanas, function (x) { return !x.temAnexoOrcamento && !x.contemRecusa && !x.contemValor; }));
}

/**
 * Passo 2 do spike: Implantar → Nova implantação → App da Web
 * (Executar como: eu; Quem pode acessar: Qualquer pessoa). O sistema chama
 * com POST {"segredo": "...", "dias": 30, "desdeDias": 0}. Sem o segredo, nada é lido.
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
  // Conta errada: nada é lido. O sistema mostra só "formato inesperado"; a conta aparece no log.
  if (!contaCerta_()) {
    return ContentService.createTextOutput(JSON.stringify({ erro: "conta_errada", contaEfetiva: contaEfetiva_() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var dias = Math.min(Math.max(Number(corpo.dias) || 30, 1), 90);
  // desdeDias: começa a janela N dias atrás (0 = hoje). O sistema percorre o histórico em
  // fatias ("hoje para trás"), porque uma leitura longa estoura o prazo da função dele.
  var desdeDias = Math.min(Math.max(Number(corpo.desdeDias) || 0, 0), 1500);
  var busca = buscarFios_(dias, desdeDias);
  var env = buscarEnvios_(dias, desdeDias, busca.fios);
  return ContentService.createTextOutput(JSON.stringify({
    // Diagnóstico sem conteúdo: só a conta que executa e contagens.
    diagnostico: {
      versao: "corpo-2",
      contaEfetiva: Session.getEffectiveUser().getEmail(),
      contaAtiva: Session.getActiveUser().getEmail() || "(vazia)",
      fiosEncontrados: busca.fios.length,
      fiosTruncados: busca.truncado,
    },
    envios: env,
    respostas: buscarRespostas_(env),
  })).setMimeType(ContentService.MimeType.JSON);
}
