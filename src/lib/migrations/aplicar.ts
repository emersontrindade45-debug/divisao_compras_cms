import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Aplicação de migrations sem o CLI do Prisma (CLAUDE.md §9.29).
//
// Empacotar o CLI em função serverless custou três ciclos de deploy e nunca
// funcionou: o `require("@prisma/engines")` do CLI não resolve no bundle da
// Vercel (§9.18), o glob amplo estourou o limite de tamanho da função (§9.26) e
// a lista estreita deixou de fora a árvore transitiva (§9.28). Aqui o SQL das
// migrations é lido do disco e executado via `pg` — que já é dependência direta
// do projeto —, sem subprocesso, sem binário e sem NODE_PATH.
//
// O contrato com a tabela `_prisma_migrations` é o do próprio Prisma, para que
// esta rota e o `prisma migrate deploy` manual permaneçam intercambiáveis.

/** Linha de `_prisma_migrations` relevante para decidir o que está pendente. */
export interface RegistroMigration {
  migration_name: string;
  /** Nulo enquanto a migration não terminou (falhou ou foi interrompida). */
  finished_at: Date | null;
  /** Preenchido quando a migration foi marcada como revertida. */
  rolled_back_at: Date | null;
}

/** Migration encontrada no diretório `prisma/migrations`. */
export interface MigrationLocal {
  nome: string;
  sql: string;
}

/**
 * Executor de SQL. Existe para que a lógica de aplicação seja testável sem um
 * Postgres real — a rota injeta a implementação baseada em `pg`.
 */
export interface ExecutorSql {
  /** Executa um comando dentro de uma transação já aberta. */
  executar(sql: string, valores?: unknown[]): Promise<void>;
  /** Abre transação, roda `fn` e faz COMMIT; em erro, ROLLBACK e propaga. */
  emTransacao(fn: () => Promise<void>): Promise<void>;
}

/**
 * Lê as migrations do disco em ordem lexicográfica — que é cronológica, porque
 * o Prisma prefixa cada diretório com timestamp (`20260614155015_init`).
 */
export function lerMigrationsLocais(diretorio: string): MigrationLocal[] {
  return readdirSync(diretorio, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
    .map((nome) => ({
      nome,
      sql: readFileSync(join(diretorio, nome, "migration.sql"), "utf8"),
    }));
}

/**
 * Decide o que falta aplicar.
 *
 * Pendente = ausente da tabela, ou presente com `finished_at` nulo (tentativa
 * anterior interrompida), ou marcada como revertida. Uma migration revertida
 * volta à fila deliberadamente: é o que permite corrigir e reaplicar.
 */
export function calcularPendentes(
  locais: MigrationLocal[],
  registros: RegistroMigration[],
): MigrationLocal[] {
  const aplicadas = new Set(
    registros
      .filter((r) => r.finished_at !== null && r.rolled_back_at === null)
      .map((r) => r.migration_name),
  );
  return locais.filter((m) => !aplicadas.has(m.nome));
}

/**
 * Migrations registradas no banco que não existem no diretório local — sinal de
 * que o deploy está atrás do banco (ou de que alguém apagou uma migration).
 * Não bloqueia a aplicação; é reportado para diagnóstico.
 */
export function detectarOrfas(
  locais: MigrationLocal[],
  registros: RegistroMigration[],
): string[] {
  const nomesLocais = new Set(locais.map((m) => m.nome));
  return registros
    .filter((r) => !nomesLocais.has(r.migration_name))
    .map((r) => r.migration_name);
}

/** Checksum no mesmo formato do Prisma (SHA-256 hex do conteúdo do arquivo). */
export function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/** DDL da tabela de controle, idempotente e idêntica à que o Prisma cria. */
export const DDL_TABELA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export interface ResultadoMigration {
  nome: string;
  aplicada: boolean;
  erro?: string;
}

/**
 * Aplica as migrations pendentes, **uma transação por migration** — o mesmo
 * comportamento de `prisma migrate deploy`. Se a segunda de três falhar, a
 * primeira permanece aplicada e registrada, e a execução para ali: migrations
 * subsequentes podem depender da que falhou, então seguir adiante corromperia o
 * schema de forma difícil de diagnosticar.
 *
 * O registro em `_prisma_migrations` é gravado dentro da mesma transação do DDL.
 * Isso é o que impede o estado "schema alterado mas não registrado", que faria a
 * migration ser reaplicada no próximo POST e falhar com objeto duplicado.
 */
export async function aplicarPendentes(
  pendentes: MigrationLocal[],
  executor: ExecutorSql,
  agora: () => Date = () => new Date(),
): Promise<ResultadoMigration[]> {
  const resultados: ResultadoMigration[] = [];

  for (const migration of pendentes) {
    try {
      await executor.emTransacao(async () => {
        await executor.executar(migration.sql);
        // Limpa tentativa anterior interrompida antes de registrar a nova, para
        // não acumular linhas órfãs da mesma migration.
        await executor.executar(
          `DELETE FROM "_prisma_migrations" WHERE "migration_name" = $1`,
          [migration.nome],
        );
        await executor.executar(
          `INSERT INTO "_prisma_migrations"
             ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
           VALUES ($1, $2, $3, $4, $4, 1)`,
          [
            crypto.randomUUID(),
            checksum(migration.sql),
            migration.nome,
            agora(),
          ],
        );
      });
      resultados.push({ nome: migration.nome, aplicada: true });
    } catch (error) {
      resultados.push({
        nome: migration.nome,
        aplicada: false,
        erro: error instanceof Error ? error.message : String(error),
      });
      // Para na primeira falha — ver comentário acima.
      break;
    }
  }

  return resultados;
}
