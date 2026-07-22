import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("autenticar usuário de teste", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_EMAIL ?? "admin@cms.gov.br");
  await page.getByLabel("Senha").fill(process.env.E2E_PASSWORD ?? "teste123");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: AUTH_FILE });
});
