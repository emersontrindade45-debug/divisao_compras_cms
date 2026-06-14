import { test, expect } from "@playwright/test";

test.describe("fluxo principal", () => {
  test("dashboard carrega métricas", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/processos em andamento/i)).toBeVisible();
  });

  test("lista de processos renderiza", async ({ page }) => {
    await page.goto("/processos");
    await expect(page.getByRole("heading", { name: /processos/i })).toBeVisible();
    const tabela = page.getByRole("table");
    const vazioMsg = page.getByText(/nenhum processo/i);
    await expect(tabela.or(vazioMsg)).toBeVisible();
  });

  test("detalhe de processo com id inválido exibe erro", async ({ page }) => {
    await page.goto("/processos/id-invalido-000");
    await expect(page.getByText(/não encontrado/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /voltar/i })).toBeVisible();
  });

  test("página de cotações renderiza abas", async ({ page }) => {
    await page.goto("/cotacoes");
    await expect(page.getByRole("heading", { name: /cotações/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /painel de controle/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /nova cotação/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /validação de propostas/i })).toBeVisible();
  });

  test("página de relatórios renderiza abas", async ({ page }) => {
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: /relatórios/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /visão geral/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /memória de cálculo/i })).toBeVisible();
  });

  test("sidebar navega entre módulos", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /fornecedores/i }).click();
    await expect(page).toHaveURL(/fornecedores/);
    await expect(page.getByRole("heading", { name: /fornecedores/i })).toBeVisible();
  });

  test("dashboard responsivo em mobile", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.auth/user.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await ctx.close();
  });

  test("acesso sem login redireciona para login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
    await ctx.close();
  });
});
