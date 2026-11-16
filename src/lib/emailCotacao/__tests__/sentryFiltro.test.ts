import { describe, expect, it } from "vitest";
import { descartarEventosDeEmail, veioDoModuloDeEmail } from "../sentryFiltro";

const evento = (filename: string) => ({
  exception: { values: [{ stacktrace: { frames: [{ filename }] } }] },
});

describe("filtro do Sentry para o módulo de e-mail", () => {
  it("descarta o evento quando algum quadro da pilha vem do módulo", () => {
    expect(descartarEventosDeEmail(evento("/var/task/src/lib/emailCotacao/sincronizar.ts"))).toBeNull();
    expect(descartarEventosDeEmail(evento("app/actions/verificarRespostasEmail.js"))).toBeNull();
  });

  it("descarta mesmo que o quadro do módulo não seja o topo da pilha", () => {
    const e = {
      exception: {
        values: [{ stacktrace: { frames: [{ filename: "emailCotacao/payload.ts" }, { filename: "node:internal/x" }] } }],
      },
    };
    expect(veioDoModuloDeEmail(e)).toBe(true);
  });

  it("deixa passar erro de qualquer outro lugar", () => {
    const e = evento("/var/task/src/lib/actions/processos.ts");
    expect(descartarEventosDeEmail(e)).toBe(e);
  });

  it("evento sem pilha passa (não há como atribuí-lo ao módulo)", () => {
    expect(descartarEventosDeEmail({})).toEqual({});
  });
});
