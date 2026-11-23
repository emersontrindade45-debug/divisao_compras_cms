import { afterEach, describe, expect, it } from "vitest";
import { emailDoUsuarioDeSistema } from "../usuarioSistema";

describe("emailDoUsuarioDeSistema", () => {
  const original = process.env.CRON_USUARIO_EMAIL;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_USUARIO_EMAIL;
    else process.env.CRON_USUARIO_EMAIL = original;
  });

  it("normaliza: minúsculo e sem espaços nas pontas", () => {
    process.env.CRON_USUARIO_EMAIL = "  Sistema@Automacao.Local ";
    expect(emailDoUsuarioDeSistema()).toBe("sistema@automacao.local");
  });

  it.each([[undefined], [""], ["   "]])("ausente ou vazio (%j) = null", (v) => {
    if (v === undefined) delete process.env.CRON_USUARIO_EMAIL;
    else process.env.CRON_USUARIO_EMAIL = v;
    expect(emailDoUsuarioDeSistema()).toBeNull();
  });
});
