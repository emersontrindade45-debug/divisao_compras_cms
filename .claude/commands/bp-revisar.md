---
description: Revisa um trabalho já feito em contexto fresco, seguindo as boas práticas do Claude Code (revisão adversarial + verificação), acionando a skill boas-praticas-claude-code
argument-hint: [o que revisar — branch, diff, arquivo ou "as mudanças atuais"]
---

Alvo da revisão: $ARGUMENTS

Conduza uma revisão seguindo as melhores práticas oficiais do Claude Code.

1. **Carregue a skill** `boas-praticas-claude-code` (via ferramenta Skill) e use
   `references/conduta-de-desenvolvimento.md`, seção "Adicione uma etapa de revisão adversarial".
   A ideia central: um revisor em **contexto fresco** vê só o diff e os critérios — não o raciocínio
   que produziu a mudança — e por isso avalia o resultado nos próprios termos.

2. **Prefira os subagentes de projeto** (`.claude/agents/`) em vez de revisar você mesmo:
   - `code-reviewer` — foco em conformidade IN 65/2021 e nas regras anti-regressão do `CLAUDE.md` §9.
   - `verifier` — checklist de lint/typecheck/test/build/UI do `CLAUDE.md` §7.
   Lance-os sobre o alvo indicado em $ARGUMENTS (se vazio, revise o diff atual do branch).

3. **Reporte lacunas, não preferências de estilo.** Sinalize só o que afeta correção ou requisitos
   declarados; trate o resto como opcional. Um revisor sempre "acha algo" — não persiga cada achado
   a ponto de gerar over-engineering (abstrações e código defensivo desnecessários).

4. **Trate achado de conformidade como bloqueante**: qualquer preço sem fonte+data+evidência, quebra
   de auditoria ou bypass da IN 65/2021 impede seguir adiante até resolver.
