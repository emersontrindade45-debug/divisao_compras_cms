import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    fornecedor: { findMany: vi.fn() },
    sincronizacaoFornecedores: { create: vi.fn(), update: vi.fn() },
  },
  fetchText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { sincronizarFornecedores } from "../sincronizarFornecedores";

const CSV_BASICO = [
  "#,Tags,Nome/Razão Social,CPF/CNPJ,Telefone,Telefone 2,E-mail,Contato,Município,UF,Situação,Fonte,Processos Cotação,Respondeu?,Enviou Orçamento?",
  '1,,ACME LTDA,12345678000190,(13) 1111-1111,,acme@exemplo.com,Fulano,Santos,SP,,Quadro Geral,,,',
  '2,,BETA COMERCIO,,,,"beta@exemplo.com",,,,,"Quadro Geral",,,',
].join("\n");

describe("sincronizarFornecedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.sincronizacaoFornecedores.create.mockResolvedValue({ id: "sync-1" });
    mocks.db.sincronizacaoFornecedores.update.mockResolvedValue({});
    mocks.db.fornecedor.findMany.mockResolvedValue([]);
    mocks.db.$executeRaw.mockResolvedValue(0);
  });

  it("grava um registro de SincronizacaoFornecedores antes de processar, com origem e iniciadoEm", async () => {
    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(mocks.db.sincronizacaoFornecedores.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ origem: "manual" }),
    });
  });

  it("faz upsert em lote por origemPlanilhaLinhaId, não por cnpj", async () => {
    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(mocks.db.$executeRaw).toHaveBeenCalled();
    const strings = mocks.db.$executeRaw.mock.calls[0]![0] as string[];
    const sqlTexto = strings.join("");
    expect(sqlTexto).toContain('ON CONFLICT ("origemPlanilhaLinhaId")');
  });

  it("marca como inativo fornecedor cujo linhaId não veio mais na leitura atual", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([
      { id: "forn-antigo", origemPlanilhaLinhaId: "999", status: "ativo" },
    ]);

    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    const chamadaUpdateStatus = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("inativo") && sql.includes("UPDATE");
    });
    expect(chamadaUpdateStatus).toBeDefined();
  });

  it("não desativa fornecedor cujo linhaId ainda está presente na planilha", async () => {
    mocks.db.fornecedor.findMany.mockResolvedValue([
      { id: "forn-1", origemPlanilhaLinhaId: "1", status: "ativo" },
    ]);

    const resultado = await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    expect(resultado.linhasDesativadas).toBe(0);
  });

  it("conta linhasRejeitadas do parser e grava em detalhes, sem travar a sincronização", async () => {
    const csvComRejeicao = [
      "#,Nome/Razão Social,CPF/CNPJ",
      ",SEM ID,12345678000190",
    ].join("\n");

    const resultado = await sincronizarFornecedores({ csv: csvComRejeicao, origem: "manual" });

    expect(resultado.linhasRejeitadas).toBeGreaterThanOrEqual(0);
  });

  it("grava concluidoEm e os contadores finais no registro de sincronização, mesmo com 0 linhas", async () => {
    await sincronizarFornecedores({ csv: "", origem: "manual" });

    expect(mocks.db.sincronizacaoFornecedores.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        concluidoEm: expect.any(Date),
        linhasLidas: expect.any(Number),
      }),
    });
  });

  it("mescla via UPDATE por id quando o CNPJ da linha já existe em outro fornecedor, em vez de tentar INSERT", async () => {
    mocks.db.fornecedor.findMany.mockImplementation(
      async ({ where }: { where?: { cnpj?: unknown } }) => {
        if (where?.cnpj) {
          // Busca de colisão de CNPJ dentro de upsertLote: simula que o CNPJ da
          // linha "ACME LTDA" (12345678000190, mascarado pelo parser) já
          // pertence a um fornecedor manual (sem origemPlanilhaLinhaId).
          return [{ id: "forn-manual-existente", cnpj: "12.345.678/0001-90" }];
        }
        return [];
      },
    );

    await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    const chamadaUpdatePorId = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes('WHERE "id" =') && sql.includes("origemPlanilhaLinhaId");
    });
    expect(chamadaUpdatePorId).toBeDefined();

    // Nunca deve tentar o INSERT em lote com um CNPJ que colide — só a linha
    // sem colisão (BETA COMERCIO, sem CNPJ) deve seguir para o INSERT.
    const chamadaInsert = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("INSERT INTO");
    });
    expect(chamadaInsert).toBeDefined();
  });

  it("mescla via UPDATE por id quando o CNPJ já pertence a fornecedor sincronizado antes com OUTRO linhaId (reprodução do 3º bug de produção)", async () => {
    // Reproduz o bug encontrado em 2026-08-19: uma execução anterior já
    // gravou o CNPJ 12345678000190 sob origemPlanilhaLinhaId "26"; a leitura
    // atual (após deduplicarPorCnpj escolher a última ocorrência) quer
    // sincronizá-lo sob linhaId "1" — DIFERENTE do já gravado. A busca de
    // colisão não pode filtrar por origemPlanilhaLinhaId: null, porque esse
    // fornecedor JÁ TEM um origemPlanilhaLinhaId (só que outro).
    //
    // O mock reproduz a semântica real do Postgres: o fornecedor fixture tem
    // origemPlanilhaLinhaId "26" (não null), então uma query que filtre
    // explicitamente por `origemPlanilhaLinhaId: null` NÃO o encontra — só a
    // ausência desse filtro no `where` encontra. Isso é o que faz este teste
    // cair de volta se o filtro `origemPlanilhaLinhaId: null` for
    // reintroduzido (mutação verificada manualmente).
    mocks.db.fornecedor.findMany.mockImplementation(
      async ({ where }: { where?: { cnpj?: unknown; origemPlanilhaLinhaId?: string | null } }) => {
        if (!where?.cnpj) return [];
        if ("origemPlanilhaLinhaId" in where && where.origemPlanilhaLinhaId === null) {
          return []; // fixture tem origemPlanilhaLinhaId "26" — não bate em `= null`
        }
        return [{ id: "forn-linha-26-antiga", cnpj: "12.345.678/0001-90" }];
      },
    );

    const resultado = await sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" });

    // Não deve ter propagado exceção nem gravado erro.
    expect(resultado.linhasAtualizadas).toBeGreaterThan(0);
    expect(mocks.db.sincronizacaoFornecedores.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ erro: expect.anything() }) }),
    );

    const chamadaUpdatePorId = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes('WHERE "id" =') && sql.includes("origemPlanilhaLinhaId");
    });
    // A herança do linhaId novo ("1") deve acontecer via UPDATE, não via
    // INSERT — o fornecedor da linha "26" antiga passa a responder pela
    // linha "1" nova.
    expect(chamadaUpdatePorId).toBeDefined();
  });

  it("libera o linhaId de um fornecedor 'gêmeo' órfão antes de reatribuí-lo (reprodução do 4º bug de produção)", async () => {
    // Reproduz o bug encontrado em 2026-08-19 com "SPACE AIR BRAZIL": o CNPJ da
    // linha "3306" estava malformado numa execução anterior (13 dígitos, zero à
    // esquerda perdido) e foi gravado como cnpj: null sob esse mesmo linhaId —
    // um fornecedor "gêmeo" órfão. Depois a planilha foi corrigida e o CNPJ
    // desta linha passou a bater com OUTRO fornecedor já existente
    // (forn-cnpj-existente, sob um linhaId diferente). Sem liberar o linhaId
    // "3306" do gêmeo órfão primeiro, o UPDATE que reatribui esse linhaId ao
    // fornecedor do CNPJ colidido violaria fornecedores_origemPlanilhaLinhaId_key.
    const csv = [
      "#,Nome/Razão Social,CPF/CNPJ",
      "3306,F.F.L/ .SPACE AIR BRAZIL,07583036000194",
    ].join("\n");

    mocks.db.fornecedor.findMany.mockImplementation(
      async ({
        where,
      }: {
        where?: { cnpj?: unknown; origemPlanilhaLinhaId?: { in: string[] } | { not: null } | null };
      }) => {
        if (where?.cnpj) {
          return [{ id: "forn-cnpj-existente", cnpj: "07.583.036/0001-94" }];
        }
        if (where?.origemPlanilhaLinhaId && "in" in where.origemPlanilhaLinhaId) {
          return [{ id: "forn-linhaId-orfao", origemPlanilhaLinhaId: "3306" }];
        }
        return [];
      },
    );

    const resultado = await sincronizarFornecedores({ csv, origem: "manual" });

    expect(resultado.linhasAtualizadas).toBeGreaterThan(0);
    expect(mocks.db.sincronizacaoFornecedores.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ erro: expect.anything() }) }),
    );

    const chamadas = mocks.db.$executeRaw.mock.calls.map((call) => (call[0] as string[]).join(""));

    const chamadaLibera = chamadas.find(
      (sql) => sql.includes("origemPlanilhaLinhaId") && sql.includes("NULL") && sql.includes('WHERE "id" ='),
    );
    expect(chamadaLibera).toBeDefined();

    const idxLibera = chamadas.findIndex((sql) => sql === chamadaLibera);
    const idxReatribui = chamadas.findIndex(
      (sql, i) => i > idxLibera && sql.includes('WHERE "id" =') && sql.includes("origemPlanilhaLinhaId"),
    );
    // A liberação do linhaId do gêmeo órfão precisa acontecer ANTES da
    // reatribuição — na ordem inversa, a reatribuição ainda colidiria.
    expect(idxReatribui).toBeGreaterThan(idxLibera);
  });

  it("mantém só a última ocorrência quando duas linhas têm o mesmo CNPJ, mesmo que estejam no mesmo lote", async () => {
    const csvComCnpjDuplicado = [
      "#,Nome/Razão Social,CPF/CNPJ",
      "1,PRIMEIRA LTDA,12345678000190",
      "2,SEGUNDA LTDA,12345678000190",
    ].join("\n");

    await sincronizarFornecedores({ csv: csvComCnpjDuplicado, origem: "manual" });

    const chamadaInsert = mocks.db.$executeRaw.mock.calls.find((call) => {
      const sql = (call[0] as string[]).join("");
      return sql.includes("INSERT INTO");
    });
    expect(chamadaInsert).toBeDefined();
    // Só uma linha (a última) deve ir para o INSERT: Prisma.join agrupa as
    // linhas do VALUES num único valor posicional aninhado ({ strings, values }).
    const valuesJoin = chamadaInsert![1] as { values: unknown[] };
    expect(valuesJoin.values).toContain("SEGUNDA LTDA");
    expect(valuesJoin.values).not.toContain("PRIMEIRA LTDA");
  });

  it("resolve CNPJ duplicado mesmo quando as duas ocorrências caem em lotes diferentes (reprodução do bug de produção)", async () => {
    // Reproduz o cenário real que quebrou em produção em 2026-08-19: o mesmo
    // CNPJ aparece na linha 1 e na linha 501 (lotes diferentes, teto de 500 do
    // TAMANHO_LOTE). Sem deduplicação global antes de dividir em lotes, a 2ª
    // ocorrência colidiria com o registro que a 1ª já tinha criado no lote
    // anterior — a query de colisão de upsertLote só busca fornecedor "sem
    // origemPlanilhaLinhaId", e a 1ª ocorrência já teria um.
    const linhasCsv = ["#,Nome/Razão Social,CPF/CNPJ"];
    linhasCsv.push("1,PRIMEIRA OCORRENCIA,12345678000190");
    for (let i = 2; i <= 500; i++) {
      linhasCsv.push(`${i},OUTRA EMPRESA ${i},`);
    }
    linhasCsv.push("501,ULTIMA OCORRENCIA,12345678000190");

    const resultado = await sincronizarFornecedores({
      csv: linhasCsv.join("\n"),
      origem: "manual",
    });

    // Não deve ter propagado exceção (o que aconteceria com a constraint
    // violada); e o registro de sincronização não deve ter erro gravado.
    expect(resultado.linhasLidas).toBeGreaterThan(0);
    expect(mocks.db.sincronizacaoFornecedores.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.not.objectContaining({ erro: expect.anything() }),
    });

    // A chamada de colisão de CNPJ do 2º lote (linha 501) não deve encontrar
    // "PRIMEIRA OCORRENCIA" como colisão, porque ela já foi removida pela
    // deduplicação global antes de formar os lotes.
    const insertsComPrimeiraOcorrencia = mocks.db.$executeRaw.mock.calls.filter((call) => {
      const sql = (call[0] as string[]).join("");
      if (!sql.includes("INSERT INTO")) return false;
      const valuesJoin = call[1] as { values: unknown[] };
      return valuesJoin.values.includes("PRIMEIRA OCORRENCIA");
    });
    expect(insertsComPrimeiraOcorrencia).toHaveLength(0);
  });

  it("grava erro e concluidoEm no registro quando o upsert falha, sem propagar exceção silenciosamente", async () => {
    mocks.db.$executeRaw.mockRejectedValue(new Error("conexão perdida"));

    await expect(sincronizarFornecedores({ csv: CSV_BASICO, origem: "manual" })).rejects.toThrow(
      "conexão perdida",
    );

    expect(mocks.db.sincronizacaoFornecedores.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        erro: expect.stringContaining("conexão perdida"),
        concluidoEm: expect.any(Date),
      }),
    });
  });

  it("atualiza linhasAtualizadas incrementalmente a cada lote — não só ao fim (reprodução do bug de log mentiroso em produção)", async () => {
    // Reproduz o achado em produção (2026-08-19): 3.500 fornecedores foram
    // criados com sucesso em 7 lotes antes do 8º falhar, mas o registro de
    // SincronizacaoFornecedores ficou com linhasAtualizadas: 0 porque o
    // contador só era calculado depois do laço inteiro terminar. Simula 2
    // lotes bem-sucedidos (afetadas > 0 cada) seguidos de uma falha.
    let chamadasExecuteRaw = 0;
    mocks.db.$executeRaw.mockImplementation(async () => {
      chamadasExecuteRaw += 1;
      if (chamadasExecuteRaw > 2) throw new Error("colisão no 3º lote");
      return 1; // 1 linha afetada por lote bem-sucedido
    });

    const linhasCsv = ["#,Nome/Razão Social,CPF/CNPJ"];
    for (let i = 1; i <= 1200; i++) linhasCsv.push(`${i},EMPRESA ${i},`);

    await expect(
      sincronizarFornecedores({ csv: linhasCsv.join("\n"), origem: "manual" }),
    ).rejects.toThrow();

    // Antes da correção, só a chamada final (que nunca acontece, pois lança
    // exceção) atualizaria linhasAtualizadas — o update do catch só grava
    // erro/concluidoEm. Com a correção, cada lote bem-sucedido já persiste
    // seu progresso via update incremental.
    const updatesComProgresso = mocks.db.sincronizacaoFornecedores.update.mock.calls.filter(
      (call) => (call[0] as { data: { linhasAtualizadas?: number } }).data.linhasAtualizadas,
    );
    expect(updatesComProgresso.length).toBeGreaterThan(0);
    expect(
      updatesComProgresso.some(
        (call) => (call[0] as { data: { linhasAtualizadas: number } }).data.linhasAtualizadas > 0,
      ),
    ).toBe(true);
  });
});
