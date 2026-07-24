import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // `.claude/worktrees/*` são checkouts completos dos agentes (com seus
    // próprios testes e node_modules); rodar a suíte da raiz sem excluí-los
    // varria esses arquivos e gerava falhas falsas por cópias duplicadas de libs.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/*.spec.ts", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "server-only": resolve(__dirname, "./vitest.server-only-mock.ts"),
    },
  },
});
