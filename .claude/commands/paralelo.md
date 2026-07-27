---
description: Roda dev → revisão + verificação em paralelo para uma tarefa, cada etapa em background com notificação ao terminar (worktree isolado, dentro desta sessão)
argument-hint: [descrição da tarefa a implementar]
---

Tarefa: $ARGUMENTS

Este comando implementa, dentro desta mesma sessão, o padrão de "janelas paralelas com papel
específico e notificação ao terminar" para este projeto — usando os subagentes de projeto
`dev`, `code-reviewer` e `verifier` (`.claude/agents/`) em vez de janelas de terminal separadas.

## Fluxo

1. **Desenvolvimento.** Se $ARGUMENTS estiver vazio, pergunte qual tarefa/item do `docs/PLAN.md`
   implementar antes de continuar. Lance o subagente `dev` via `Agent` com
   `isolation: "worktree"` e `run_in_background: true` (padrão), passando a tarefa completa,
   incluindo qualquer contexto relevante já levantado nesta conversa (não faça o agente
   redescobrir algo que você já sabe). Continue a conversa normalmente enquanto ele roda — não
   fique bloqueado esperando.

2. **Ao terminar o `dev`** (notificação de conclusão do agente): confira o branch/caminho do
   worktree retornado. Lance **em paralelo**, na mesma mensagem/turno, dois agentes em background
   sobre esse mesmo worktree/branch:
   - `code-reviewer` — revisão de conformidade e das regras do CLAUDE.md §9.
   - `verifier` — checklist de lint/typecheck/test/build/UI do CLAUDE.md §7.

3. **Enquanto isso roda**, se houver próximo trabalho a planejar (ex.: o próximo item do M11), use
   o agente `Plan` ou `EnterPlanMode` em primeiro plano — isso cobre o papel de "novas
   funcionalidades" sem precisar de outro subagente dedicado.

4. **Ao terminar `code-reviewer` e `verifier`**: reporte os dois resultados juntos ao usuário
   (achados de revisão + pass/fail da verificação). Se ambos vierem limpos, pergunte se o usuário
   quer seguir para `/finalizar` (que cuida de commit/push/merge/deploy, respeitando os níveis de
   autorização do CLAUDE.md §8) — não rode `/finalizar` sozinho sem essa confirmação.

## Regras que este comando não pula

- Nenhum dos três subagentes tem permissão de `git push`, merge ou deploy — isso é fluxo
  separado (`/finalizar`), autorizado explicitamente pelo usuário.
- Se `dev` reportar falha na verificação interna dele, não lance `code-reviewer`/`verifier` sobre
  código quebrado — pare e reporte o problema primeiro.
- Se `code-reviewer` encontrar achado grave (ex.: quebra de regra de conformidade IN 65/2021),
  trate como bloqueante — não sugira seguir para `/finalizar` até estar resolvido.
