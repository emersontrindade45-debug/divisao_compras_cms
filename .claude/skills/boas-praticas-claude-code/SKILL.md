---
name: boas-praticas-claude-code
description: Guia de melhores práticas para trabalhar com o Claude Code (configurar ambiente, CLAUDE.md, skills, hooks, subagents, gestão de contexto e sessões, paralelismo) combinado com boas práticas de conduta de desenvolvimento assistido (verificar antes de concluir, explorar→planejar→codificar, prompts específicos, revisão adversarial, padrões de falha a evitar). Baseado na documentação oficial da Anthropic. Invoque sob demanda com /boas-praticas-claude-code quando quiser consultar, aplicar ou revisar essas práticas em uma tarefa.
disable-model-invocation: true
---

# Melhores práticas — Claude Code + conduta de desenvolvimento

Guia consultivo destilado da documentação oficial da Anthropic
([code.claude.com/docs](https://code.claude.com/docs/llms.txt) · página *Melhores práticas para
Claude Code*). Use-o para orientar como conduzir uma tarefa com o Claude Code de forma eficaz e
segura. É referência sob demanda — não substitui o `CLAUDE.md` do projeto, complementa-o.

## O princípio que sustenta tudo: contexto é o recurso escasso

A janela de contexto guarda a conversa inteira — cada mensagem, cada arquivo lido, cada saída de
comando — e **o desempenho do modelo degrada conforme ela enche**. Uma única sessão de depuração
pode consumir dezenas de milhares de tokens. Quase toda prática abaixo existe para proteger esse
recurso. Ao decidir entre duas abordagens, prefira a que mantém o contexto limpo e relevante.

## O ciclo central de uma tarefa bem conduzida

Siga este ciclo por padrão; ajuste conforme o tamanho da tarefa (ver "Quando pular etapas").

1. **Explorar** — entender o problema e o código antes de mudar qualquer coisa (plan mode).
2. **Planejar** — produzir um plano de implementação explícito e revisável.
3. **Implementar** — codificar seguindo o plano.
4. **Verificar** — rodar uma checagem objetiva (testes, build, lint, screenshot) e iterar até passar.
5. **Concluir** — commit descritivo + evidência do que foi verificado.

Separar exploração/planejamento da implementação evita "resolver o problema errado com elegância".

### Quando pular etapas
Se você descreveria o diff em uma frase (corrigir typo, adicionar um log, renomear variável), peça
direto — plan mode aqui é só sobrecarga. Planeje quando a abordagem é incerta, a mudança toca vários
arquivos, ou o código é desconhecido.

## As duas regras inegociáveis

Se você lembrar de apenas duas coisas deste guia:

1. **Dê ao Claude uma forma de verificar o próprio trabalho.** Sem uma checagem executável
   (teste, build, lint, script que compara com fixture, screenshot), "parece pronto" é o único
   sinal — e você vira o loop de verificação manual. Com ela, o loop se fecha sozinho: o Claude
   roda, lê o resultado e itera. Exija **evidência** (saída do teste, comando e retorno), não a
   afirmação "funcionou". → detalhes em [conduta-de-desenvolvimento.md](references/conduta-de-desenvolvimento.md).
2. **Corrija o curso cedo e limpe o contexto com frequência.** Após **duas** correções falhas no
   mesmo problema, o contexto está poluído com tentativas erradas: use `/clear` e recomece com um
   prompt melhor que incorpore o que você aprendeu. Uma sessão limpa quase sempre supera uma longa
   cheia de becos sem saída.

## Prompts específicos rendem mais

O Claude infere intenção, mas não lê mente. Cada aumento de precisão reduz correções depois:

- **Escope a tarefa**: qual arquivo, qual cenário, preferências de teste.
- **Aponte a fonte**: mande investigar o histórico git, um arquivo específico, um padrão existente.
- **Descreva o sintoma + local provável + como "corrigido" se parece.**
- **Forneça conteúdo rico**: `@arquivo` para o Claude ler antes de responder, cole imagens/screenshots,
  dê URLs de docs, canalize dados (`cat erro.log | claude`).

Prompt vago tem lugar: exploração aberta ("o que você melhoraria aqui?") revela o que você não
pensaria em perguntar. Use de propósito, não por preguiça.

## Consultando este guia

Escolha o arquivo conforme o que você precisa agora:

- **Como conduzir o desenvolvimento em si** (verificar, planejar, revisar, evitar armadilhas) →
  [references/conduta-de-desenvolvimento.md](references/conduta-de-desenvolvimento.md)
- **Como configurar e escalar a ferramenta** (CLAUDE.md, permissões, hooks, skills, subagents,
  gestão de sessão, paralelismo) →
  [references/uso-da-ferramenta.md](references/uso-da-ferramenta.md)

## Padrões de falha a reconhecer cedo

| Padrão | Sintoma | Correção |
|---|---|---|
| Sessão "pia de cozinha" | tarefas não relacionadas na mesma sessão | `/clear` entre tarefas |
| Correção repetida | corrige, erra, corrige de novo | após 2 falhas, `/clear` + prompt melhor |
| CLAUDE.md inchado | Claude ignora metade das regras | podar sem dó; regra que já é seguida, deletar |
| Confiança sem verificação | implementação plausível que ignora casos extremos | sempre fornecer verificação; sem ela, não enviar |
| Exploração infinita | "investigue X" sem escopo enche o contexto | escopar estreito ou delegar a subagent |

## Alinhamento com este projeto

Este repositório já institucionaliza várias dessas práticas no `CLAUDE.md`: a pergunta obrigatória
*"Como você confirma que isso está correto?"* antes de concluir (regra das duas verificações), a
seção de permissões do agente (equivalente a permission rules/allowlists) e a seção 9 de lições
anti-regressão (o CLAUDE.md tratado como código, podado e corrigido a cada erro). Ao aplicar este
guia, respeite primeiro o `CLAUDE.md` do projeto quando houver conflito — ele é a fonte de verdade
local.
