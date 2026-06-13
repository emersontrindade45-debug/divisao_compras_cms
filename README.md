# Plataforma de Pesquisa de Preços — Divisão de Compras (CMS)

Plataforma web interna para orquestração da pesquisa de preços, em conformidade com a IN 65/2021.
Briefing técnico: [CLAUDE.md](CLAUDE.md) · Roadmap: [docs/PLAN.md](docs/PLAN.md).

## Como rodar

Pré-requisitos: Node.js 20+, pnpm.

```bash
pnpm install
cp .env.example .env   # preencha as variáveis conforme necessário
pnpm dev               # http://localhost:3000
```

## Scripts

| Script | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Checagem de tipos (tsc) |
| `pnpm format` | Formata com Prettier |
| `pnpm test` | Testes (Vitest) |
