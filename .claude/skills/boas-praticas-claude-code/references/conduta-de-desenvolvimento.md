# Conduta de desenvolvimento assistido

Como conduzir o trabalho de codificação em si — a parte que independe de configuração da
ferramenta. Fonte: documentação oficial *Melhores práticas para Claude Code*.

## Índice
- [Dê ao Claude uma forma de verificar o trabalho](#verificar)
- [Explore → planeje → codifique → commit](#explorar-planejar-codificar)
- [Deixe o Claude entrevistar você (features grandes)](#entrevista)
- [Faça perguntas sobre o codebase](#perguntas)
- [Adicione uma etapa de revisão adversarial](#revisao-adversarial)
- [Desenvolva sua intuição](#intuicao)

<h2 id="verificar">Dê ao Claude uma forma de verificar o trabalho</h2>

O Claude para quando o trabalho "parece pronto". Sem uma verificação executável, esse é o único
sinal disponível — e você vira o loop de verificação, notando cada erro manualmente. Uma verificação
é **qualquer coisa que retorna sucesso/falha legível na conversa**: um conjunto de testes, o código
de saída de um build, um linter, um script que compara a saída com um fixture, ou um screenshot
comparado a um design.

Reescreva pedidos vagos para incluir o critério de verificação:

| Antes | Depois |
|---|---|
| "implemente uma função que valida e-mails" | "escreva `validateEmail`. casos: `user@example.com`→true, `invalido`→false, `user@.com`→false. rode os testes após implementar" |
| "faça o dashboard parecer melhor" | "[screenshot] implemente este design. tire um screenshot do resultado, compare com o original, liste as diferenças e corrija" |
| "a build está falhando" | "a build falha com: [erro]. corrija e verifique que a build passa. ataque a causa raiz, não suprima o erro" |

Quão rígido o critério controla a parada, do mais leve ao mais determinístico:
- **No próprio prompt**: peça para rodar a verificação e iterar na mesma mensagem.
- **Na sessão inteira**: uma condição `/goal` reavaliada a cada turno até ser satisfeita.
- **Gate determinístico**: um hook `Stop` roda a verificação como script e bloqueia o fim do turno
  até passar (o Claude Code encerra após 8 bloqueios seguidos).
- **Segunda opinião**: um subagent de verificação com modelo fresco tenta refutar o resultado — quem
  faz o trabalho não é quem o avalia.

**Sempre exija evidência** (a saída do teste, o comando rodado e o retorno, ou um screenshot) em vez
da afirmação de sucesso. Revisar evidência é mais rápido do que refazer a verificação você mesmo, e
funciona para sessões que você não acompanhou.

> Neste projeto essa regra é obrigatória: o `CLAUDE.md` §7 exige responder *"Como você confirma que
> isso está correto?"* e executar a verificação antes de reportar qualquer tarefa como concluída.

<h2 id="explorar-planejar-codificar">Explore → planeje → codifique → commit</h2>

Deixar o Claude pular direto para o código pode produzir uma solução elegante para o problema
errado. Separe as fases:

1. **Explore** (plan mode): "leia `/src/auth` e entenda como tratamos sessões e login; veja também
   como gerimos variáveis de ambiente para segredos." Sem alterações ainda.
2. **Planeje** (plan mode): "quero adicionar Google OAuth. Que arquivos mudam? Qual o fluxo de
   sessão? Crie um plano." Abra o plano no editor e edite antes de prosseguir.
3. **Implemente** (default mode): "implemente o fluxo OAuth do seu plano. Escreva testes para o
   callback handler, rode a suíte e corrija falhas."
4. **Commit**: "faça commit com mensagem descritiva e abra um PR."

**Quando pular**: se você descreveria o diff em uma frase, pule o plano. Planeje quando a abordagem
é incerta, a mudança toca vários arquivos, ou o código é desconhecido.

<h2 id="entrevista">Deixe o Claude entrevistar você (features grandes)</h2>

Para features maiores, inverta o fluxo: comece com um prompt mínimo e peça para o Claude entrevistar
você usando a ferramenta `AskUserQuestion`, cobrindo implementação técnica, UI/UX, casos extremos e
tradeoffs — sem perguntas óbvias, focando nas partes difíceis que você talvez não tenha considerado.
Ao final, grave um `SPEC.md`. Depois **comece uma sessão nova** para executar o spec: contexto limpo,
focado só na implementação, com um documento de referência escrito.

Os melhores specs são autossuficientes: nomeiam os arquivos e interfaces envolvidos, declaram o que
está fora do escopo e terminam com uma verificação de ponta a ponta que prova que a feature funciona.

<h2 id="perguntas">Faça perguntas sobre o codebase</h2>

Ao entrar em um código novo, use o Claude como usaria um engenheiro sênior — sem prompt especial:
- Como funciona o logging?
- Como crio um novo endpoint de API?
- Que casos extremos `X` trata?
- Por que este código chama `foo()` em vez de `bar()` na linha 333?

É um fluxo de onboarding eficaz: reduz o tempo de ramp-up e a carga sobre outros engenheiros.

<h2 id="revisao-adversarial">Adicione uma etapa de revisão adversarial</h2>

Quanto mais o Claude trabalha sem supervisão, mais importa uma verificação independente antes de
contar a tarefa como concluída. Um revisor em **contexto fresco** (subagent) vê só o diff e os
critérios que você der — não o raciocínio que produziu a mudança — então avalia o resultado nos
próprios termos.

- Para correção: rode a skill `/code-review` inclusa (revisa o diff atual em subagent fresco).
- Contra o plano: escreva o prompt de revisão nomeando o trabalho a verificar, o plano de referência
  e o que conta como achado. Ex.: *"Use um subagent para revisar o diff do rate limiter contra o
  PLAN.md. Confirme que cada requisito foi implementado, que os casos extremos têm teste, e que nada
  fora do escopo mudou. Reporte lacunas, não preferências de estilo."*

**Cuidado com over-engineering**: um revisor instruído a achar lacunas quase sempre acha alguma,
mesmo em trabalho sólido — é o que foi pedido. Perseguir cada achado leva a abstrações
desnecessárias e código defensivo. Diga ao revisor para sinalizar só lacunas que afetam correção ou
requisitos declarados; trate o resto como opcional.

> Este projeto tem os subagents `code-reviewer` e `verifier` justamente para esse papel — rode-os
> depois do `dev`, antes de merge/push.

<h2 id="intuicao">Desenvolva sua intuição</h2>

Estes padrões são pontos de partida, não dogma. Às vezes você *deve* deixar o contexto acumular
(problema complexo, histórico valioso), pular o planejamento (tarefa exploratória) ou usar um prompt
vago de propósito (quer ver como o Claude interpreta antes de restringir). Preste atenção ao que
funciona: quando a saída é ótima, note a estrutura do prompt, o contexto fornecido e o modo usado;
quando o Claude trava, pergunte por quê — contexto barulhento? prompt vago? tarefa grande demais?
