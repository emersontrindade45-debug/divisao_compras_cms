import { afterEach, describe, expect, it } from "vitest";
import { autorizadoPorCron } from "../cron";

const pedido = (auth?: string) => new Request("https://x.test/api/jobs/y", { headers: auth ? { authorization: auth } : {} });

describe("autorizadoPorCron", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("SEM segredo configurado nega — mesmo sem cabeçalho e mesmo com 'Bearer undefined' (§9.45)", () => {
    delete process.env.CRON_SECRET;
    expect(autorizadoPorCron(pedido())).toBe(false);
    expect(autorizadoPorCron(pedido("Bearer undefined"))).toBe(false);
    expect(autorizadoPorCron(pedido("Bearer "))).toBe(false);
  });

  it("segredo vazio também nega", () => {
    process.env.CRON_SECRET = "";
    expect(autorizadoPorCron(pedido("Bearer "))).toBe(false);
  });

  it("só o Bearer exato autoriza", () => {
    process.env.CRON_SECRET = "s3gredo-longo-de-teste";
    expect(autorizadoPorCron(pedido("Bearer s3gredo-longo-de-teste"))).toBe(true);
    expect(autorizadoPorCron(pedido())).toBe(false);
    expect(autorizadoPorCron(pedido("Bearer errado"))).toBe(false);
    expect(autorizadoPorCron(pedido("s3gredo-longo-de-teste"))).toBe(false); // sem o "Bearer "
    expect(autorizadoPorCron(pedido("bearer s3gredo-longo-de-teste"))).toBe(false);
    // (Espaço sobrando no fim não é testável: `Headers` já apara o valor, como manda o padrão HTTP.)
    expect(autorizadoPorCron(pedido("Bearer s3gredo-longo-de-test"))).toBe(false); // prefixo
    expect(autorizadoPorCron(pedido("Bearer s3gredo-longo-de-teste-extra"))).toBe(false); // segredo + sobra
  });
});
