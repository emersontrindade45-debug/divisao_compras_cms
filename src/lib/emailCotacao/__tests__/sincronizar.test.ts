import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    processo: { findMany: vi.fn() },
    envioCotacao: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    consultaCotacao: { groupBy: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    fornecedor: { findMany: vi.fn() },
    respostaEmailPendente: { createMany: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    classificacaoIaResposta: { findMany: vi.fn(), createMany: vi.fn() },
    emailInvalido: { createMany: vi.fn() },
    $executeRaw: vi.fn(),
  },
  buscarCandidatosPorEmail: vi.fn(),
  classificarComIa: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("../classificarComIa", () => ({ classificarComIa: mocks.classificarComIa, MODELO_REVISOR: "modelo-revisor" }));
vi.mock("../candidatos", () => ({ buscarCandidatosPorEmail: mocks.buscarCandidatosPorEmail }));

import { sincronizarRespostasEmail } from "../sincronizar";
import type { EnvioScript, RespostaScript } from "../payload";

const DEST = ["vendas@acme.com.br", "comercial@beta.com.br", "contato.gama@gmail.com"];

function envio(over: Partial<EnvioScript> = {}): EnvioScript {
  return {
    id: "g1",
    fio: "f1",
    data: "2026-11-16T15:00:00.000Z",
    destinatarios: DEST,
    processo: "382",
    prazo: null,
    prazoOrigem: null,
    ...over,
  };
}

function resposta(over: Partial<RespostaScript> = {}): RespostaScript {
  return {
    id: "m1",
    fio: "f1",
    envioId: "g1",
    data: "2026-11-17T10:00:00.000Z",
    remetente: "vendas@acme.com.br",
    processo: "382",
    remetenteEraDestinatario: true,
    devolucao: false,
    enderecosDevolvidos: [],
    automatica: false,
    temAnexoOrcamento: false,
    contemRecusa: false,
    contemValor: false,
    ...over,
  };
}

const ENVIO_DB = {
  id: "E1",
  gmailMensagemId: "g1",
  dataEnvio: new Date("2026-11-16T15:00:00.000Z"),
  processoId: "p382",
  numeroProcessoAssunto: "382",
};
const CONSULTAS = DEST.map((email, i) => ({ id: `c${i}`, envioId: "E1", email }));

function armar(o: { existentes?: string[]; enviosDb?: unknown[]; jaTem?: number } = {}) {
  mocks.db.envioCotacao.findMany
    .mockResolvedValueOnce((o.existentes ?? []).map((id) => ({ gmailMensagemId: id })))
    .mockResolvedValueOnce(o.enviosDb ?? [ENVIO_DB]);
  mocks.db.consultaCotacao.groupBy.mockResolvedValue(
    o.jaTem ? [{ envioId: "E1", _count: { _all: o.jaTem } }] : [],
  );
}

/** Valores passados ao $executeRaw da chamada n (sem o array de strings do template). */
function valoresRaw(chamada: number): unknown[][] {
  return mocks.db.$executeRaw.mock.calls[chamada]!.slice(1) as unknown[][];
}
function sqlRaw(chamada: number): string {
  return (mocks.db.$executeRaw.mock.calls[chamada]![0] as string[]).join("?");
}

describe("sincronizarRespostasEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.processo.findMany.mockResolvedValue([{ id: "p382", numero: "0382/2026" }]);
    mocks.db.envioCotacao.createMany.mockResolvedValue({ count: 1 });
    mocks.db.envioCotacao.count.mockResolvedValue(0);
    mocks.db.consultaCotacao.createMany.mockResolvedValue({ count: 3 });
    mocks.db.consultaCotacao.findMany.mockResolvedValue(CONSULTAS);
    mocks.db.fornecedor.findMany.mockResolvedValue([]);
    mocks.db.respostaEmailPendente.createMany.mockResolvedValue({ count: 0 });
    mocks.db.respostaEmailPendente.findMany.mockResolvedValue([]);
    mocks.classificarComIa.mockResolvedValue({ vereditos: [], lotesComFalha: 0 });
    mocks.db.emailInvalido.createMany.mockResolvedValue({ count: 0 });
    mocks.db.$executeRaw.mockResolvedValue(0);
    mocks.buscarCandidatosPorEmail.mockResolvedValue(new Map());
  });

  describe("envios", () => {
    it("cria o envio com prazo padrão de 5 dias úteis e liga ao processo pelo número", async () => {
      armar();
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });

      const arg = mocks.db.envioCotacao.createMany.mock.calls[0]![0];
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data[0]).toMatchObject({
        gmailMensagemId: "g1",
        numeroProcessoAssunto: "382",
        processoId: "p382",
        prazoOrigem: "padrao",
        totalDestinatarios: 3,
      });
      expect(arg.data[0].prazo.toISOString().slice(0, 10)).toBe("2026-11-23");
    });

    it("mantém o prazo escrito no assunto", async () => {
      armar();
      await sincronizarRespostasEmail({
        envios: [envio({ prazo: "2026-11-30", prazoOrigem: "assunto" })],
        respostas: [],
      });
      const d = mocks.db.envioCotacao.createMany.mock.calls[0]![0].data[0];
      expect(d.prazoOrigem).toBe("assunto");
      expect(d.prazo.toISOString().slice(0, 10)).toBe("2026-11-30");
    });

    it("é idempotente: envio já gravado não é criado de novo", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      expect(mocks.db.envioCotacao.createMany).not.toHaveBeenCalled();
    });

    it("processo ainda não importado deixa o envio aguardando (processoId nulo)", async () => {
      mocks.db.processo.findMany.mockResolvedValue([]);
      armar({ enviosDb: [{ ...ENVIO_DB, processoId: null }] });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      expect(mocks.db.envioCotacao.createMany.mock.calls[0]![0].data[0].processoId).toBeNull();
    });

    it("liga sozinho um envio que esperava o processo, com guarda atômica", async () => {
      armar({ existentes: ["g1"], enviosDb: [{ ...ENVIO_DB, processoId: null }], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      expect(mocks.db.envioCotacao.updateMany).toHaveBeenCalledWith({
        where: { id: "E1", processoId: null },
        data: { processoId: "p382" },
      });
    });
  });

  describe("consultas", () => {
    it("cria uma consulta por destinatário distinto, com os dados da base da Receita", async () => {
      armar();
      mocks.buscarCandidatosPorEmail.mockResolvedValue(
        new Map([
          ["vendas@acme.com.br", { cnpj: "11222333000144", razaoSocial: "Acme", cnaeDescricao: "Limpeza" }],
          ["comercial@beta.com.br", { cnpj: null, razaoSocial: null, cnaeDescricao: null }],
        ]),
      );
      await sincronizarRespostasEmail({
        envios: [envio({ destinatarios: [...DEST, "VENDAS@acme.com.br"] })],
        respostas: [],
      });

      const arg = mocks.db.consultaCotacao.createMany.mock.calls[0]![0];
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data).toHaveLength(3);
      expect(arg.data.find((c: { email: string }) => c.email === "vendas@acme.com.br")).toMatchObject({
        cnpj: "11222333000144",
        razaoSocial: "Acme",
      });
      // E-mail compartilhado/sem dono: consulta sem CNPJ, nunca o de uma empresa escolhida a esmo.
      expect(arg.data.find((c: { email: string }) => c.email === "comercial@beta.com.br").cnpj).toBeNull();
    });

    it("liga ao Fornecedor do cadastro pelo e-mail, ignorando a caixa", async () => {
      armar();
      mocks.db.fornecedor.findMany.mockResolvedValue([{ id: "forn1", email: "Vendas@Acme.com.br" }]);
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      const arg = mocks.db.consultaCotacao.createMany.mock.calls[0]![0];
      expect(arg.data.find((c: { email: string }) => c.email === "vendas@acme.com.br").fornecedorId).toBe("forn1");
    });

    it("não consulta a base da Receita quando as consultas do envio já estão completas", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      expect(mocks.buscarCandidatosPorEmail).not.toHaveBeenCalled();
      expect(mocks.db.consultaCotacao.createMany).not.toHaveBeenCalled();
    });

    it("completa um envio com consultas faltando (criação interrompida antes)", async () => {
      armar({ existentes: ["g1"], jaTem: 1 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [] });
      expect(mocks.db.consultaCotacao.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("respostas", () => {
    it("anexo de remetente exato classifica como orçamento, só se ainda sem resposta", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      const r = await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ temAnexoOrcamento: true })],
      });

      expect(r.respostasClassificadas).toBe(1);
      expect(sqlRaw(0)).toContain(`"situacao" = 'sem_resposta'`);
      const [envios, emails, situacoes, , mensagens, regras] = valoresRaw(0);
      expect(envios).toEqual(["E1"]);
      expect(emails).toEqual(["vendas@acme.com.br"]);
      expect(situacoes).toEqual(["orcamento"]);
      expect(mensagens).toEqual(["m1"]);
      expect(regras).toEqual(["anexo_orcamento"]);
      expect(mocks.db.respostaEmailPendente.createMany).not.toHaveBeenCalled();
    });

    it("segundo passo só promove quem estava 'a_confirmar' (nunca sobrescreve resolvido)", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ temAnexoOrcamento: true })],
      });
      expect(sqlRaw(1)).toContain(`"situacao" IN ('a_confirmar', 'duvida')`);
      expect(sqlRaw(1)).toContain(`IN ('orcamento', 'recusa')`);
    });

    it("liga por domínio quando só um destinatário usa o domínio e marca a regra", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ remetente: "joao@acme.com.br", contemRecusa: true })],
      });
      const [, emails, situacoes, , , regras] = valoresRaw(0);
      expect(emails).toEqual(["vendas@acme.com.br"]);
      expect(situacoes).toEqual(["recusa"]);
      expect(regras).toEqual(["frase_recusa_dominio"]);
    });

    it("resposta sem sinal vai para a fila e a consulta fica 'a_confirmar'", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      const r = await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta()] });

      expect(r.respostasNaFila).toBe(1);
      expect(mocks.db.respostaEmailPendente.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        gmailMensagemId: "m1",
        remetenteDominio: "acme.com.br",
        sugestaoConsultaId: "c0",
        motivo: "sinais_ambiguos",
      });
      expect(valoresRaw(0)[2]).toEqual(["a_confirmar"]);
    });

    it("recusa provável entra na fila com motivo próprio e reagrupa o que já estava como 'sem sinal claro'", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ provavelRecusa: true })],
      });
      expect(mocks.db.respostaEmailPendente.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        gmailMensagemId: "m1",
        motivo: "provavel_recusa",
        sugestaoConsultaId: "c0",
      });
      // Guarda atômica: só reagrupa a que ainda é "sem sinal claro" e não foi resolvida.
      expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: { in: ["m1"] }, motivo: "sinais_ambiguos", resolvidaEm: null },
        data: { motivo: "provavel_recusa" },
      });
    });

    it.each([
      ["provavelOrcamento", "provavel_orcamento"],
      ["provavelDuvida", "provavel_duvida"],
    ] as const)("%s entra na fila com motivo próprio e reagrupa só o 'sem sinal claro' ainda não resolvido", async (campo, motivo) => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ [campo]: true })],
      });
      expect(mocks.db.respostaEmailPendente.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        gmailMensagemId: "m1",
        motivo,
        sugestaoConsultaId: "c0",
      });
      expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: { in: ["m1"] }, motivo: "sinais_ambiguos", resolvidaEm: null },
        data: { motivo },
      });
    });

    it("sem recusa provável, nada é reagrupado", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta()] });
      expect(mocks.db.respostaEmailPendente.updateMany).not.toHaveBeenCalled();
    });

    it("remetente de domínio genérico entra na fila sem consulta sugerida", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ remetente: "gama.orcamentos@gmail.com", temAnexoOrcamento: true })],
      });
      expect(mocks.db.respostaEmailPendente.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        remetenteDominio: "gmail.com",
        sugestaoConsultaId: null,
        motivo: "dominio_generico",
      });
      expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    });

    it("fornecedor que mandou mensagem ambígua e depois orçamento: uma linha só, com a mensagem da regra", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        // Fora de ordem de propósito: sem ordenar por data, a "primeira" resposta seria a m2.
        respostas: [
          resposta({ id: "m2", data: "2026-11-18T10:00:00.000Z", temAnexoOrcamento: true }),
          resposta({ id: "m1", data: "2026-11-17T10:00:00.000Z" }),
        ],
      });
      const v = valoresRaw(0);
      expect(v[0]).toEqual(["E1"]); // uma linha por consulta (UPDATE...FROM não é determinístico com duas)
      expect(v[2]).toEqual(["orcamento"]);
      expect(v[3]).toEqual(["2026-11-17T10:00:00.000Z"]); // data da PRIMEIRA resposta
      expect(v[4]).toEqual(["m2"]); // mensagem que gerou a regra
    });

    it("orçamento e recusa do mesmo fornecedor se contradizem: fica 'a_confirmar'", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [
          resposta({ id: "m1", data: "2026-11-17T10:00:00.000Z", temAnexoOrcamento: true }),
          resposta({ id: "m2", data: "2026-11-18T10:00:00.000Z", contemRecusa: true }),
        ],
      });
      const v = valoresRaw(0);
      expect(v[2]).toEqual(["a_confirmar"]);
      expect(v[5]).toEqual(["sinais_conflitantes"]);
    });

    it("resposta automática não altera nada", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ automatica: true, temAnexoOrcamento: true })],
      });
      expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.db.respostaEmailPendente.createMany).not.toHaveBeenCalled();
    });

    it("devolução registra o e-mail inválido e marca a consulta (só se sem resposta)", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      const r = await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [
          resposta({
            id: "bounce1",
            remetente: "mailer-daemon@googlemail.com",
            devolucao: true,
            enderecosDevolvidos: ["Comercial@Beta.com.br"],
          }),
        ],
      });

      const arg = mocks.db.emailInvalido.createMany.mock.calls[0]![0];
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data[0]).toMatchObject({ email: "comercial@beta.com.br", gmailMensagemId: "bounce1" });
      expect(sqlRaw(0)).toContain(`'email_invalido'`);
      expect(sqlRaw(0)).toContain(`"situacao" = 'sem_resposta'`);
      expect(valoresRaw(0)[1]).toEqual(["comercial@beta.com.br"]);
      expect(r.respostasClassificadas).toBe(0);
    });

    it("resposta de um fio sem envio conhecido é ignorada", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ envioId: null, temAnexoOrcamento: true })],
      });
      expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("escopo por processo (botão da página do processo)", () => {
    it("só considera os envios do processo pedido", async () => {
      const outro = { ...ENVIO_DB, id: "E2", gmailMensagemId: "g2", processoId: "p999" };
      armar({ existentes: ["g1", "g2"], enviosDb: [ENVIO_DB, outro], jaTem: 3 });
      mocks.db.consultaCotacao.groupBy.mockResolvedValue([
        { envioId: "E1", _count: { _all: 3 } },
      ]);
      const r = await sincronizarRespostasEmail(
        {
          envios: [envio(), envio({ id: "g2", processo: "999" })],
          respostas: [resposta({ envioId: "g2", temAnexoOrcamento: true })],
        },
        { processoId: "p382" },
      );
      expect(r.envios).toBe(1);
      expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("SIGILO — superfície (Q30)", () => {
    const MARCADOR = "MARCADOR_SIGILO_7f3a";
    let logs: ReturnType<typeof vi.spyOn>[];

    beforeEach(() => {
      logs = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
        vi.spyOn(console, m).mockImplementation(() => undefined),
      );
    });
    afterEach(() => vi.restoreAllMocks());

    it("o endereço completo do remetente não aparece em nenhuma gravação nem em log", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [
          resposta({
            id: "m-sigilo",
            remetente: `${MARCADOR}@dominio-x.com.br`,
            temAnexoOrcamento: true,
          }),
        ],
      });

      // Varre TODA chamada a TODO método do banco — não uma lista de métodos lembrados (§9.56).
      const chamadas = JSON.stringify([
        ...Object.values(mocks.db).flatMap((m) =>
          typeof m === "function" ? m.mock.calls : Object.values(m).flatMap((f) => f.mock.calls),
        ),
      ]);
      expect(chamadas).toContain("dominio-x.com.br"); // o domínio É guardado (Q28)
      expect(chamadas).not.toContain(MARCADOR); // a parte local do endereço, não
      for (const espiao of logs) expect(espiao).not.toHaveBeenCalled();
    });
  });

  describe("IA em modo sombra", () => {
    const TRECHO = "TRECHO-MARCADOR não conseguiremos atender";
    const CONTEXTO = [{ autor: "camara" as const, texto: "CONTEXTO-MARCADOR pergunta nossa" }];
    const veredito = (id: string, classe = "recusa", confianca = "alta") => ({
      id, classe, confianca, justificativa: "diz que não atende", evidenciaOk: true, evidenciaDizEnvio: false,
    });
    const ia = (vereditos: unknown[]) =>
      mocks.classificarComIa.mockResolvedValue({ vereditos, lotesComFalha: 0, lotesAdiados: 0 });

    beforeEach(() => {
      mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
      mocks.db.classificacaoIaResposta.createMany.mockResolvedValue({ count: 1 });
    });

    it("grava o veredito em sombra com a classe, a confiança, a consulta e o que as regras fizeram", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1")]);
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });

      expect(mocks.db.classificacaoIaResposta.createMany).toHaveBeenCalledWith({
        data: [{
          gmailMensagemId: "m1", consultaId: "c0", classeIa: "recusa", confianca: "alta",
          justificativa: "diz que não atende", regra: "fila:sinais_ambiguos",
          segundaClasse: "recusa", evidenciaOk: true, criterioOk: true, criterioRazao: "ok",
        }],
        skipDuplicates: true,
      });
    });

    it("classifica TAMBÉM a resposta que as regras já decidiram — é o que permite comparar", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1", "orcamento")]);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ temAnexoOrcamento: true, trecho: "segue em anexo" })],
      });
      expect(mocks.classificarComIa).toHaveBeenCalledTimes(1);
      expect(mocks.db.classificacaoIaResposta.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        gmailMensagemId: "m1", regra: "aplicar:orcamento",
      });
    });

    it("manda à IA o texto, a conversa anterior e a contagem de anexos", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([]);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ trecho: TRECHO, contexto: CONTEXTO, anexosPdf: 1, anexosOutros: 2 })],
      });
      expect(mocks.classificarComIa.mock.calls[0]![0]).toEqual([
        expect.objectContaining({ id: "m1", trecho: TRECHO, contexto: CONTEXTO, anexosPdf: 1, anexosOutros: 2 }),
      ]);
    });

    it("não reclassifica a resposta que já tem veredito em sombra (não paga duas vezes)", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }]);
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
    });

    it("nem o texto nem a conversa são gravados: nenhuma escrita no banco os contém", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1")]);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ trecho: TRECHO, contexto: CONTEXTO })],
      });
      const escritas = [
        ...mocks.db.respostaEmailPendente.createMany.mock.calls,
        ...mocks.db.respostaEmailPendente.updateMany.mock.calls,
        ...mocks.db.classificacaoIaResposta.createMany.mock.calls,
        ...mocks.db.consultaCotacao.createMany.mock.calls,
        ...mocks.db.$executeRaw.mock.calls,
      ];
      const dump = JSON.stringify(escritas);
      expect(dump).not.toContain("TRECHO-MARCADOR");
      expect(dump).not.toContain("CONTEXTO-MARCADOR");
    });

    it("resposta aberta na fila ganha a sugestão 'IA sugere', sem pisar em resposta resolvida", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1", "recusa", "media")]);
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: "m1", resolvidaEm: null },
        data: { sugestaoIa: "recusa", justificativaIa: "diz que não atende" },
      });
    });

    it("confiança baixa fica gravada em sombra mas NÃO vira sugestão na tela", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1", "recusa", "baixa")]);
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      expect(mocks.db.classificacaoIaResposta.createMany).toHaveBeenCalled();
      const sugestoes = mocks.db.respostaEmailPendente.updateMany.mock.calls.filter((c) => c[0].data.sugestaoIa !== undefined);
      expect(sugestoes).toHaveLength(0);
    });

    it("resposta que as regras decidiram (fora da fila) tem veredito em sombra e nenhuma sugestão na tela", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1", "orcamento")]);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ temAnexoOrcamento: true, trecho: "segue em anexo" })],
      });
      expect(mocks.db.classificacaoIaResposta.createMany).toHaveBeenCalled();
      const sugestoes = mocks.db.respostaEmailPendente.updateMany.mock.calls.filter((c) => c[0].data.sugestaoIa !== undefined);
      expect(sugestoes).toHaveLength(0);
    });

    it("remetente que não se liga a nenhum fornecedor: veredito em sombra sim, sugestão na tela não", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([veredito("m1")]);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ remetente: "estranho@desconhecido.com.br", remetenteEraDestinatario: false, trecho: TRECHO })],
      });
      expect(mocks.db.classificacaoIaResposta.createMany.mock.calls[0]![0].data[0].regra).toMatch(/^fila:(remetente_desconhecido|dominio_)/);
      const sugestoes = mocks.db.respostaEmailPendente.updateMany.mock.calls.filter((c) => c[0].data.sugestaoIa !== undefined);
      expect(sugestoes).toHaveLength(0);
    });

    it("sem texto (script antigo) não chama a IA", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta()] });
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
    });

    it("falha da IA não derruba a leitura nem a fila", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      mocks.classificarComIa.mockRejectedValue(new Error("boom"));
      const r = await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      expect(r.respostasNaFila).toBe(1);
    });

    it("o prazo da IA é o que sobra dos 60 s da função depois da leitura do Google", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([]);
      // 30 s já gastos: 55 s de limite − 30 s − 10 s de reserva de lote = 15 s para a IA.
      await sincronizarRespostasEmail(
        { envios: [envio()], respostas: [resposta({ trecho: TRECHO })] },
        { inicioEm: Date.now() - 30_000 },
      );
      const prazo = (mocks.classificarComIa.mock.calls[0]![1] as { prazoMs: number }).prazoMs;
      expect(prazo).toBeGreaterThan(14_000);
      expect(prazo).toBeLessThanOrEqual(15_000);
    });

    it("sem tempo para um lote inteiro, a IA nem é chamada e as respostas ficam para a leitura seguinte", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      // 48 s gastos: 55 − 48 − 10 < 0.
      const r = await sincronizarRespostasEmail(
        { envios: [envio()], respostas: [resposta({ trecho: TRECHO })] },
        { inicioEm: Date.now() - 48_000 },
      );
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
      expect(r.respostasNaFila).toBe(1);
      expect(mocks.db.classificacaoIaResposta.createMany).not.toHaveBeenCalled();
    });

    it("respeita o teto por leitura e o prazo de tempo", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      ia([]);
      const muitas = Array.from({ length: 150 }, (_, i) => resposta({ id: `m${i}`, trecho: "x" }));
      await sincronizarRespostasEmail({ envios: [envio()], respostas: muitas });
      expect(mocks.classificarComIa.mock.calls[0]![0]).toHaveLength(120);
      expect(mocks.classificarComIa.mock.calls[0]![1]).toEqual({ prazoMs: 26_000 });
    });

    describe("critério de aplicação sozinha (modo sombra: só grava, nunca aplica)", () => {
      const gravado = () => mocks.db.classificacaoIaResposta.createMany.mock.calls[0]![0].data[0];

      it("a segunda leitura usa o modelo revisor e roda só para o que está na fila", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1")]);
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        expect(mocks.classificarComIa).toHaveBeenCalledTimes(2);
        expect(mocks.classificarComIa.mock.calls[1]![1]).toMatchObject({ modelo: "modelo-revisor", revisor: true });
      });

      it("o que as regras já decidiram (fora da fila) não é revisado nem passa pelo critério", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1", "orcamento")]);
        await sincronizarRespostasEmail({
          envios: [envio()],
          respostas: [resposta({ temAnexoOrcamento: true, trecho: "segue em anexo" })],
        });
        expect(mocks.classificarComIa).toHaveBeenCalledTimes(1);
        expect(gravado()).toMatchObject({ criterioOk: false, criterioRazao: null, segundaClasse: null });
      });

      it("revisor que discorda reprova o critério e a razão fica gravada", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        mocks.classificarComIa
          .mockResolvedValueOnce({ vereditos: [veredito("m1", "recusa")], lotesComFalha: 0, lotesAdiados: 0 })
          .mockResolvedValueOnce({ vereditos: [veredito("m1", "duvida")], lotesComFalha: 0, lotesAdiados: 0 });
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        expect(gravado()).toMatchObject({ segundaClasse: "duvida", criterioOk: false, criterioRazao: "revisor_discorda" });
      });

      it("sem tempo para a revisão, o critério não aprova (e a primeira leitura não se perde)", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        mocks.classificarComIa.mockResolvedValueOnce({ vereditos: [veredito("m1")], lotesComFalha: 0, lotesAdiados: 0 });
        vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(40_000);
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        expect(mocks.classificarComIa).toHaveBeenCalledTimes(1);
        expect(gravado()).toMatchObject({ criterioOk: false, criterioRazao: "sem_revisao", classeIa: "recusa" });
      });

      it("trecho citado que não existe no texto reprova, mesmo com as duas leituras iguais", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        mocks.classificarComIa.mockResolvedValue({
          vereditos: [{ ...veredito("m1"), evidenciaOk: false }],
          lotesComFalha: 0,
          lotesAdiados: 0,
        });
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        expect(gravado()).toMatchObject({ evidenciaOk: false, criterioOk: false, criterioRazao: "sem_evidencia" });
      });

      it("a IA contradizendo a regra de palavras (provável recusa) reprova: vai ao analista", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1", "nao_e_resposta")]);
        await sincronizarRespostasEmail({
          envios: [envio()],
          respostas: [resposta({ provavelRecusa: true, trecho: TRECHO })],
        });
        expect(gravado()).toMatchObject({ criterioOk: false, criterioRazao: "regra_discorda" });
      });

      it("orçamento sem PDF e sem o trecho dizer que envia: reprova; com PDF: aprova", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1", "orcamento")]);
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        expect(gravado()).toMatchObject({ criterioOk: false, criterioRazao: "orcamento_sem_prova" });

        vi.clearAllMocks();
        mocks.db.classificacaoIaResposta.findMany.mockResolvedValue([]);
        mocks.db.classificacaoIaResposta.createMany.mockResolvedValue({ count: 1 });
        mocks.db.respostaEmailPendente.createMany.mockResolvedValue({ count: 0 });
        mocks.db.processo.findMany.mockResolvedValue([{ id: "p382", numero: "0382/2026" }]);
        mocks.db.envioCotacao.count.mockResolvedValue(0);
        mocks.db.consultaCotacao.findMany.mockResolvedValue(CONSULTAS);
        mocks.db.fornecedor.findMany.mockResolvedValue([]);
        mocks.db.emailInvalido.createMany.mockResolvedValue({ count: 0 });
        mocks.db.$executeRaw.mockResolvedValue(0);
        mocks.buscarCandidatosPorEmail.mockResolvedValue(new Map());
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1", "orcamento")]);
        await sincronizarRespostasEmail({
          envios: [envio()],
          respostas: [resposta({ trecho: TRECHO, anexosPdf: 1 })],
        });
        expect(gravado()).toMatchObject({ criterioOk: true, criterioRazao: "ok" });
      });

      it("NUNCA aplica: nenhuma escrita em consulta por causa do veredito da IA (modo sombra)", async () => {
        armar({ existentes: ["g1"], jaTem: 3 });
        ia([veredito("m1", "recusa")]);
        await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
        // Os VALORES passados ao SQL: a consulta fica "a_confirmar" (decisão das regras), nunca "recusa".
        const valores = mocks.db.$executeRaw.mock.calls.flatMap((c) => (c.slice(1) as unknown[]).flat());
        expect(valores).toContain("a_confirmar");
        expect(valores).not.toContain("recusa");
        expect(mocks.db.respostaEmailPendente.updateMany.mock.calls.every((c) => c[0].data.resolvidaEm === undefined)).toBe(true);
      });
    });
  });
});
