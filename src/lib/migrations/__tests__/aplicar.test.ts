import { describe, it, expect } from "vitest";
import {
  aplicarPendentes,
  calcularPendentes,
  checksum,
  detectarOrfas,
  type ExecutorSql,
  type MigrationLocal,
  type RegistroMigration,
} from "../aplicar";

function local(nome: string, sql = `-- ${nome}`): MigrationLocal {
  return { nome, sql };
}

function aplicada(nome: string): RegistroMigration {
  return {
    migration_name: nome,
    finished_at: new Date("2026-07-01T00:00:00Z"),
    rolled_back_at: null,
  };
}

function interrompida(nome: string): RegistroMigration {
  return { migration_name: nome, finished_at: null, rolled_back_at: null };
}

function revertida(nome: string): RegistroMigration {
  return {
    migration_name: nome,
    finished_at: new Date("2026-07-01T00:00:00Z"),
    rolled_back_at: new Date("2026-07-02T00:00:00Z"),
  };
}

/**
 * Executor de mentira que grava o que foi executado e permite programar falha em
 * um SQL específico. `emTransacao` só confirma o efeito quando `fn` termina sem
 * erro — é o que reproduz o ROLLBACK sem precisar de um Postgres real.
 */
function executorFake(opcoes: { falharEm?: (sql: string) => boolean } = {}) {
  const confirmados: string[] = [];
  let pendentesDaTransacao: string[] = [];

  const executor: ExecutorSql = {
    async executar(sql) {
      if (opcoes.falharEm?.(sql)) {
        throw new Error(`falha simulada: ${sql.slice(0, 30)}`);
      }
      pendentesDaTransacao.push(sql);
    },
    async emTransacao(fn) {
      pendentesDaTransacao = [];
      try {
        await fn();
        confirmados.push(...pendentesDaTransacao);
      } catch (erro) {
        pendentesDaTransacao = [];
        throw erro;
      }
    },
  };

  return { executor, confirmados };
}

describe("calcularPendentes", () => {
  it("considera pendente a migration ausente da tabela", () => {
    const pendentes = calcularPendentes(
      [local("20260614_init"), local("20260616_add_campo")],
      [aplicada("20260614_init")],
    );
    expect(pendentes.map((m) => m.nome)).toEqual(["20260616_add_campo"]);
  });

  it("não repete migration já aplicada", () => {
    const pendentes = calcularPendentes(
      [local("20260614_init")],
      [aplicada("20260614_init")],
    );
    expect(pendentes).toEqual([]);
  });

  it("reaplica migration com finished_at nulo (tentativa interrompida)", () => {
    const pendentes = calcularPendentes(
      [local("20260614_init")],
      [interrompida("20260614_init")],
    );
    expect(pendentes.map((m) => m.nome)).toEqual(["20260614_init"]);
  });

  it("reaplica migration marcada como revertida", () => {
    const pendentes = calcularPendentes(
      [local("20260614_init")],
      [revertida("20260614_init")],
    );
    expect(pendentes.map((m) => m.nome)).toEqual(["20260614_init"]);
  });

  it("preserva a ordem cronológica das pendentes", () => {
    const pendentes = calcularPendentes(
      [local("20260614_init"), local("20260616_b"), local("20260724_c")],
      [],
    );
    expect(pendentes.map((m) => m.nome)).toEqual([
      "20260614_init",
      "20260616_b",
      "20260724_c",
    ]);
  });

  it("banco vazio deixa todas pendentes", () => {
    const pendentes = calcularPendentes([local("a"), local("b")], []);
    expect(pendentes).toHaveLength(2);
  });
});

describe("detectarOrfas", () => {
  it("aponta migration registrada que não existe no disco", () => {
    expect(
      detectarOrfas([local("20260614_init")], [
        aplicada("20260614_init"),
        aplicada("20260801_futura"),
      ]),
    ).toEqual(["20260801_futura"]);
  });

  it("não aponta nada quando disco e banco batem", () => {
    expect(
      detectarOrfas([local("20260614_init")], [aplicada("20260614_init")]),
    ).toEqual([]);
  });
});

describe("checksum", () => {
  it("é estável para o mesmo conteúdo", () => {
    expect(checksum("CREATE TABLE x();")).toBe(checksum("CREATE TABLE x();"));
  });

  it("muda quando o SQL muda", () => {
    expect(checksum("CREATE TABLE x();")).not.toBe(checksum("CREATE TABLE y();"));
  });

  it("produz hex de sha-256 (64 caracteres)", () => {
    expect(checksum("qualquer")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("aplicarPendentes", () => {
  it("aplica o SQL e registra a migration na mesma transação", async () => {
    const { executor, confirmados } = executorFake();
    const resultados = await aplicarPendentes([local("20260614_init", "CREATE TABLE a();")], executor);

    expect(resultados).toEqual([{ nome: "20260614_init", aplicada: true }]);
    expect(confirmados[0]).toBe("CREATE TABLE a();");
    expect(confirmados.some((sql) => sql.includes("INSERT INTO"))).toBe(true);
  });

  it("não registra a migration quando o SQL falha (rollback)", async () => {
    const { executor, confirmados } = executorFake({
      falharEm: (sql) => sql.includes("CREATE TABLE"),
    });
    const resultados = await aplicarPendentes(
      [local("20260614_init", "CREATE TABLE a();")],
      executor,
    );

    expect(resultados[0].aplicada).toBe(false);
    expect(resultados[0].erro).toContain("falha simulada");
    // O ponto da atomicidade: nada foi confirmado, nem o DDL nem o INSERT.
    expect(confirmados).toEqual([]);
  });

  it("descarta o DDL já executado quando o registro falha depois dele", async () => {
    // A falha aqui é no INSERT, não no DDL — então o DDL chegou a ser executado
    // dentro da transação antes do aborto. É o caso que prova o ROLLBACK: sem
    // ele, o schema mudaria sem registro e a migration seria reaplicada depois,
    // quebrando com "objeto já existe".
    const { executor, confirmados } = executorFake({
      falharEm: (sql) => sql.includes("INSERT INTO"),
    });
    const resultados = await aplicarPendentes(
      [local("20260614_init", "CREATE TABLE a();")],
      executor,
    );

    expect(resultados[0].aplicada).toBe(false);
    expect(confirmados).toEqual([]);
  });

  it("para na primeira falha e não tenta as seguintes", async () => {
    const { executor } = executorFake({
      falharEm: (sql) => sql.includes("QUEBRA"),
    });
    const resultados = await aplicarPendentes(
      [
        local("20260614_a", "CREATE TABLE a();"),
        local("20260616_b", "QUEBRA"),
        local("20260724_c", "CREATE TABLE c();"),
      ],
      executor,
    );

    expect(resultados.map((r) => r.nome)).toEqual(["20260614_a", "20260616_b"]);
    expect(resultados[0].aplicada).toBe(true);
    expect(resultados[1].aplicada).toBe(false);
  });

  it("preserva a migration anterior já aplicada quando a seguinte falha", async () => {
    const { executor, confirmados } = executorFake({
      falharEm: (sql) => sql.includes("QUEBRA"),
    });
    await aplicarPendentes(
      [local("20260614_a", "CREATE TABLE a();"), local("20260616_b", "QUEBRA")],
      executor,
    );

    // Transação por migration: a primeira permanece, como no `migrate deploy`.
    expect(confirmados).toContain("CREATE TABLE a();");
  });

  it("limpa registro anterior antes de reinserir (reaplicação)", async () => {
    const { executor, confirmados } = executorFake();
    await aplicarPendentes([local("20260614_init", "CREATE TABLE a();")], executor);

    const posDelete = confirmados.findIndex((sql) => sql.includes("DELETE FROM"));
    const posInsert = confirmados.findIndex((sql) => sql.includes("INSERT INTO"));
    expect(posDelete).toBeGreaterThanOrEqual(0);
    expect(posInsert).toBeGreaterThan(posDelete);
  });

  it("sem pendentes, não abre transação nenhuma", async () => {
    const { executor, confirmados } = executorFake();
    const resultados = await aplicarPendentes([], executor);
    expect(resultados).toEqual([]);
    expect(confirmados).toEqual([]);
  });
});
