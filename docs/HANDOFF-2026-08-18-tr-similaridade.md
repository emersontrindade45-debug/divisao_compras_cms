# Handoff — 2026-08-18 — Extração do TR × busca de similaridade (504) + M24.0/M24.1

Documento para retomar exatamente de onde a sessão anterior parou. A sessão estourou o
limite de tokens depois do `git push` para `origin/main`; **código está em `main`,
migrations de produção ainda não foram confirmadas como aplicadas.**

Repo: `github.com/emersontrindade45-debug/divisao_compras_cms`
HEAD esperado: `c5e64c5` (`origin/main`)
Produção: `https://divisao-compras-cms.vercel.app`
Plano Vercel: **Hobby** (`maxDuration` máximo = 60s — confirmado com o usuário)

---

## O que já está feito (não refazer)

### Correção do 504 no upload do TR

Causa: upload do TR rodava **duas coisas na mesma Server Action** com um único teto de 60s:
(1) extração do PDF via OpenAI (o que o assistente lê em `Processo.trContexto`) e
(2) busca de contratos similares por item. A soma estourava o teto; a Vercel matava a
função sem resposta estruturada (504 no processo 908/2022, reincidência da §9.64).

Decisão do usuário: separar as etapas. Plano Hobby (não subir `maxDuration`).

Commit `0b9010b` — *Separa extração do TR da busca de similaridade para evitar 504*:

| Peça | O que mudou |
|---|---|
| `src/lib/actions/pesquisaSimilaridade.ts` | `processarPesquisaSimilaridade` virou duas actions: `extrairTR` e `buscarSimilaridadeItens` |
| `Processo.trItensExtraidos` | JSON de `ItemExtraidoTR[]`; a busca lê isso, não reprocessa o PDF |
| `src/components/processos/PesquisaSimilaridadeUploadForm.tsx` | chama as duas em sequência, cada uma em HTTP próprio; UI mostra a fase |
| `src/lib/ia/openaiProvider.ts` | extração do TR com timeout 50s e `maxRetries: 0` (`OPCOES_EXTRACAO_TR`) |
| `src/app/(app)/processos/[id]/page.tsx` | comentário de `maxDuration = 60` atualizado |
| testes | 8 casos em `pesquisaSimilaridade.test.ts`; suíte local passou (971, depois 986 com M24.1) |
| migration | `prisma/migrations/20260818180258_adiciona_tr_itens_extraidos/` (só o `ALTER` da coluna) |

`listar.ts` e `ferramentas.ts` (`lerTR`) usam `select` explícito **sem** `trItensExtraidos` —
listagem e assistente continuam funcionando no schema antigo. Quem quebra até a migration
rodar é o **upload do TR** (`extrairTR` grava a coluna nova) e a **busca** (`buscarSimilaridadeItens` lê ela).

### M24 (outra sessão, working tree compartilhada)

O `git add prisma/schema.prisma` do commit `0b9010b` pegou, sem querer, alterações do M24
que estavam no disco (CNPJ nullable, `emailsAdicionais`, `origemPlanilha*`, model
`SincronizacaoFornecedores`) **sem a migration correspondente**. Isso quebrou o build da
Vercel (`FornecedorFixture.cnpj: string` vs `string | null`) — o usuário chegou a colar
o erro achando que era deste projeto; era mesmo.

A sessão M24 completou em seguida, sem reverter o schema:

| Commit | O quê |
|---|---|
| `e6ef891` | M24.1 — parser puro da planilha (`fornecedoresPlanilha.ts`), 15 testes |
| `c5e64c5` | M24.0 — migration `20260818181842_fornecedor_sync_planilha` + ajustes de tipo (`cnpj: string \| null` em fixture, busca, `qualificarFornecedor`) |

Push conjunto: `0b9010b..c5e64c5` em `origin/main`. Build local de `c5e64c5` passou
(`prisma generate && next build`). M24.2 (gravação/sync da planilha) **ainda não começou**.

---

## O que falta (único bloqueio para o 504 em produção)

**Aplicar duas migrations no banco de produção**, via `/api/admin/migrate` (§9.7, §9.19).
Push **não** aplica migration. Até isso, o deploy do código novo falha no upload do TR
com `column does not exist` (`trItensExtraidos`).

Último GET de status medido (2026-08-18T18:23:02Z), **antes** do deploy de `c5e64c5`:

```
pendentes: []
aplicadas: 17 (última: 20260817190247_adiciona_fase_andamento_processo)
```

As duas novas **não apareciam nem em pendentes** porque a função que respondeu ainda era
o bundle antigo — `/api/admin/migrate` só lista arquivos que estão **no deploy em execução**.
Não repetir o diagnóstico “já está em dia” a partir desse GET.

Pendentes esperadas depois do deploy READY de `c5e64c5`:

1. `20260818180258_adiciona_tr_itens_extraidos`
2. `20260818181842_fornecedor_sync_planilha`

### Passo a passo (o agente não consegue chamar essa rota — classificador bloqueia)

O valor de `ADMIN_MIGRATE_SECRET` no `.env` local vem **entre aspas**. Sem `tr -d '\r"'`
o curl manda as aspas no Bearer e a rota devolve `{"error":"Não autorizado"}`.

```bash
s="$(grep -E '^ADMIN_MIGRATE_SECRET=' .env | cut -d= -f2- | tr -d '\r"')"

# 1. Esperar Deployments → c5e64c5 (ou posterior) READY em produção.

# 2. Status — as duas devem aparecer em pendentes:
curl -sS -H "Authorization: Bearer $s" \
  "https://divisao-compras-cms.vercel.app/api/admin/migrate"

# 3. Aplicar (autorização do usuário já foi dada nesta sessão; confirmar de novo se o contexto for outro):
curl -sS -X POST -H "Authorization: Bearer $s" \
  "https://divisao-compras-cms.vercel.app/api/admin/migrate"

# 4. Confirmar:
#    pendentes: []
#    aplicadas inclui as duas acima
```

Não usar a CLI da Vercel desta máquina para o POST: nesta sessão `npx vercel` pediu
login interativo (device code) e não ficou autenticada.

### Verificação que fecha a tarefa do 504 (depois da migration)

1. GET migrate: schema em dia.
2. Abrir um processo real (o 908/2022 foi o que 504-ou) e enviar o TR.
3. Confirmar: toast “TR processado…” **antes** de “Buscando contratos similares…”; assistente
   consegue ler o TR mesmo se a busca por item ficar parcial/`ignorado`.
4. Não basta build verde nem `/login` 200 (§9.21, §9.30).

---

## Armadilhas desta sessão (já viraram §9.73 e §9.74 do CLAUDE.md)

- `git add prisma/schema.prisma` em working tree compartilhada pega o arquivo inteiro, não o hunk.
- `GET /api/admin/migrate` com `pendentes: []` pode ser bundle velho, não banco em dia.
- `ADMIN_MIGRATE_SECRET="..."` no `.env`: aspas literais entram no header se o `cut` não as tira.
- Chamada HTTP à rota de migrate a partir do agente é bloqueada pelo classificador; o usuário
  precisa colar o curl.
- Comentário no topo de `pesquisaSimilaridade.ts` (orçamento de ~20s da extração no mesmo teto
  da busca) ficou **desatualizado** após o split — limpeza opcional, não bloqueante.

---

## M24 — de onde retomar (não misturar com o 504)

- **M24.0** schema+migration: commitado (`c5e64c5`), **não aplicado em produção** (mesma fila do POST).
- **M24.1** parser: commitado (`e6ef891`), verificado (986 testes, mutação do dedup de e-mail).
- **M24.2** (próximo): sync/gravação usando o parser — **não iniciar** até a migration
  `20260818181842_fornecedor_sync_planilha` estar aplicada em produção (§9.19). O parser não
  escreve no banco; o sync escreve `cnpj` nulo e `origemPlanilhaLinhaId`.

Arquivos do parser (não mexer sem necessidade):

- `src/lib/sheets/fornecedoresPlanilha.ts`
- `src/lib/validations/fornecedorPlanilha.ts`
- `src/lib/sheets/__tests__/fornecedoresPlanilha.test.ts`
- `src/lib/sheets/googleSheets.ts` (`fetchText` / `csvUrl` exportados)
- `src/lib/validations/fornecedor.ts` (`cnpjRegex` exportado)

---

## Prompt curto para a próxima sessão

> Continuar de `docs/HANDOFF-2026-08-18-tr-similaridade.md`.
> Código do split TR/similaridade e do M24.0/M24.1 já está em `origin/main` (`c5e64c5`).
> Única ação bloqueante: confirmar deploy READY, GET+POST `/api/admin/migrate` (aspas no
> secret, ver o handoff), depois exercitar o upload do TR num processo real.
> Não reimplementar a separação das actions. Não começar M24.2 antes da migration do Fornecedor.
> Não commitar arquivos de outras sessões no working tree.
