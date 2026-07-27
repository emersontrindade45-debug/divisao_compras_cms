# Uso e configuração do Claude Code

Como configurar o ambiente, estender e escalar a ferramenta. Fonte: documentação oficial
*Melhores práticas para Claude Code*.

## Índice
- [Escreva um CLAUDE.md eficaz](#claude-md)
- [Configure permissões](#permissoes)
- [Ferramentas CLI e MCP servers](#cli-mcp)
- [Hooks, skills, subagents, plugins — o que usar quando](#extensoes)
- [Gerencie a sessão e o contexto](#sessao)
- [Automatize e escale](#escala)

<h2 id="claude-md">Escreva um CLAUDE.md eficaz</h2>

O `CLAUDE.md` é lido no início de cada conversa — dá contexto persistente que o Claude não infere só
do código. Gere um inicial com `/init` e refine ao longo do tempo. Não há formato obrigatório; mantenha
curto e legível.

Como ele é carregado **toda sessão**, inclua só o que se aplica amplamente. Para o teste de cada
linha, pergunte: *"Remover isto faria o Claude cometer erros?"* Se não, corte — arquivos inchados
fazem o Claude ignorar as instruções reais.

| ✅ Inclua | ❌ Exclua |
|---|---|
| Comandos Bash que o Claude não adivinha | O que ele descobre lendo o código |
| Regras de estilo que fogem do padrão | Convenções padrão da linguagem |
| Instruções e runner de teste preferido | Documentação de API detalhada (linke) |
| Etiqueta do repo (nome de branch, convenção de PR) | Informação que muda com frequência |
| Decisões arquiteturais do projeto | Explicações longas / tutoriais |
| Peculiaridades do ambiente (env vars obrigatórias) | Descrição arquivo-a-arquivo do código |
| Armadilhas e comportamentos não óbvios | Óbvios como "escreva código limpo" |

Se o Claude insiste em algo contra uma regra existente, o arquivo provavelmente está longo demais e
a regra se perde no ruído. Se ele pergunta algo que o `CLAUDE.md` já responde, a redação está
ambígua. Trate-o como código: revise quando algo dá errado, pode regularmente, teste mudanças
observando se o comportamento realmente muda. Ênfase ("IMPORTANTE", "VOCÊ DEVE") melhora adesão a
regras críticas.

**Onde colocar**: `~/.claude/CLAUDE.md` (todas as sessões) · `./CLAUDE.md` (raiz do projeto,
versionado) · `./CLAUDE.local.md` (notas pessoais, no `.gitignore`) · diretórios pai/filho (puxados
automaticamente / sob demanda em monorepos). Importe outros arquivos com `@caminho/arquivo`.

**Conhecimento só às vezes relevante não vai no CLAUDE.md** — vira skill, carregada sob demanda sem
inchar cada conversa. (É o caso desta própria skill.)

<h2 id="permissoes">Configure permissões</h2>

Por padrão o Claude pede permissão para ações que modificam o sistema. Reduzir a fadiga de aprovação
sem perder controle, do mais amplo ao mais isolado:

- **Auto mode** — um classificador separado revisa comandos e bloqueia só o arriscado (escalada de
  escopo, infra desconhecida, ação induzida por conteúdo hostil). Bom quando você confia na direção
  da tarefa mas não quer clicar cada passo.
- **Allowlists** (`/permissions`) — libere ferramentas que você sabe seguras (`npm run lint`,
  `git commit`).
- **Sandboxing** (`/sandbox`) — isolamento em nível de SO restringindo FS/rede, deixando o Claude
  trabalhar mais livre dentro de limites.

> Este projeto formaliza isso no `CLAUDE.md` §8 (ações auto-permitidas, as que exigem autorização e
> as bloqueadas). Respeite essa seção antes de qualquer allowlist genérica.

<h2 id="cli-mcp">Ferramentas CLI e MCP servers</h2>

- **CLIs** (`gh`, `aws`, `gcloud`, `sentry-cli`) são a forma mais eficiente em contexto de falar com
  serviços externos. Instale o `gh` para issues/PRs sem esbarrar em rate limit de requisição não
  autenticada. O Claude aprende CLIs novas: *"use 'foo --help' e depois resolva A, B, C."*
- **MCP servers** (`claude mcp add`) conectam ferramentas externas (Notion, Figma, banco de dados)
  para consultar dados, integrar designs e automatizar fluxos.

<h2 id="extensoes">Hooks, skills, subagents, plugins — o que usar quando</h2>

| Recurso | Natureza | Use para |
|---|---|---|
| **CLAUDE.md** | consultivo, sempre carregado | contexto que se aplica a toda sessão |
| **Skill** (`.claude/skills/*/SKILL.md`) | consultivo, sob demanda | conhecimento de domínio / fluxo reutilizável que só às vezes importa |
| **Hook** (`.claude/settings.json`) | determinístico, automático | ação que deve ocorrer **toda vez, sem exceção** (ex.: rodar eslint após cada edição, bloquear escrita numa pasta) |
| **Subagent** (`.claude/agents/*.md`) | contexto isolado próprio | tarefa que lê muitos arquivos ou precisa foco especializado sem poluir a conversa principal |
| **Plugin** (`/plugin`) | pacote instalável | agrupa skills+hooks+subagents+MCP da comunidade/Anthropic |

Regra prática: se precisa acontecer **sempre**, é hook (determinístico), não instrução no CLAUDE.md
(consultiva). Se é conhecimento que só importa às vezes, é skill. O Claude pode escrever hooks e
skills para você: *"escreva um hook que roda eslint após cada edição."*

<h2 id="sessao">Gerencie a sessão e o contexto</h2>

Conversas são persistentes e reversíveis — use isso.

- **`Esc`**: interrompe o Claude no meio da ação preservando o contexto, para redirecionar.
- **`Esc Esc` ou `/rewind`**: abre o menu de rewind — restaure conversa, código, ambos, ou resuma a
  partir de uma mensagem. Cada prompt cria um checkpoint; snapshots são feitos antes de cada edição.
  ⚠️ Checkpoints só rastreiam edições via ferramentas do Claude — mudanças por Bash/processos
  externos não entram. Não substitui git.
- **`/clear`**: zera o contexto entre tarefas não relacionadas. Use com frequência.
- **`/compact <instruções>`**: compacta mantendo o que importa (ex.: `/compact foco nas mudanças de
  API`). A compactação automática dispara perto do limite. Você pode instruir a compactação no
  CLAUDE.md (ex.: "ao compactar, preserve a lista de arquivos modificados e os comandos de teste").
- **`/btw`**: pergunta rápida numa sobreposição descartável, sem entrar no histórico.
- **Subagents para investigação**: *"use subagents para investigar como o refresh de token funciona"*
  — eles exploram em contexto separado e relatam só o resumo, mantendo sua conversa limpa. Como
  contexto é a restrição fundamental, essa é uma das ferramentas mais poderosas.
- **Retomar**: `claude --continue` (última sessão) ou `claude --resume` (escolher). Nomeie com
  `/rename` (ex.: `oauth-migration`) e trate sessões como branches.

<h2 id="escala">Automatize e escale</h2>

- **Modo não-interativo**: `claude -p "prompt"` para CI, pre-commit hooks e scripts.
  `--output-format json` ou `stream-json --verbose` para saída parseável. Cria sessão retomável a
  menos que passe `--no-session-persistence`.
- **Sessões paralelas**: worktrees (checkouts git isolados), app desktop, Claude Code na web (VMs
  isoladas) ou equipes de agentes (coordenação automatizada). Contexto fresco melhora revisão —
  padrão **Writer/Reviewer**: uma sessão escreve, outra revisa sem viés do que acabou de escrever.
- **Fan-out entre arquivos**: gere a lista de alvos, faça loop chamando `claude -p` por item,
  restrinja com `--allowedTools`. Teste em 2-3 arquivos, refine o prompt, depois rode em escala.
- **Auto mode autônomo**: `claude --permission-mode auto -p "fix all lint errors"` — classificador
  aprova em background; em execução `-p` aborta se bloquear repetidamente (não há usuário para
  recorrer).

> Cuidado neste projeto: chamadas externas por item devem rodar com **concorrência limitada**, nunca
> serial puro (CLAUDE.md §9.11), e nunca adicione `prisma migrate deploy` ao build (§9.7). As
> práticas de escala acima não revogam as regras locais.
