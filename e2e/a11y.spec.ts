import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "processos", path: "/processos" },
  { name: "cotacoes", path: "/cotacoes" },
  { name: "fornecedores", path: "/fornecedores" },
  { name: "relatorios", path: "/relatorios" },
  { name: "instrucoes-pesquisa", path: "/assistente/instrucoes" },
];

for (const { name, path } of PAGES) {
  test(`acessibilidade — ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForSelector("main");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations,
      `Violações de acessibilidade em ${name}:\n${JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map((n) => n.target) })), null, 2)}`
    ).toHaveLength(0);
  });
}
