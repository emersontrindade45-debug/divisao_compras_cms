---
description: Encerra uma tarefa/sessão de ponta a ponta — verifica, commita, sincroniza, sobe, mescla e faz deploy, com um único ponto de confirmação para as etapas de risco
argument-hint: [contexto opcional da tarefa]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git pull:*), Bash(git push:*), Bash(git merge:*), Bash(git branch:*), Bash(git stash:*), Bash(git rev-parse:*), Bash(pnpm lint:*), Bash(pnpm typecheck:*), Bash(pnpm test:*), Bash(pnpm build:*), Bash(pnpm exec prisma:*), Bash(vercel:*)
---

Este comando roda o ciclo completo de fechamento de uma tarefa/sessão neste projeto: verificação →
commit → sincronização → push → merge (se aplicável) → deploy. Ele segue as regras de CLAUDE.md
§7 (verificação obrigatória antes de finalizar) e §8 (permissões em três níveis) — não pula
nenhuma delas por ser um atalho único.

Contexto: $ARGUMENTS

## Passo 1 — Verificação (auto-permitido, sem pausa)
Rode nesta ordem e pare imediatamente se algo falhar, reportando o erro em vez de seguir:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Só avance para o Passo 2 se os quatro passarem.

## Passo 2 — Commit (auto-permitido, sem pausa)
- Mostre `git status` e `git diff` (staged + não staged).
- Se houver arquivo suspeito (segredo, artefato, arquivo grande), avise e pare antes de continuar.
- Faça stage apenas dos arquivos relevantes, citando cada um pelo nome — nunca `git add -A`/`.`.
- Redija a mensagem de commit em pt-BR, no imperativo, focada no "porquê" (CLAUDE.md §3). Use o
  contexto em $ARGUMENTS se fornecido.
- Commite com o trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Se não havia nada para commitar, apenas registre isso e siga para o Passo 3.

## Passo 3 — Sincronização (auto-permitido, mas pare em conflito)
- `git fetch origin`.
- Se a branch local estiver atrás do remoto, rode `git pull` (sem `--rebase` automático se isso
  reescrever histórico já commitado localmente sem avisar). Se houver mudança não commitada
  restante por algum motivo, proteja com `git stash push -u` antes e restaure depois.
- Se houver conflito em qualquer ponto deste passo, **pare aqui**, liste os arquivos em conflito e
  peça direção ao usuário. Não resolva automaticamente descartando um lado.

## Passo 4 — Ponto único de confirmação
Antes de tocar em qualquer coisa que afete o repositório remoto ou produção, monte um resumo
curto do que falta fazer (ex.: "vou dar push da branch `feat/x` para origin, mesclar em `main` e
rodar o checklist de deploy na Vercel") e peça **uma única confirmação** para o restante do fluxo
(Passos 5–7). Isso substitui pedir confirmação separada a cada ação — mas a migration de produção
no Passo 7 sempre tem sua própria confirmação à parte, mesmo já tendo confirmação geral, por ser a
única etapa que pode alterar dados de forma irreversível.

Se o usuário não confirmar, pare aqui — commit e sincronização já feitos ficam intactos localmente.

## Passo 5 — Push
- `git push` (com `-u origin <branch>` se não houver upstream).
- Nunca use `--force`, mesmo com a confirmação do Passo 4, a menos que pedido explicitamente.

## Passo 6 — Merge (só se aplicável)
- Se a branch atual não for `main`/`master`: mostre `git log main..<branch> --oneline` e
  `git diff main...<branch> --stat`, depois rode `git merge` (ou sugira abrir PR via `gh pr create`
  se o usuário preferir revisão antes de mesclar — pergunte se não estiver óbvio pelo histórico
  recente do projeto).
- Se já estiver em `main`/`master`, pule este passo.
- Empurre o merge (`git push`) se ele gerou commit novo em `main`.

## Passo 7 — Deploy
Siga o checklist do README.md ("Deploy na Vercel"):
- Se houver migration pendente no banco de produção: prefira a rota administrativa protegida
  `/api/admin/migrate` (CLAUDE.md §9, item 7 — nunca `prisma migrate deploy` no buildCommand da
  Vercel). **Pare e confirme explicitamente com o usuário antes desta etapa especificamente**,
  mesmo já tendo a confirmação geral do Passo 4.
- Rode `vercel --prod` (ou avise se o projeto já tiver deploy automático via integração
  Vercel-GitHub, caso em que o push do Passo 5 já é suficiente e este comando é redundante).

## Passo 8 — Resumo final
Relate em poucas linhas: o que foi commitado, se houve push/merge/deploy, e o link/URL relevante
(deploy, PR). Se algum passo foi pulado (nada para commitar, já estava em main, deploy automático),
diga isso explicitamente em vez de omitir.
