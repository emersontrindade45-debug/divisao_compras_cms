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
    emailInvalido: { createMany: vi.fn() },
    $executeRaw: vi.fn(),
  },
  buscarCandidatosPorEmail: vi.fn(),
  classificarComIa: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("../classificarComIa", () => ({ classificarComIa: mocks.classificarComIa }));
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

  describe("IA sobre o trecho anonimizado", () => {
    const TRECHO = "TRECHO-MARCADOR não conseguiremos atender";

    it("manda à IA só o que ainda não tem sugestão e grava veredito + frase, com guarda atômica", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }]);
      mocks.classificarComIa.mockResolvedValue({
        vereditos: [{ id: "m1", classe: "recusa", justificativa: "diz que não atende" }],
        lotesComFalha: 0,
      });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });

      expect(mocks.db.respostaEmailPendente.findMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: { in: ["m1"] }, sugestaoIa: null, resolvidaEm: null },
        select: { gmailMensagemId: true },
      });
      expect(mocks.classificarComIa).toHaveBeenCalledWith([{ id: "m1", trecho: TRECHO }]);
      expect(mocks.db.respostaEmailPendente.updateMany).toHaveBeenCalledWith({
        where: { gmailMensagemId: "m1", sugestaoIa: null, resolvidaEm: null },
        data: { sugestaoIa: "recusa", justificativaIa: "diz que não atende" },
      });
    });

    it("o trecho nunca é gravado: nenhuma escrita no banco o contém", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }]);
      mocks.classificarComIa.mockResolvedValue({
        vereditos: [{ id: "m1", classe: "recusa", justificativa: "ok" }],
        lotesComFalha: 0,
      });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      const escritas = [
        ...mocks.db.respostaEmailPendente.createMany.mock.calls,
        ...mocks.db.respostaEmailPendente.updateMany.mock.calls,
        ...mocks.db.consultaCotacao.createMany.mock.calls,
        ...mocks.db.$executeRaw.mock.calls,
      ];
      expect(JSON.stringify(escritas)).not.toContain("TRECHO-MARCADOR");
    });

    it("sem trecho (script antigo) não chama a IA", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta()] });
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
    });

    it("resposta que as regras já decidiram (não vai à fila) não é enviada à IA", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ contemRecusa: true, trecho: TRECHO })],
      });
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
    });

    it("remetente que não se liga a nenhum fornecedor (fila por outro motivo) não vai à IA", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      // O banco TEM a mensagem aberta e sem sugestão: só o filtro por motivo a impede de ir à IA.
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }]);
      const r = await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: [resposta({ remetente: "estranho@desconhecido.com.br", remetenteEraDestinatario: false, trecho: TRECHO })],
      });
      expect(mocks.db.respostaEmailPendente.createMany.mock.calls[0]![0].data[0].motivo).toMatch(/^(remetente_desconhecido|dominio_)/);
      expect(r.respostasNaFila).toBe(1);
      expect(mocks.classificarComIa).not.toHaveBeenCalled();
    });

    it("falha da IA não derruba a leitura nem a fila", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue([{ gmailMensagemId: "m1" }]);
      mocks.classificarComIa.mockRejectedValue(new Error("boom"));
      const r = await sincronizarRespostasEmail({ envios: [envio()], respostas: [resposta({ trecho: TRECHO })] });
      expect(r.respostasNaFila).toBe(1);
    });

    it("respeita o teto por leitura", async () => {
      armar({ existentes: ["g1"], jaTem: 3 });
      const muitas = Array.from({ length: 60 }, (_, i) => ({ gmailMensagemId: `m${i}` }));
      mocks.db.respostaEmailPendente.findMany.mockResolvedValue(muitas);
      await sincronizarRespostasEmail({
        envios: [envio()],
        respostas: muitas.map((m) => resposta({ id: m.gmailMensagemId, trecho: "x" })),
      });
      expect(mocks.classificarComIa.mock.calls[0]![0]).toHaveLength(48);
    });
  });
});
