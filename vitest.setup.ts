import "@testing-library/jest-dom/vitest";

// O Vitest não carrega .env; lib/db.ts instancia o Prisma no import e exige a variável.
// O adapter não conecta até a primeira query, então um placeholder basta para testes
// que apenas importam módulos que dependem de `db`.
process.env.DATABASE_URL ??=
  "postgresql://vitest:vitest@localhost:5432/vitest_placeholder";
