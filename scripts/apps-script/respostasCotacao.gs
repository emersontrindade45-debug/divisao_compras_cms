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
  var corpo = normalizar_(msg.getPlainBody());
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
    // Recusa em frase mais ampla que a lista fixa, sem a parte citada. Só SUGERE (vai à fila).
    provavelRecusa: provavelRecusa_(semCitacao_(msg.getPlainBody())),
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
 * Texto em minúsculas, com acentos recompostos (NFC) e espaços "estranhos" trocados por espaço
 * comum. E-mail de celular/Outlook costuma trazer o "ã" decomposto (a + til) ou espaço sem quebra;
 * sem isto "não temos interesse" não casa com a lista de frases (visto na fila de 2026-11-18).
 */
function normalizar_(texto) {
  return String(texto || "").normalize("NFC").replace(/[\u00a0\u200b\u202f\u2007]/g, " ").toLowerCase();
}

/**
 * Texto da resposta SEM a parte citada (o e-mail original que vem embaixo). Sem isso, o "?" ou o
 * "orçamento" do nosso próprio pedido contariam como sinal do fornecedor.
 */
function semCitacao_(corpo) {
  var t = String(corpo || "");
  // O cabeçalho "Em qui., 5 de mar. de 2026 10:00 Fulano <x@y> escreveu:" passa de 100 caracteres e
  // pode quebrar de linha: por isso o intervalo é largo e atravessa quebras. Medido em 2026-11-18.
  var corte = t.search(
    /(\bem|\bon)\s+(seg|ter|qua|qui|sex|s[aá]b|dom|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s+de|\d{1,2}\/\d{1,2}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)[\s\S]{3,240}?(escreveu|wrote)\s*:|-{2,}\s*(mensagem|original|forwarded)|\n\s*(de|from):\s|\n\s*>|c[aâ]mara municipal de santos\s+cnpj/i,
  );
  return corte === -1 ? t : t.slice(0, corte);
}

/**
 * Recusa provável, por frases mais amplas que a lista fixa (FRASES_RECUSA), com EXCEÇÃO para quem
 * demonstra interesse ou pede prazo: "temos interesse… não será possível concluir hoje" não é
 * recusa. Ampliada em 2026-11-18 com as famílias de frase vistas na amostra de dúvida ("não
 * realizamos/imprimimos/disponibilizamos…", "não participar", "não faz parte do portfólio", "região fora
 * da atuação") e, numa 2ª rodada, "declinar", "não dispomos", "optou por não", "não é possível
 * participar/apresentar", "localização distante da rede" e "não faz parte do catálogo". Validada em 2026-11-18 numa amostra rotulada de 30 respostas: 24 de 24 recusas casadas,
 * 0 falsos positivos. Amostra pequena: por isso só SUGERE, nunca aplica sozinha.
 */
function provavelRecusa_(texto) {
  var t = normalizar_(texto);
  // "temos interesse" só protege quando NÃO vem depois de "não" ("não temos interesse" é recusa).
  var guarda = /((?<!n[aã]o )temos interesse|estamos providenciando|extens[aã]o (do )?prazo|possibilidade de|gostaria de (saber|validar)|poderia)/;
  var recusa = new RegExp("(" + [
    // "não" + verbo de atender/fornecer/participar (singular, plural e futuro)
    "n[aã]o (conseguimos|conseguiremos|consigo|vamos conseguir|vou conseguir) (atender|participar|cotar|enviar|fornecer|ofertar|apresentar|fazer|contribuir|ajudar|prosseguir|orçar|responder)",
    "n[aã]o (podemos|poderemos|produzimos|fornece|fornecemos|atendo|atendemos|atende|atendem|trabalhamos|trabalha|comercializamos|comercializa|revende|revendemos|participamos|dispomos|realizamos|prestamos|imprimimos|disponibilizamos|ofertamos|vendemos|possu[ií]mos|executamos|atuamos|atuo|fazemos|fa[cç]o|operamos|cotamos|cotado)",
    "n[aã]o (iremos|vamos|vou|poderemos|teremos|desejamos|pretendemos|queremos) (participar|prosseguir|apresentar|cotar|atender|enviar|seguir|orçar)",
    "n[aã]o (seguiremos|prosseguiremos|apresentaremos|participaremos|cotaremos)",
    "n[aã]o (temos|tem|tenho|teremos|terei) (como|condi[cç](ão|ões)|esses|esse|este|estes|interesse|o interesse|atendimento|disponibilidade|viabilidade|itens)",
    "n[aã]o h[aá] (interesse|tempo h[aá]bil)",
    "n[aã]o (estamos|estou) (mais |participando|assumindo|fornecendo|fazendo|trabalhando|atuando|atendendo|operando|conseguindo (repassar|cotar|atender|participar|fornecer))",
    "n[aã]o participar",
    "n[aã]o [eé] (compat[ií]vel|o (meu|nosso) ramo)",
    "n[aã]o s[aã]o compat[ií]veis",
    "n[aã]o se (aplica|encaixa)",
    "n[aã]o (est[aá]|est[aã]o) (na|no|em)[^.]{0,20}(linha|escopo|portf[oó]lio|portif[oó]lio|cat[aá]logo|ramo)",
    "n[aã]o faz(em)? parte[^.]{0,40}(escopo|portf[oó]lio|portif[oó]lio|cat[aá]logo|linha)",
    "n[aã]o (ser[aá]|[eé]) poss[ií]vel (encaminhar|enviar|o envio|atend|participar|realizar|apresentar)",
    "fora d[oe] (nosso )?(ramo|segmento|escopo|perfil)",
    "(sua|essa|esta) regi[aã]o[^.]{0,50}n[aã]o",
    "(localiza[cç][aã]o|endere[cç]o|local)[^.]{0,40}(distante|fora d[aeo] (nossa |nosso )?(rede|[aá]rea|regi[aã]o|cobertura))",
    "declin(ar|amos|ando|ou|aremos)",
    "optou por n[aã]o|optamos por n[aã]o|optei por n[aã]o",
    "deixa(mos|m)? de (cotar|atender|participar)",
    "desist[eê]ncia|desistimos|sem condi[cç](ão|ões) de",
    "(nossa|ol[aá],?) negativa|negativa em participa",
    "fica invi[aá]vel|invi[aá]vel o atendimento|impossibilitad",
    "se restringe",
    "atua(mos)? (apenas|somente|exclusivamente)",
    "s[oó] (estamos )?trabalh",
    "(trabalh|comercializ|vend|atend)\\w*[^.]{0,25}(somente|apenas|exclusivamente)",
    "(numa|em uma|para uma) (pr[oó]xima|outra) oportunidade",
  ].join("|") + ")");
  return recusa.test(t) && !guarda.test(t);
}

/**
 * Marcadores candidatos para as respostas que hoje não têm sinal nenhum. Só booleanos: o texto
 * nunca sai. Servem para MEDIR (testeSemSinal) antes de virar regra de classificação.
 * (`numeroDecimal` foi retirado: acendia por telefone, CEP e CNPJ — 0 de 15 eram valor.)
 */
function marcadoresDoTexto_(texto) {
  var t = normalizar_(texto);
  return {
    vazio: t.replace(/\s+/g, " ").trim().length < 20,
    pergunta: t.indexOf("?") !== -1,
    pedeInformacao: /(termo de refer|\btr\b|especifica|detalh|mais informa|poderia (enviar|informar)|gostaria de saber|qual (a|o) |quantidade|prazo de entrega|local de entrega)/.test(t),
    provavelRecusa: provavelRecusa_(t),
    mencionaProposta: /(segue|em anexo|anexo|proposta|or[cç]amento|cota[cç][aã]o)/.test(t),
    recebido: /(recebemos|recebido|obrigad|agradec|aguard|encaminh|repass|setor|respons[aá]vel|retornar|retorno)/.test(t),
  };
}

/** Resposta de quem é da própria Câmara (a Divisão responde dentro do fio): não é fornecedor. */
function ehInterna_(msg) {
  var de = (/<([^>]+)>/.exec(msg.getFrom()) || [null, msg.getFrom()])[1].trim().toLowerCase();
  return /@camarasantos\.sp\.gov\.br$/.test(de);
}

/**
 * SPIKE de classificação: entre as respostas humanas SEM nenhum sinal (a maior parte da fila "a
 * confirmar"), conta quantas trazem cada marcador candidato. Roda em 3 janelas de 90 dias e loga
 * SÓ CONTAGENS — nenhum texto, assunto ou endereço. Rode no editor e cole o log.
 */
function testeSemSinal() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var c = { humanas: 0, semSinal: 0, anexoQualquer: 0, anexoImagem: 0, anexoOutro: 0 };
  var m = { vazio: 0, pergunta: 0, pedeInformacao: 0, provavelRecusa: 0, mencionaProposta: 0, recebido: 0, nenhum: 0 };
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        c.humanas++;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        c.semSinal++;
        var anexos = msg.getAttachments({ includeInlineImages: false });
        if (anexos.length > 0) c.anexoQualquer++;
        if (anexos.some(function (a) { return /\.(jpe?g|png|gif|heic|webp)$/i.test(a.getName()); })) c.anexoImagem++;
        if (anexos.some(function (a) { return !/\.(jpe?g|png|gif|heic|webp)$/i.test(a.getName()) && !EXTENSOES_ORCAMENTO.test(a.getName()); })) c.anexoOutro++;
        var marc = marcadoresDoTexto_(semCitacao_(msg.getPlainBody()));
        var algum = false;
        Object.keys(marc).forEach(function (k) { if (marc[k]) { m[k]++; algum = true; } });
        if (!algum) m.nenhum++;
      });
    });
  });
  Logger.log("SEM SINAL: " + c.semSinal + " de " + c.humanas + " humanas | com anexo qualquer: " + c.anexoQualquer +
    " | anexo imagem: " + c.anexoImagem + " | anexo de outro tipo: " + c.anexoOutro);
  Logger.log("MARCADORES entre os sem sinal: " + Object.keys(m).map(function (k) { return k + " " + m[k]; }).join(" | "));
}

/**
 * Amostra sorteada (reservatório) de até `n` itens: cada item visto tem a mesma chance de ficar,
 * sem guardar a lista inteira. `estado` = { n: <tamanho>, vistos: 0, itens: [] }.
 */
function sortear_(estado, item) {
  estado.vistos++;
  if (estado.itens.length < estado.n) { estado.itens.push(item); return; }
  var j = Math.floor(Math.random() * estado.vistos);
  if (j < estado.n) estado.itens[j] = item;
}

/**
 * RÉGUA: para conferir as regras com o Gemini do Gmail, sorteia respostas SEM SINAL por marcador e
 * loga só o LINK de cada uma (o id da mensagem não é conteúdo). Quem confere abre o link, pergunta
 * ao Gemini e anota a letra. Nenhum texto, assunto ou endereço sai do Google.
 */
function amostraParaConferir() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var N = 15;
  var grupos = {};
  ["provavelRecusa", "pedeInformacao", "recebido", "mencionaProposta", "pergunta", "nenhum"].forEach(function (k) {
    grupos[k] = { n: N, vistos: 0, itens: [] };
  });
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        var marc = marcadoresDoTexto_(semCitacao_(msg.getPlainBody()));
        var algum = false;
        Object.keys(grupos).forEach(function (k) {
          if (k !== "nenhum" && marc[k]) { sortear_(grupos[k], msg.getId()); algum = true; }
        });
        if (!algum) sortear_(grupos.nenhum, msg.getId());
      });
    });
  });
  var base = "https://mail.google.com/mail/?authuser=" + CAIXA_ESPERADA + "#all/";
  Object.keys(grupos).forEach(function (k) {
    Logger.log("== " + k + " (" + grupos[k].itens.length + " de " + grupos[k].vistos + ") ==");
    grupos[k].itens.forEach(function (id, i) { Logger.log((i + 1) + ". " + base + id); });
  });
}

/**
 * Tira do texto o que identifica ou vale dinheiro, ANTES de qualquer cópia sair do Google:
 * a parte citada, a assinatura, e-mails, links, CNPJ/CPF, telefones, valores e qualquer número.
 * Fica a frase do fornecedor, que é o que a classificação precisa. É um filtro de melhor esforço:
 * NOMES próprios escritos no texto não são removidos — confira o resultado antes de colar fora.
 */
function anonimizar_(corpo) {
  var t = semCitacao_(corpo);
  // Assinatura: despedida, ou o primeiro bloco de contato (fone, whatsapp, site...).
  var corte = t.search(/\n\s*(att\.?|atenciosamente|cordialmente|abra[cç]os?|grato|grata|--)\s*[,.;]?\s*(\n|$)|\s(fone\/fax|fone:|tel\.?:|cel\.?:|whatsapp|site:|e-mail:)/i);
  if (corte !== -1) t = t.slice(0, corte);
  // Saudação com nome ("Olá Ana, boa tarde.", "Prezado Sr. Fulano,"): até 2 cláusulas iniciais.
  for (var i = 0; i < 2; i++) {
    t = t.replace(/^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite|prezad[oa]s?|caro|cara)[^,.!?\n]{0,60}[,.!?]\s*/i, "");
  }
  return t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(https?:\/\/|www\.)\S+/gi, "[link]")
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, "[doc]")
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[doc]")
    .replace(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[tel]")
    .replace(/r\$\s*[\d.,]+/gi, "[valor]")
    .replace(/\d[\d.,]*/g, "[n]")
    // Nome de pessoa/empresa: 2 ou mais palavras capitalizadas seguidas (nome de uma palavra só
    // continua passando — melhor esforço).
    .replace(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)+/g, "[nome]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

/**
 * RÉGUA com IA externa, por decisão do usuário (exceção SÓ para validar as regras): sorteia
 * respostas sem sinal dos dois grupos que podem virar regra e loga o texto ANONIMIZADO, em blocos
 * para colar no ChatGPT. O cabeçalho de cada item traz o grupo, o número e o fim do id, para as
 * letras voltarem ao item certo. Não grava nada fora do log.
 */
function amostraAnonimizada() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var N = 15;
  var grupos = { provavelRecusa: { n: N, vistos: 0, itens: [] } };
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        var corpo = msg.getPlainBody();
        var marc = marcadoresDoTexto_(semCitacao_(corpo));
        Object.keys(grupos).forEach(function (k) {
          if (marc[k]) sortear_(grupos[k], { id: msg.getId(), texto: anonimizar_(corpo) });
        });
      });
    });
  });
  Object.keys(grupos).forEach(function (k) {
    Logger.log("=== GRUPO " + k + " (" + grupos[k].itens.length + " de " + grupos[k].vistos + ") ===");
    var bloco = [];
    grupos[k].itens.forEach(function (it, i) {
      bloco.push("[" + k + " " + (i + 1) + " · " + it.id.slice(-6) + "] " + it.texto);
      if (bloco.length === 5 || i === grupos[k].itens.length - 1) { Logger.log(bloco.join("\n")); bloco = []; }
    });
  });
}

/**
 * Grupo de candidatas a DÚVIDA, a partir dos marcadores (já sem anexo/valor/recusa). Quem tem
 * provável recusa fica de fora: recusa vence dúvida. null = não é candidata.
 *  - pedeInformacao: pede/cita TR, especificação, quantidade, prazo, local…
 *  - soPergunta: tem "?" mas sem as palavras acima;
 *  - soRecebido: só confirma recebimento/promete retorno (controle: NÃO deve ser dúvida).
 */
function grupoDuvida_(marc) {
  if (marc.vazio || marc.provavelRecusa) return null;
  if (marc.pedeInformacao) return "pedeInformacao";
  if (marc.pergunta) return "soPergunta";
  if (marc.recebido && !marc.mencionaProposta) return "soRecebido";
  return null;
}

/**
 * RÉGUA de DÚVIDA (mesma exceção de amostraAnonimizada: texto anonimizado, só para validar a
 * regra). Sorteia N respostas sem sinal por grupo de grupoDuvida_ e loga em blocos de 5.
 */
function amostraDuvida() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var N = 10;
  var grupos = {
    pedeInformacao: { n: N, vistos: 0, itens: [] },
    soPergunta: { n: N, vistos: 0, itens: [] },
    soRecebido: { n: N, vistos: 0, itens: [] },
  };
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        var corpo = msg.getPlainBody();
        var g = grupoDuvida_(marcadoresDoTexto_(semCitacao_(corpo)));
        if (g) sortear_(grupos[g], { id: msg.getId(), texto: anonimizar_(corpo) });
      });
    });
  });
  Object.keys(grupos).forEach(function (k) {
    Logger.log("=== GRUPO " + k + " (" + grupos[k].itens.length + " de " + grupos[k].vistos + ") ===");
    var bloco = [];
    grupos[k].itens.forEach(function (it, i) {
      bloco.push("[" + k + " " + (i + 1) + " · " + it.id.slice(-6) + "] " + it.texto);
      if (bloco.length === 5 || i === grupos[k].itens.length - 1) { Logger.log(bloco.join("\n")); bloco = []; }
    });
  });
}

/**
 * RÉGUA EM LOTE: sorteia N (padrão 100) respostas SEM SINAL de qualquer grupo — as que sobraram
 * depois das regras de anexo, valor e recusa — e loga o texto ANONIMIZADO em blocos de 10, para
 * rotular de uma vez. O cabeçalho traz o número, o fim do id e os marcadores (P pergunta, I pede
 * informação, R recebido) para medir cada regra depois. Mesma exceção de sigilo de amostraDuvida.
 */
function amostraLote() {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var N = 100;
  var amostra = { n: N, vistos: 0, itens: [] };
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        var corpo = msg.getPlainBody();
        var marc = marcadoresDoTexto_(semCitacao_(corpo));
        if (marc.vazio || marc.provavelRecusa) return; // já tratados: vazio não tem o que ler; recusa vai à fila
        var tags = (marc.pergunta ? "P" : "") + (marc.pedeInformacao ? "I" : "") + (marc.recebido ? "R" : "");
        sortear_(amostra, { id: msg.getId(), tags: tags || "-", texto: anonimizar_(corpo) });
      });
    });
  });
  Logger.log("=== LOTE: " + amostra.itens.length + " de " + amostra.vistos + " sem sinal ===");
  var bloco = [];
  amostra.itens.forEach(function (it, i) {
    bloco.push("[" + (i + 1) + " · " + it.id.slice(-6) + " · " + it.tags + "] " + it.texto);
    if (bloco.length === 10 || i === amostra.itens.length - 1) { Logger.log(bloco.join("\n")); bloco = []; }
  });
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
      versao: "corpo-3",
      contaEfetiva: Session.getEffectiveUser().getEmail(),
      contaAtiva: Session.getActiveUser().getEmail() || "(vazia)",
      fiosEncontrados: busca.fios.length,
      fiosTruncados: busca.truncado,
    },
    envios: env,
    respostas: buscarRespostas_(env),
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * RÉGUA COMPLETA: varre TODAS as respostas sem sinal (sem repetir a mesma mensagem, que aparece em
 * duas janelas quando o fio cruza os 90 dias), em ordem FIXA (por id), e loga a `parte` pedida, de
 * `tamanho` em `tamanho`, anonimizada, em blocos de 10. Rode amostraParte1, 2, 3 e 4 e cole os logs:
 * juntas cobrem a fila inteira, sem sorteio e sem sobreposição. Mesma exceção de sigilo de
 * amostraDuvida (texto anonimizado, só para validar as regras).
 */
function amostraParte_(parte, tamanho) {
  Logger.log("CONTA: " + contaEfetiva_() + (contaCerta_() ? " (correta)" : " — ERRADA, esperado " + CAIXA_ESPERADA));
  if (!contaCerta_()) return;
  var vistos = {};
  var todas = [];
  [[0, 90], [90, 90], [180, 90]].forEach(function (j) {
    var envios = buscarEnvios_(j[1], j[0]);
    var porFio = {};
    envios.forEach(function (e) { if (!porFio[e.fio]) porFio[e.fio] = e; });
    Object.keys(porFio).forEach(function (fio) {
      var envio = porFio[fio];
      GmailApp.getThreadById(fio).getMessages().forEach(function (msg) {
        if (enderecos_(msg.getFrom())[0] === CAIXA_ESPERADA) return;
        if (msg.getDate() < new Date(envio.data)) return;
        var id = msg.getId();
        if (vistos[id]) return;
        var meta = metadadosDaMensagem_(msg, envio);
        if (meta.automatica || meta.devolucao || ehInterna_(msg)) return;
        if (meta.temAnexoOrcamento || meta.contemRecusa || meta.contemValor) return;
        var corpo = msg.getPlainBody();
        var marc = marcadoresDoTexto_(semCitacao_(corpo));
        if (marc.vazio || marc.provavelRecusa) return;
        vistos[id] = true;
        var tags = (marc.pergunta ? "P" : "") + (marc.pedeInformacao ? "I" : "") + (marc.recebido ? "R" : "");
        todas.push({ id: id, tags: tags || "-", corpo: corpo });
      });
    });
  });
  todas.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  var ini = (parte - 1) * tamanho;
  var fatia = todas.slice(ini, ini + tamanho);
  Logger.log("=== PARTE " + parte + " de " + Math.ceil(todas.length / tamanho) + ": itens " + (ini + 1) + " a " +
    (ini + fatia.length) + " de " + todas.length + " sem sinal ===");
  var bloco = [];
  fatia.forEach(function (it, i) {
    bloco.push("[" + (ini + i + 1) + " · " + it.id.slice(-6) + " · " + it.tags + "] " + anonimizar_(it.corpo));
    if (bloco.length === 10 || i === fatia.length - 1) { Logger.log(bloco.join("\n")); bloco = []; }
  });
}

function amostraParte1() { amostraParte_(1, 90); }
function amostraParte2() { amostraParte_(2, 90); }
function amostraParte3() { amostraParte_(3, 90); }
function amostraParte4() { amostraParte_(4, 90); }

/** Fila inteira de uma vez (até 350). Se o log vier cortado, use amostraParte1..4. */
function amostraTodas() { amostraParte_(1, 350); }
