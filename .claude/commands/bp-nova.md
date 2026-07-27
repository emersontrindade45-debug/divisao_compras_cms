---
description: Inicia uma nova funcionalidade seguindo as boas práticas do Claude Code (explorar → planejar → implementar → verificar), acionando a skill boas-praticas-claude-code
argument-hint: [descrição da funcionalidade a construir]
---

Funcionalidade desejada: $ARGUMENTS

Conduza o início desta funcionalidade seguindo as melhores práticas oficiais do Claude Code.

1. **Carregue a skill** `boas-praticas-claude-code` (via ferramenta Skill) e use a referência
   `references/conduta-de-desenvolvimento.md` como guia — especialmente as seções "Explore →
   planeje → codifique → commit" e, para features grandes, "Deixe o Claude entrevistar você".

2. **Se $ARGUMENTS estiver vazio ou vago**, não chute o escopo: entre em plan mode
   (`EnterPlanMode`) e/ou use `AskUserQuestion` para me entrevistar sobre implementação técnica,
   UI/UX, casos extremos e tradeoffs antes de propor qualquer código.

3. **Explore antes de codificar**: leia os arquivos relevantes e entenda os padrões existentes do
   projeto (siga a convenção do `CLAUDE.md`). Só depois produza um **plano** revisável.

4. **Defina a verificação já no plano**: quais testes/checagens provam que a feature funciona
   (obrigatório pelo `CLAUDE.md` §7). Lógica de conformidade IN 65/2021 exige teste — priorize.

5. Só saia do planejamento para implementar após eu aprovar. Se a mudança for de uma frase, pode
   pular o plano e ir direto — plan mode aqui seria só sobrecarga.
