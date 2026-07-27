---
description: Corrige um bug seguindo as boas práticas do Claude Code (reproduzir com teste que falha → causa raiz → verificar), acionando a skill boas-praticas-claude-code
argument-hint: [descrição do bug — sintoma, onde ocorre, como reproduzir]
---

Bug a corrigir: $ARGUMENTS

Conduza a correção seguindo as melhores práticas oficiais do Claude Code.

1. **Carregue a skill** `boas-praticas-claude-code` (via ferramenta Skill) e use como guia a seção
   "Dê ao Claude uma forma de verificar o trabalho" e a linha "descreva o sintoma + local provável +
   como 'corrigido' se parece" de `references/conduta-de-desenvolvimento.md`.

2. **Se $ARGUMENTS estiver vago**, primeiro precise o sintoma, onde ocorre e como reproduzir — não
   comece a corrigir um bug mal definido.

3. **Escreva primeiro um teste que falha** reproduzindo o problema; depois corrija até o teste
   passar. Ataque a **causa raiz**, nunca suprima o sintoma nem desabilite a checagem para
   "destravar" (proibido pelo `CLAUDE.md` §8).

4. **Mostre evidência**, não afirmação: a saída do teste antes (vermelho) e depois (verde), o
   comando rodado e o retorno. Rode também lint/typecheck conforme o `CLAUDE.md` §7 antes de concluir.

5. Se você já corrigiu o mesmo ponto duas vezes sem sucesso, o contexto está poluído: pare, sugira
   `/clear` e recomece com um prompt melhor incorporando o que aprendemos.
