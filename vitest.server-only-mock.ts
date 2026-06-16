// Mock para o pacote "server-only" em ambiente de teste (Vitest não define
// a condition "react-server" que o pacote real exige, e lançaria erro ao
// ser importado). Mantém os módulos de produção protegidos contra uso em
// Client Components sem quebrar os testes unitários.
export {};
