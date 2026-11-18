import "server-only";
import { db } from "@/lib/db";
import { definirPrazo } from "@/lib/domain/cotacaoEmail/prazo";
import { ligarProcesso } from "@/lib/domain/cotacaoEmail/ligarProcesso";
import { dominioDe, ligarRemetente } from "@/lib/domain/cotacaoEmail/ligarResposta";
import { classificarResposta } from "@/lib/domain/cotacaoEmail/classificarResposta";
import { buscarCandidatosPorEmail } from "./candidatos";
import { avaliarCriterioIa, type ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";
import { classificarComIa, MODELO_REVISOR, type TrechoParaClassificar } from "./classificarComIa";
import { aplicacaoIaLigada, aplicarClassificacaoIa } from "./aplicarIa";
import type { PayloadScript, RespostaScript } from "./payload";

/**
 * Aplica no sistema o que o script do Google devolveu (M30.d).
 *
 * SIGILO (decidido com o usuário): este módulo recebe só metadados e marcadores booleanos, e só
 * grava o que a Q28 permitiu — situação, data da resposta, regra aplicada e id da mensagem no
 * Gmail. O remetente completo NUNCA é persistido (a fila guarda só o domínio). Nada aqui escreve
 * em console, e quem chama não deve propagar mensagem de erro com dados do payload.
 *
 * Idempotente: clicar duas vezes não duplica nada (chave única no id da mensagem + guardas
 * atômicas `WHERE situacao = ...` no UPDATE — CLAUDE.md §9.14).
 */

export interface ResumoSincronizacao {
  envios: number;
  enviosNovos: number;
  consultasNovas: number;
  respostasClassificadas: number;
  respostasNaFila: number;
  emailsInvalidos: number;
  enviosSemProcesso: number;
  /** Respostas que a IA aplicou nas consultas nesta leitura (só com a chave ligada). */
  aplicadasPelaIa?: number;
}

const HORA_MS = 60 * 60 * 1000;
const LOTE_CRIACAO = 1000;

/**
 * Teto de mensagens enviadas à IA por leitura. 120 = 15 lotes de 8; com 8 em paralelo são ~2 ondas
 * de ~10 s, dentro do prazo abaixo (CLAUDE.md §9.92). O que passar do teto, ou do prazo, fica para
 * a leitura seguinte — o filtro por "já classificada" torna isso retomável sem repetir cobrança.
 */
export const MAX_IA_POR_LEITURA = 120;
/**
 * A função tem 60 s e a leitura do Google já gastou até ~40 s no pior caso (TIMEOUT_SCRIPT_MS), mais
 * o banco. O prazo só vale para COMEÇAR lotes (classificarComIa o confere antes de cada um); o lote
 * em curso termina em ~10 s, então 26 s mantém a soma abaixo do limite no caso típico (~12 s de leitura).
 */
export const PRAZO_IA_MS = 26_000;
/**
 * Limite da função serverless (maxDuration = 60) com folga. A leitura do Google pode levar até
 * ~40 s; o que sobrar depois dela e do banco é o que a IA pode usar (CLAUDE.md §9.100: teto de
 * tempo conferido como "já passei?" autoriza começar o que não cabe).
 */
export const LIMITE_FUNCAO_MS = 55_000;
/**
 * Reserva para o que acontece DEPOIS da IA: gravar os vereditos, aplicar os desfechos das consultas e
 * os e-mails devolvidos. O prazo da própria IA é duro (cada requisição é abortada no fim dele), então
 * esta reserva não precisa cobrir lote em curso.
 */
const RESERVA_LOTE_IA_MS = 10_000;
/** Resposta a ser lida pela IA, com o que as regras já disseram sobre ela. */
type ItemParaIa = TrechoParaClassificar & {
  consultaId: string | null;
  regra: string;
  contemRecusa: boolean;
  dataResposta: Date;
};

/** O que o critério aprovou, pronto para ser aplicado (só com a chave ligada). */
interface Aprovada {
  id: string;
  classe: ClasseResposta;
  consultaId: string;
  dataResposta: Date;
}

/** Quem ainda está na fila por falta de decisão: só estes ganham SUGESTÃO na tela. */
const MOTIVOS_PARA_IA = ["sinais_ambiguos", "provavel_recusa", "provavel_orcamento", "provavel_duvida", "anexo_pdf"];

/** Ano do dia civil em Santos (UTC−3) — o ano que o assunto "382" costuma querer dizer. */
function anoEmSantos(instante: Date): number {
  return new Date(instante.getTime() - 3 * HORA_MS).getUTCFullYear();
}

function minusculo(e: string): string {
  return e.trim().toLowerCase();
}

type SituacaoAplicada = "orcamento" | "recusa" | "a_confirmar";

interface DesfechoConsulta {
  envioId: string;
  email: string;
  situacoes: Set<"orcamento" | "recusa" | "a_confirmar">;
  regras: Map<string, string>;
  /** Mensagem que originou cada situação — o id gravado é o da que gerou a regra aplicada. */
  mensagens: Map<string, string>;
  primeiraData: Date;
}

/** Uma resposta que a classificação+ligação resolveram para uma consulta. */
function desfechoFinal(d: DesfechoConsulta): {
  situacao: SituacaoAplicada;
  regra: string;
  mensagem: string;
} {
  const classificadas = [...d.situacoes].filter((s) => s !== "a_confirmar");
  // Orçamento E recusa do mesmo fornecedor se contradizem: decide um humano.
  if (classificadas.length === 1) {
    const situacao = classificadas[0]! as SituacaoAplicada;
    return {
      situacao,
      regra: d.regras.get(situacao) ?? "manual",
      mensagem: d.mensagens.get(situacao) ?? "",
    };
  }
  return {
    situacao: "a_confirmar",
    regra: classificadas.length > 1 ? "sinais_conflitantes" : (d.regras.get("a_confirmar") ?? "sinais_ambiguos"),
    mensagem: d.mensagens.get("a_confirmar") ?? [...d.mensagens.values()][0] ?? "",
  };
}

export async function sincronizarRespostasEmail(
  payload: PayloadScript,
  opcoes: { processoId?: string; inicioEm?: number; userId?: string } = {},
): Promise<ResumoSincronizacao> {
  const processos = await db.processo.findMany({ select: { id: true, numero: true } });

  // ── 1. Envios ───────────────────────────────────────────────────────────
  const idsGmail = payload.envios.map((e) => e.id);
  const existentes = await db.envioCotacao.findMany({
    where: { gmailMensagemId: { in: idsGmail } },
    select: { gmailMensagemId: true },
  });
  const jaExistem = new Set(existentes.map((e) => e.gmailMensagemId));
  const novos = payload.envios.filter((e) => !jaExistem.has(e.id));

  for (let i = 0; i < novos.length; i += LOTE_CRIACAO) {
    await db.envioCotacao.createMany({
      data: novos.slice(i, i + LOTE_CRIACAO).map((e) => {
        const dataEnvio = new Date(e.data);
        const { prazo, origem } = definirPrazo({
          prazo: e.prazo,
          prazoOrigem: e.prazoOrigem,
          dataEnvio,
        });
        return {
          gmailMensagemId: e.id,
          gmailFio: e.fio,
          dataEnvio,
          prazo,
          prazoOrigem: origem,
          numeroProcessoAssunto: e.processo,
          processoId: ligarProcesso(e.processo, anoEmSantos(dataEnvio), processos),
          totalDestinatarios: new Set(e.destinatarios.map(minusculo)).size,
        };
      }),
      skipDuplicates: true,
    });
  }

  let enviosDb = await db.envioCotacao.findMany({
    where: { gmailMensagemId: { in: idsGmail } },
    select: {
      id: true,
      gmailMensagemId: true,
      dataEnvio: true,
      processoId: true,
      numeroProcessoAssunto: true,
    },
  });

  // Q51 — envio que esperava o processo se liga sozinho quando a planilha é sincronizada.
  for (const e of enviosDb.filter((x) => x.processoId === null && x.numeroProcessoAssunto)) {
    const processoId = ligarProcesso(e.numeroProcessoAssunto, anoEmSantos(e.dataEnvio), processos);
    if (!processoId) continue;
    // Guarda atômica: só liga se ainda estiver sem processo.
    await db.envioCotacao.updateMany({
      where: { id: e.id, processoId: null },
      data: { processoId },
    });
    e.processoId = processoId;
  }

  if (opcoes.processoId) {
    enviosDb = enviosDb.filter((e) => e.processoId === opcoes.processoId);
  }
  const envioPorGmail = new Map(enviosDb.map((e) => [e.gmailMensagemId, e]));
  const enviosEscopo = payload.envios.filter((e) => envioPorGmail.has(e.id));

  // ── 2. Consultas (um registro por fornecedor consultado) ────────────────
  const idsEscopo = enviosEscopo.map((e) => envioPorGmail.get(e.id)!.id);
  const contagens = await db.consultaCotacao.groupBy({
    by: ["envioId"],
    where: { envioId: { in: idsEscopo } },
    _count: { _all: true },
  });
  const jaTem = new Map(contagens.map((c) => [c.envioId, c._count._all]));

  const incompletos = enviosEscopo.filter((e) => {
    const distintos = new Set(e.destinatarios.map(minusculo)).size;
    return (jaTem.get(envioPorGmail.get(e.id)!.id) ?? 0) < distintos;
  });

  let consultasNovas = 0;
  if (incompletos.length > 0) {
    const emails = incompletos.flatMap((e) => e.destinatarios.map(minusculo));
    const [candidatos, fornecedores] = await Promise.all([
      buscarCandidatosPorEmail(emails),
      db.fornecedor.findMany({ select: { id: true, email: true } }),
    ]);
    const fornecedorPorEmail = new Map(
      fornecedores.filter((f) => f.email).map((f) => [minusculo(f.email), f.id]),
    );

    const linhas = incompletos.flatMap((e) =>
      [...new Set(e.destinatarios.map(minusculo))].map((email) => {
        const c = candidatos.get(email);
        return {
          envioId: envioPorGmail.get(e.id)!.id,
          email,
          cnpj: c?.cnpj ?? null,
          razaoSocial: c?.razaoSocial ?? null,
          cnaeDescricao: c?.cnaeDescricao ?? null,
          fornecedorId: fornecedorPorEmail.get(email) ?? null,
        };
      }),
    );
    for (let i = 0; i < linhas.length; i += LOTE_CRIACAO) {
      const r = await db.consultaCotacao.createMany({
        data: linhas.slice(i, i + LOTE_CRIACAO),
        skipDuplicates: true,
      });
      consultasNovas += r.count;
    }
  }

  // ── 3. Respostas ────────────────────────────────────────────────────────
  const consultas = idsEscopo.length
    ? await db.consultaCotacao.findMany({
        where: { envioId: { in: idsEscopo } },
        select: { id: true, envioId: true, email: true },
      })
    : [];
  const consultaId = new Map(consultas.map((c) => [`${c.envioId}|${c.email}`, c.id]));
  const destinatariosPorEnvio = new Map(
    enviosEscopo.map((e) => [e.id, e.destinatarios.map(minusculo)]),
  );

  // Com a aplicação da IA ligada o PDF deixa de decidir sozinho (ver `classificarResposta`).
  const iaAplica = aplicacaoIaLigada();
  const desfechos = new Map<string, DesfechoConsulta>();
  const pendentes: Array<{
    gmailMensagemId: string;
    envioId: string;
    dataResposta: Date;
    remetenteDominio: string;
    sugestaoConsultaId: string | null;
    motivo: string;
    temAnexoOrcamento: boolean;
    contemRecusa: boolean;
    contemValor: boolean;
  }> = [];
  const devolvidos: Array<{ envioId: string; email: string; data: Date; mensagem: string }> = [];
  const paraIa: ItemParaIa[] = [];
  let respostasClassificadas = 0;

  const ordenadas = [...payload.respostas].sort((a, b) => a.data.localeCompare(b.data));
  for (const r of ordenadas) {
    const envio = r.envioId ? envioPorGmail.get(r.envioId) : undefined;
    if (!r.envioId || !envio) continue;
    const data = new Date(r.data);
    const resultado = classificarResposta(r, { pdfDecideSozinho: !iaAplica });

    if (resultado.acao === "ignorar") continue;
    if (resultado.acao === "devolucao") {
      for (const endereco of r.enderecosDevolvidos) {
        devolvidos.push({ envioId: envio.id, email: minusculo(endereco), data, mensagem: r.id });
      }
      continue;
    }

    const ligacao = ligarRemetente(r.remetente, destinatariosPorEnvio.get(r.envioId) ?? []);
    const consulta =
      ligacao.tipo === "fila" ? undefined : consultaId.get(`${envio.id}|${ligacao.email}`);

    let situacao: SituacaoAplicada | null = null;
    let regra = "";
    let motivoFila: string | null = null;

    if (resultado.acao === "aplicar" && consulta) {
      situacao = resultado.situacao;
      regra = ligacao.tipo === "dominio" ? `${resultado.regra}_dominio` : resultado.regra;
    } else {
      motivoFila = ligacao.tipo === "fila" ? ligacao.motivo : resultado.acao === "fila" ? resultado.motivo : "remetente_desconhecido";
      if (consulta) {
        situacao = "a_confirmar";
        regra = motivoFila;
      }
    }

    if (r.trecho) {
      paraIa.push({
        id: r.id,
        trecho: r.trecho,
        contexto: r.contexto,
        anexosPdf: r.anexosPdf,
        anexosOutros: r.anexosOutros,
        consultaId: consulta ?? null,
        regra: motivoFila !== null ? `fila:${motivoFila}` : `aplicar:${situacao}`,
        contemRecusa: r.contemRecusa,
        dataResposta: data,
      });
    }

    if (motivoFila !== null) {
      pendentes.push({
        gmailMensagemId: r.id,
        envioId: envio.id,
        dataResposta: data,
        // Só o DOMÍNIO — nunca o endereço completo (Q28).
        remetenteDominio: dominioDe(r.remetente),
        sugestaoConsultaId: consulta ?? null,
        motivo: motivoFila,
        temAnexoOrcamento: r.temAnexoOrcamento,
        contemRecusa: r.contemRecusa,
        contemValor: r.contemValor,
      });
    } else {
      respostasClassificadas += 1;
    }

    if (situacao && consulta && ligacao.tipo !== "fila") {
      const chave = `${envio.id}|${ligacao.email}`;
      const d = desfechos.get(chave) ?? {
        envioId: envio.id,
        email: ligacao.email,
        situacoes: new Set(),
        regras: new Map(),
        mensagens: new Map(),
        primeiraData: data,
      };
      d.situacoes.add(situacao);
      if (!d.regras.has(situacao)) {
        d.regras.set(situacao, regra);
        d.mensagens.set(situacao, r.id);
      }
      desfechos.set(chave, d);
    }
  }

  // ── 4. Gravação ─────────────────────────────────────────────────────────
  if (pendentes.length > 0) {
    await db.respostaEmailPendente.createMany({ data: pendentes, skipDuplicates: true });

    // Pendente que já existia como "sem sinal claro" e agora tem recusa provável é reagrupada.
    // Guarda atômica (CLAUDE.md §9.14): só vira se ainda não foi resolvida nem reclassificada.
    for (const motivo of ["provavel_recusa", "provavel_orcamento", "provavel_duvida"] as const) {
      const reagrupar = pendentes.filter((p) => p.motivo === motivo).map((p) => p.gmailMensagemId);
      if (reagrupar.length > 0) {
        await db.respostaEmailPendente.updateMany({
          where: { gmailMensagemId: { in: reagrupar }, motivo: "sinais_ambiguos", resolvidaEm: null },
          data: { motivo },
        });
      }
    }
  }

  // Quanto da função já foi gasto (leitura do Google + banco) define quanto a IA pode usar. Sem
  // `inicioEm` (chamador que não mede), vale o prazo fixo.
  const gasto = opcoes.inicioEm === undefined ? 0 : Date.now() - opcoes.inicioEm;
  const prazoIa = Math.min(PRAZO_IA_MS, LIMITE_FUNCAO_MS - gasto - RESERVA_LOTE_IA_MS);
  const aprovadas = await classificarEmSombra(
    paraIa,
    new Set(pendentes.filter((p) => MOTIVOS_PARA_IA.includes(p.motivo)).map((p) => p.gmailMensagemId)),
    prazoIa,
  );

  const finais = [...desfechos.values()].map((d) => ({ d, ...desfechoFinal(d) }));
  if (finais.length > 0) {
    await aplicarEmLote(
      finais.map((f) => ({
        envioId: f.d.envioId,
        email: f.d.email,
        situacao: f.situacao,
        regra: f.regra,
        primeiraData: f.d.primeiraData,
        mensagem: f.mensagem,
      })),
    );
  }

  let emailsInvalidos = 0;
  if (devolvidos.length > 0) {
    const r = await db.emailInvalido.createMany({
      data: devolvidos.map((x) => ({
        email: x.email,
        primeiraDevolucao: x.data,
        gmailMensagemId: x.mensagem,
      })),
      skipDuplicates: true,
    });
    emailsInvalidos = r.count;
    await marcarDevolvidos(devolvidos);
  }

  // APLICAÇÃO DA IA — só com a chave ligada e com um usuário a quem atribuir a ação (auditoria).
  // Roda DEPOIS de as regras gravarem as consultas: a "situação anterior" que o desfazer restaura
  // é a que ficou depois delas.
  let aplicadasPelaIa = 0;
  if (iaAplica && opcoes.userId && aprovadas.length > 0) {
    const userId = opcoes.userId;
    for (let i = 0; i < aprovadas.length; i += 5) {
      const resultados = await Promise.all(
        aprovadas.slice(i, i + 5).map(async (a) => {
          const r = await aplicarClassificacaoIa({
            gmailMensagemId: a.id,
            classe: a.classe,
            consultaId: a.consultaId,
            dataResposta: a.dataResposta,
          });
          return { a, r };
        }),
      );
      const feitas = resultados.filter((x) => x.r === "aplicada");
      aplicadasPelaIa += feitas.length;
      if (feitas.length > 0) {
        await db.auditLog.createMany({
          data: feitas.map(({ a }) => ({
            userId,
            acao: "ia_aplicar_resposta_email",
            // Só ids e a classe — nenhum endereço nem texto.
            detalhes: { gmailMensagemId: a.id, consultaId: a.consultaId, classe: a.classe },
          })),
        });
      }
    }
  }

  const enviosSemProcesso = await db.envioCotacao.count({ where: { processoId: null } });

  return {
    envios: enviosEscopo.length,
    enviosNovos: novos.length,
    consultasNovas,
    respostasClassificadas,
    respostasNaFila: pendentes.length,
    emailsInvalidos,
    enviosSemProcesso,
    aplicadasPelaIa,
  };
}

/**
 * MODO SOMBRA (M30.d): a IA lê cada resposta, com a conversa anterior, e o veredito é gravado ao
 * lado do que as regras decidiram — sem alterar consulta nem dashboard. Serve para medir a IA contra
 * as regras antes de ela decidir qualquer coisa. Só o veredito (classe, confiança, frase curta) é
 * gravado; o texto nunca. Nunca derruba a leitura: qualquer falha deixa tudo como estava.
 *
 * Além disso, a resposta que está ABERTA na fila ganha a sugestão "IA sugere" (só com confiança
 * média ou alta), com guarda atômica (§9.14): resposta já resolvida nunca é alterada.
 */
async function classificarEmSombra(
  itens: ItemParaIa[],
  naFila: Set<string>,
  prazoMs: number,
): Promise<Aprovada[]> {
  try {
    // Sem tempo para um lote inteiro: as respostas ficam para a leitura seguinte, não são perdidas.
    if (itens.length === 0 || prazoMs <= 0) return [];
    const inicio = Date.now();
    const feitas = await db.classificacaoIaResposta.findMany({
      where: { gmailMensagemId: { in: itens.map((i) => i.id) } },
      select: { gmailMensagemId: true, criterioRazao: true },
    });
    const jaFeitas = new Set(feitas.map((f) => f.gmailMensagemId));
    // Linha gravada SEM a segunda leitura (faltou tempo): o texto não é guardado, então só esta
    // leitura, que o traz de novo, pode completá-la. Sem isto ela ficaria sem revisão para sempre.
    const semRevisao = new Set(feitas.filter((f) => f.criterioRazao === "sem_revisao").map((f) => f.gmailMensagemId));
    const alvo = itens.filter((i) => !jaFeitas.has(i.id) || semRevisao.has(i.id)).slice(0, MAX_IA_POR_LEITURA);
    if (alvo.length === 0) return [];

    const { vereditos } = await classificarComIa(alvo, { prazoMs });
    if (vereditos.length === 0) return [];
    const porId = new Map(alvo.map((a) => [a.id, a]));

    // SEGUNDA leitura, por outro modelo que não viu a primeira, só do que está na fila (é onde a
    // decisão importa). Usa o que sobrou do prazo; sem tempo, o critério simplesmente não aprova.
    const paraRevisar = vereditos.filter((v) => naFila.has(v.id)).map((v) => porId.get(v.id)!);
    const sobra = prazoMs - (Date.now() - inicio);
    const segundas = new Map<string, Awaited<ReturnType<typeof classificarComIa>>["vereditos"][number]>();
    if (paraRevisar.length > 0 && sobra > 0) {
      const rev = await classificarComIa(paraRevisar, { prazoMs: sobra, modelo: MODELO_REVISOR, revisor: true });
      for (const v of rev.vereditos) segundas.set(v.id, v);
    }

    const linhas = vereditos.map((v) => {
      const item = porId.get(v.id)!;
      const segunda = segundas.get(v.id);
      // O critério só vale para o que está na fila. O que as regras já aplicaram não passa por ele.
      const criterio = naFila.has(v.id)
        ? avaliarCriterioIa({
            primeira: { classe: v.classe, confianca: v.confianca, evidenciaOk: v.evidenciaOk },
            segunda: segunda ? { classe: segunda.classe, evidenciaOk: segunda.evidenciaOk } : undefined,
            anexosPdf: item.anexosPdf ?? 0,
            // O envio pode ser provado por qualquer das duas citações.
            evidenciaDizEnvio: v.evidenciaDizEnvio || (segunda?.evidenciaDizEnvio ?? false),
            motivoFila: item.regra.startsWith("fila:") ? item.regra.slice("fila:".length) : "",
            contemRecusa: item.contemRecusa,
          })
        : null;
      return {
        gmailMensagemId: v.id,
        consultaId: item.consultaId,
        classeIa: v.classe,
        confianca: v.confianca,
        justificativa: v.justificativa,
        regra: item.regra,
        segundaClasse: segunda?.classe ?? null,
        evidenciaOk: v.evidenciaOk && (segunda?.evidenciaOk ?? false),
        criterioOk: criterio?.ok ?? false,
        criterioRazao: criterio?.razao ?? null,
      };
    });

    const novas = linhas.filter((l) => !semRevisao.has(l.gmailMensagemId));
    const refeitas = linhas.filter((l) => semRevisao.has(l.gmailMensagemId));
    if (novas.length > 0) await db.classificacaoIaResposta.createMany({ data: novas, skipDuplicates: true });
    // Completa a linha que ficou sem revisão. Guarda: só se ela ainda está sem revisão (§9.14).
    for (let i = 0; i < refeitas.length; i += 10) {
      await Promise.all(
        refeitas.slice(i, i + 10).map((l) =>
          db.classificacaoIaResposta.updateMany({
            where: { gmailMensagemId: l.gmailMensagemId, criterioRazao: "sem_revisao" },
            data: l,
          }),
        ),
      );
    }

    const sugestoes = vereditos.filter((v) => v.confianca !== "baixa" && naFila.has(v.id));
    // Em blocos paralelos: até 120 updates em fila, um a um, somavam segundos de uma função de 60 s.
    for (let i = 0; i < sugestoes.length; i += 10) {
      await Promise.all(
        sugestoes.slice(i, i + 10).map((v) =>
          db.respostaEmailPendente.updateMany({
            // Substitui a sugestão antiga (feita sem a conversa do fio) pela nova: este veredito só
            // roda para quem ainda não tem linha em sombra. Guarda atômica: resposta já resolvida não muda.
            where: { gmailMensagemId: v.id, resolvidaEm: null },
            data: { sugestaoIa: v.classe, justificativaIa: v.justificativa },
          }),
        ),
      );
    }

    // O que o critério aprovou — quem decide se aplica é o chamador, e só com a chave ligada.
    return linhas.flatMap((l) => {
      const item = porId.get(l.gmailMensagemId);
      return l.criterioOk && item?.consultaId
        ? [{ id: l.gmailMensagemId, classe: l.classeIa as ClasseResposta, consultaId: item.consultaId, dataResposta: item.dataResposta }]
        : [];
    });
  } catch {
    // Sem log: a mensagem de erro de SDK/banco pode carregar o corpo da requisição (o texto).
    return [];
  }
}

interface LinhaAplicar {
  envioId: string;
  email: string;
  situacao: SituacaoAplicada;
  regra: string;
  primeiraData: Date;
  mensagem: string;
}

/**
 * UPDATE em lote com guarda atômica no WHERE (§9.14), uma linha por consulta (a redução foi feita
 * em memória: um UPDATE ... FROM com duas linhas para a mesma consulta escolheria uma ao acaso).
 *
 * Passo 1: quem ainda estava `sem_resposta` recebe situação, data (a PRIMEIRA resposta) e regra.
 * Passo 2: quem estava `a_confirmar` (ou só com `duvida`: perguntar não encerra a consulta) e agora
 * tem classificação segura é promovido, sem mexer na data. Consulta que o analista já resolveu nunca é sobrescrita.
 */
async function aplicarEmLote(linhas: LinhaAplicar[]): Promise<void> {
  const envios = linhas.map((l) => l.envioId);
  const emails = linhas.map((l) => l.email);
  const situacoes = linhas.map((l) => l.situacao);
  const datas = linhas.map((l) => l.primeiraData.toISOString());
  const mensagens = linhas.map((l) => l.mensagem);
  const regras = linhas.map((l) => l.regra);

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = v.situacao::"SituacaoConsulta",
        "dataResposta" = v.data::timestamp,
        "gmailRespostaId" = v.mensagem,
        "regra" = v.regra,
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${situacoes}::text[], ${datas}::text[],
                ${mensagens}::text[], ${regras}::text[])
         AS v(envio, email, situacao, data, mensagem, regra)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" = 'sem_resposta'`;

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = v.situacao::"SituacaoConsulta",
        "gmailRespostaId" = v.mensagem,
        "regra" = v.regra,
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${situacoes}::text[],
                ${mensagens}::text[], ${regras}::text[])
         AS v(envio, email, situacao, mensagem, regra)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" IN ('a_confirmar', 'duvida')
      AND v.situacao IN ('orcamento', 'recusa')`;
}

async function marcarDevolvidos(
  devolvidos: Array<{ envioId: string; email: string; data: Date; mensagem: string }>,
): Promise<void> {
  const envios = devolvidos.map((d) => d.envioId);
  const emails = devolvidos.map((d) => d.email);
  const datas = devolvidos.map((d) => d.data.toISOString());
  const mensagens = devolvidos.map((d) => d.mensagem);

  await db.$executeRaw`
    UPDATE "consultas_cotacao" AS c
    SET "situacao" = 'email_invalido',
        "dataResposta" = v.data::timestamp,
        "gmailRespostaId" = v.mensagem,
        "regra" = 'devolucao',
        "updatedAt" = now()
    FROM unnest(${envios}::text[], ${emails}::text[], ${datas}::text[], ${mensagens}::text[])
         AS v(envio, email, data, mensagem)
    WHERE c."envioId" = v.envio AND c."email" = v.email AND c."situacao" = 'sem_resposta'`;
}

export type { RespostaScript };
