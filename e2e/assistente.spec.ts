import { test, expect } from "@playwright/test";

// Navegador real (CLAUDE.md §9.30): teste unitário com jsdom prova a lógica do
// componente, não que o gatilho está ligado, que o painel monta e que o campo é
// alcançável. Este arquivo cobre exatamente essa costura.
//
// O que ele NÃO cobre: um turno de verdade, que dependeria da OpenAI, da chave
// e da migration aplicada. Isso continua sendo verificação manual.

test.describe("assistente de pesquisa", () => {
  test("atalho global da topbar abre o painel", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Assistente de pesquisa" }).click();

    const painel = page.getByRole("dialog");
    await expect(painel.getByRole("heading", { name: "Assistente de pesquisa" })).toBeVisible();
    await expect(painel.getByLabel("Mensagem para o assistente")).toBeVisible();
  });

  test("o painel diz que registra candidato, não fonte da estimativa", async ({ page }) => {
    // A tela não pode prometer o que a regra proíbe (§9.40): promover candidato
    // a fonte é clique do servidor, e o texto de abertura precisa dizer isso.
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Assistente de pesquisa" }).click();

    const painel = page.getByRole("dialog");
    await expect(painel.getByText(/Promover candidato a fonte da estimativa/i)).toBeVisible();
    await expect(painel.getByText(/Não cria fonte da estimativa nem envia e-mail/i)).toBeVisible();
  });

  test("o botão de enviar só habilita com texto", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Assistente de pesquisa" }).click();

    const painel = page.getByRole("dialog");
    const enviar = painel.getByRole("button", { name: "Enviar" });
    await expect(enviar).toBeDisabled();

    await painel.getByLabel("Mensagem para o assistente").fill("procure cadeiras");
    await expect(enviar).toBeEnabled();
  });

  test("as instruções de pesquisa mostram os três níveis", async ({ page }) => {
    await page.goto("/assistente/instrucoes");

    await expect(page.getByRole("heading", { name: "Instruções de pesquisa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Regras gerais" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nova regra de categoria" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Regras específicas de processo" }),
    ).toBeVisible();
  });
});
