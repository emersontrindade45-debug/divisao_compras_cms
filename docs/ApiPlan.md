# ApiPlan.md — Integrações de fontes públicas de preço

Plano de integração de novas fontes de dados para enriquecer a pesquisa de preços. Complementa o
[PLAN.md](PLAN.md), que cobre os milestones de produto (M0–M14); este documento cobre a série
**M15–M20**, dedicada a fontes externas.

Escrito em 2026-08-06 a partir de um panorama de ~45 plataformas de órgãos brasileiros. A primeira
decisão do plano foi **não integrar a maioria delas** — a triagem e o porquê estão na §2.

---

## 1. Premissas decididas com o usuário (2026-08-06)

| Decisão | Escolha | Consequência |
|---|---|---|
| Perfil de objeto pesquisado | Serviços continuados, obras/engenharia, TI/equipamentos e material de consumo — **todos frequentes** | Nenhuma fonte pode ser cortada por "não é o nosso perfil"; a priorização passa a ser por custo e por lacuna atual |
| Forma de consumo | **Ingestão para base própria** | Fontes novas viram tabela no nosso Postgres, atualizada por rotina. Constrói o Módulo 8 do PRD |
| API comercial paga (Tier C) | **Descartada** | Registrada na §2.3 como decisão fundamentada, para não ser reproposta |

**Ressalva sobre "ingestão":** a escolha vale para **fontes novas**. PNCP e Compras.gov continuam
sendo consultados ao vivo — o PNCP é um repositório nacional em fluxo contínuo, e replicá-lo
localmente é um projeto maior que este plano inteiro. Na prática o sistema fica híbrido: consulta ao
vivo para repositórios vivos, ingestão para tabelas de referência periódicas. O que a decisão exclui
é criar mais um cliente HTTP síncrono no caminho da busca a cada fonte nova, que é o que estouraria
o orçamento de tempo da função serverless (§9.11).

---

## 2. Triagem das plataformas do panorama

O panorama recebido classificava as plataformas por "possui API". Esse é o critério mais fraco
disponível para este projeto. A triagem abaixo usa quatro filtros, aplicados nesta ordem.

**F1 — Conformidade.** A fonte produz preço com fonte + data + URL/documento citável e arquivável?
Se não produz, não pode alimentar a estimativa (IN 65/2021; CLAUDE.md §9.8). No máximo orienta o
pesquisador.

**F2 — Redundância com o PNCP.** Desde 2023, contratação regida pela Lei 14.133 tem publicação
obrigatória no PNCP (art. 174). Plataformas que apenas **operam** o certame republicam o resultado
lá — e o PNCP já é lido pelo sistema, com valor homologado e paginação corrigidos no M14.0.

**F3 — Lacuna real.** A fonte cobre algo que hoje não cobrimos, ou cobre pior do que já cobrimos?

**F4 — Custo de acesso e fragilidade.** Contrato comercial, credenciamento restrito a órgãos de
outro ente, ou API interna não documentada que quebra em silêncio.

### 2.1 Tier A — integrar

| Fonte | Lacuna que fecha | Filtro decisivo |
|---|---|---|
| **Compras.gov — materiais (CATMAT) e itens da 14.133** | Material de consumo e TI/equipamentos — hoje **zero** cobertura na integração existente | F3: mesma API, mesmo padrão. Spike de 2026-08-06 confirmou preço homologado, evidência derivável e 41 mil itens só na classe de material de escritório (§4.1) |
| **SINAPI** (Caixa) | Obras e serviços de engenharia | F3 + obrigatoriedade legal (tabela de referência federal) |
| **CADTERC / BEC-SP** | Serviços continuados (limpeza, vigilância, recepção, copeiragem) | F3: lacuna admitida no próprio código — ver `comprasGov.ts:18-21` |
| **CEIS/CNEP + CNPJ/SICAF** | Qualificação de fornecedor (não é preço) | F4 baixíssimo, valor de conformidade alto |

### 2.2 Tier B — reavaliar depois do uso real (M20)

LICITAÇÕES-e (BB), dados abertos de Compras MG e COE-RS, BPS/DATASUS, CMED/ANVISA.

Motivo do adiamento: dependem de credenciamento restrito ao ente de origem (estaduais, BB) ou
cobrem um perfil de objeto — medicamentos e insumos de saúde — que uma Câmara Municipal
raramente contrata. Nenhum deles é ruim; todos são especulativos até o uso real apontar demanda.

### 2.3 Tier C — decisão fundamentada de NÃO integrar

**Portal de Compras Públicas, Licitanet, BNC Compras, BLL, BBMNET, Compras BR.**

Três razões cumulativas:

1. **Redundância (F2).** São operadoras de pregão eletrônico. O resultado homologado — que é o dado
   com valor de referência de preço (§9.61) — é publicado no PNCP por obrigação legal. Integrá-las
   é reler, pagando, o que já lemos de graça.
2. **Custo de acesso (F4).** "API comercial" para um órgão público significa contratar. A Câmara
   teria que instruir um processo de contratação — com pesquisa de preços — para adquirir uma
   ferramenta de pesquisa de preços.
3. **Custo de manutenção.** Seis contratos, seis autenticações, seis formatos, seis pontos de
   quebra, sem ganho informacional demonstrado.

**O que reabriria a decisão:** um estudo de sobreposição medindo quantas contratações relevantes
dessas plataformas **não** aparecem no PNCP. Enquanto esse número não for medido, qualquer
argumento a favor é hipótese (§9.35). O estudo cabe no M20.

### 2.4 Tier D — nunca como fonte ao vivo

BEC/SP (API interna), Compras RJ/PR/DF/MS/MT/CE/PB, SIGA-ES, SIGA-AP, eCompras-AM, portais
municipais.

API interna não documentada não tem contrato de estabilidade nem URL de evidência garantida. Se
mudar o formato, quebra em silêncio — exatamente o modo de falha do §9.61 (array nu truncado sem
aviso). Só entram neste plano se publicarem **arquivo ou dado aberto versionado**, caso em que
passam a ser candidatas a ingestão como qualquer outra tabela.

As demais do terceiro bloco do panorama (SICRO, ORSE, SETOP, SIURB, SEINFRA-CE, GOINFRA, Nota
Paraná, CEASA, CONAB, concessionárias) são regionalmente irrelevantes para Santos/SP ou não
produzem preço citável para o nosso objeto. Ficam fora sem milestone.

### 2.5 Tribunais de Contas estaduais — decisão fundamentada de NÃO integrar

Levantados por pedido do usuário em 2026-08-06 e **descartados na mesma data**. Registrado com o
levantamento inteiro porque a pergunta "os TCEs não teriam base suficiente?" é intuitiva e vai
voltar; quem voltar a ela precisa encontrar aqui o que já foi medido.

O critério de corte é granularidade: sem **item com quantidade e valor unitário**, não há série de
preços. Cabeçalho de contrato (objeto + valor global) não serve — o M14.0 já mediu 51% de
diferença entre nível de preço estimado e homologado.

| TCE | Acesso | Item-level | Atualização |
|---|---|---|---|
| RS (LicitaCon) | CKAN + ZIP/CSV | **Sim** — 14 arquivos, incl. `ITEM`, `LOTE`, `PROPOSTA`, `ITEM_PROPOSTA` | Diária (ano corrente e anterior) |
| PE | API REST, 89 endpoints | **Sim** — `ContratoItemObjeto`, `LicitacoesDetalhes`, `ComparativoPrecoEstado` | Não verificada |
| RJ | API v1 documentada | Não verificado (SPA não renderizou) | — |
| MG | Portal de dados abertos | Não verificado — **certificado TLS não valida** | — |
| **SP (Audesp Fase IV)** | CSV/ZIP; a API do portal só tem despesas, receitas e municípios | **Não documentado** — só `AJUSTES` e `LICITACOES` | **"Esporádica"**; última em 08/07/2025 cobrindo até **12/2024** |
| PR | Portal próprio **+ `pncp.tce.pr.gov.br`** | — | — |
| SC / MT / CE | Painel Qlik / consulta cidadã | Painel não é dado aberto | — |

**Cinco razões para descartar, cumulativas:**

1. **O TCE geograficamente relevante é o pior da lista.** SP tem dados parados em 12/2024,
   frequência declarada "esporádica" e nenhuma API de licitações. Os dois bons — RS e PE — estão
   longe.
2. **A base de SP está sendo trocada.** A Fase IV foi reformulada para receber dados por webservice
   JSON "similar ao exigido pelo PNCP"; o módulo Edital já vigora (Comunicado SDG nº 61/2025) e
   Licitação/Ata/Ajuste serão anunciados. Ingerir a extração atual é construir sobre formato em
   migração.
3. **O próprio TCE-SP admite erro no dado.** O portal registra que as informações vêm dos órgãos,
   que as entidades não conseguem corrigir após a conclusão do módulo e que "podem existir erros de
   digitação gerando divergências entre a informação disponibilizada e o processo da entidade".
   Preço que instrui processo não pode vir daí.
4. **Nenhum TCE entrega URL de evidência por registro.** São dumps. Reprova no filtro F1 (§9.8).
5. **Os TCEs convergem para o PNCP, não competem com ele.** O TCE-PR já opera endereço PNCP; o
   TCE-SP está remodelando no formato do PNCP. O valor marginal da via TCE tende a **cair** com o
   tempo, não a subir — é a única fonte deste levantamento com essa propriedade.

**O que reabriria a decisão.** Uma medição, não uma opinião: tomar ~200 contratações de RS de 2025
no LicitaCon e verificar quantas aparecem no PNCP com valor homologado por item. Sobreposição alta
confirma o descarte; sobreposição baixa devolve TCE-RS ao Tier A. Cabe no M20, se alguém quiser
gastar o tempo.

**A ideia aproveitável, para não se perder.** O uso defensável de um TCE não seria como fonte de
preço, e sim como **índice de descoberta**: dump local para *encontrar* contratação similar (nossa
busca no PNCP é por termo, ao vivo, sem corpus local), com a evidência citável saindo do PNCP por
cruzamento de órgão/número/ano. Se o gargalo de descoberta aparecer no uso real de M16–M18, essa é
a forma de atacá-lo — e aí a fonte do dump é uma decisão secundária.

**Ressalva de conformidade que sobrevive ao descarte.** Contratação similar de outro estado é
aceitável para material de consumo e TI; **não é** para serviços continuados com mão de obra, cujo
preço varia por piso salarial e convenção coletiva regional. Um posto de limpeza gaúcho não é
referência defensável para Santos. Isso vale para qualquer fonte distante e reforça o M18 (CADTERC).

**Não verificado.** Endpoints do TCE-RJ, conteúdo do TCE-MG (certificado inválido), formato e
autenticação da API do TCE-PE. E, sobre o TCE-SP: a documentação não *menciona* item-level, o que
não prova que os CSVs não tragam a coluna — só o download resolveria (§9.35). Nada disso muda o
descarte, porque as razões 1 a 5 não dependem dessas lacunas.

---

## 3. Arquitetura

### 3.1 O que este plano realmente constrói

Não são "N clientes de API". É o **Módulo 8 do PRD** — repositório de inteligência de mercado —,
que o CLAUDE.md descreve como existindo apenas em semente. As integrações são o mecanismo de
povoamento; a entrega é uma base própria de preços de referência, consultável instantaneamente,
com proveniência e evidência por registro.

### 3.2 Modelos novos (proposta para o M15)

```
FonteReferencia   // catálogo de fontes: SINAPI, CADTERC, CATMAT, ...
  id, chave, nome, esfera, baseLegal, urlOficial, periodicidade, ativa

LoteIngestao      // auditoria de cada rodada de ingestão
  id, fonteReferenciaId, competencia, urlArquivo, checksum,
  linhasLidas, linhasImportadas, linhasRejeitadas, iniciadoEm, concluidoEm, erro

PrecoReferencia   // o registro de preço em si
  id, fonteReferenciaId, loteIngestaoId, codigo, descricao, descricaoNormalizada,
  unidade, valorUnitario, dataReferencia, uf, urlEvidencia, metadados(Json)
  @@unique([fonteReferenciaId, codigo, competencia, uf])
```

> **Pendência descoberta pelo spike do M17 (2026-08-07) — resolvida em 2026-08-07 (continuação).** O
> model implementado no M15 seguia exatamente a proposta acima e não tinha campo `regime` na chave
> única. Para SINAPI, desonerado/não-desonerado são dois ZIPs de origem inteiramente separados por
> competência/UF — sem `regime` na chave, a segunda ingestão colidiria com a primeira. Corrigido:
> `regime String @default("")` acrescentado (mesmo padrão do `uf` — vazio para fontes sem essa
> distinção), índice único regravado como
> `@@unique([fonteReferenciaId, codigo, competencia, uf, regime])`
> (`prisma/schema.prisma:647-680`), `PrecoReferenciaNormalizado`/`runner.ts` alargados com o mesmo
> campo opcional. Migration `20260807195603_m17_preco_referencia_regime` aplicada em **dev**
> (`prisma migrate status` confirma `Database schema is up to date!`); produção fica para quando o
> runner do SINAPI for de fato escrito, com autorização explícita (mesmo padrão do M15/M16,
> §9.19/CLAUDE.md §8). Coberto por teste dedicado + verificação por mutação (regime hardcoded para
> `""` fez o teste cair, confirmando que a asserção protege a garantia — §9.39). Detalhe completo em
> [ApiPlan-M17-spike.md §4](ApiPlan-M17-spike.md).

### 3.3 Uma decisão de design que evita dor recorrente

`TipoCandidatoSimilaridade` ganha **um único** valor novo — `preco_referencia` — e não um valor por
fonte. A fonte concreta é identificada por FK para `FonteReferencia`.

Motivo: cada valor novo de enum custa migration + varredura de `select` em todo o model e nas
relações que apontam para ele (§9.46) + badge na UI + testes. Com um valor só, acrescentar a
sexta fonte de referência é inserir uma linha numa tabela, não migrar o schema. O enum descreve
**a natureza da fonte para fins da IN 65**; a identidade da fonte é dado, não tipo.

O tipo `CandidatoSimilaridade` em [types.ts:10-19](../src/lib/ia/types.ts#L10-L19) hoje aceita duas
literais em `tipoCandidato` e precisa ser alargado junto.

### 3.4 Registry de provedores

[buscarCandidatosPublicos.ts](../src/lib/similaridade/buscarCandidatosPublicos.ts) hoje é um
`Promise.all` de duas funções nomeadas. Vira um registry:

- interface única por provedor, com `chave`, `habilitado`, `timeoutMs`;
- **timeout por provedor** e isolamento de falha (`Promise.allSettled`), para que fonte lenta ou
  fora do ar degrade o resultado em vez de derrubar a busca — hoje o `catch → []` interno de cada
  cliente faz isso por acidente, não por desenho, e uma exceção fora do `try` derruba tudo;
- **orçamento de tempo global** declarado, com `maxDuration` explícito na rota (hoje só a rota do
  assistente declara);
- **deduplicação** entre provedores: a mesma contratação pode chegar pelo PNCP e por outra fonte.
  Chave de dedupe por `(cnpjOrgao, ano, sequencial, numeroItem)` quando houver, com fallback para
  `(valorUnitario, dataReferencia, descricaoNormalizada)`.

---

## 4. Milestones

Cada milestone começa por um **spike de premissa** e só depois codifica. Isso não é cerimônia: as
afirmações sobre formato de arquivo das fontes do Tier A (SINAPI, CADTERC) são conhecimento geral
não verificado contra a fonte atual, e o projeto já pagou caro por tratar plausibilidade como
evidência (§9.35, §9.24). O spike existe para produzir a evidência antes do código.

**Convenção de acompanhamento.** Toda tarefa executável deste plano é um checkbox. `[ ]` pendente,
`[x]` concluída. Marcar só depois de a verificação de aceite ter rodado — nunca por ter escrito o
código (§7 do CLAUDE.md). Tarefa que muda de escopo depois de um spike é reescrita, não
silenciosamente marcada.

### M15 — Fundação: registry de provedores + base de referência

**Objetivo.** Tornar barato acrescentar fonte. Nenhuma fonte nova entra aqui.

- [x] Modelos `FonteReferencia`, `LoteIngestao`, `PrecoReferencia` no `schema.prisma`
- [x] Migration criada e aplicada em **dev** (Postgres local do WSL) — `prisma migrate status`
      confirmou `Database schema is up to date!` contra `localhost:5432/divisao_compras`.
      Produção fica de fora por desenho desta tarefa (ver nota abaixo, não é a mesma coisa que
      "pendente por esquecimento").
- [x] Valor `preco_referencia` em `TipoCandidatoSimilaridade` (um só — ver §3.3)
- [x] Alargar `CandidatoSimilaridade` em `src/lib/ia/types.ts`
- [x] Varredura de `select` explícito nos models tocados, incluindo relações aninhadas (§9.46) —
      nenhuma query de `ResultadoSimilaridade` (nem das relações que apontam para ele —
      `Fonte.resultadoSimilaridade`, `ConversaAssistente.candidatos`) usava `include` ou select
      implícito; todas já tinham `select` explícito de trabalho anterior (M13). Nenhuma coluna nova
      foi acrescentada a `ResultadoSimilaridade` neste milestone (só um valor de enum), então o
      risco do §9.46 não se materializou aqui — a varredura ficou como confirmação, não correção.
- [x] Registry de provedores com `chave`, `habilitado`, `timeoutMs`
      (`src/lib/similaridade/registryProvedores.ts`)
- [x] Isolamento de falha por provedor (`allSettled`) + timeout individual
      (`src/lib/similaridade/comTimeout.ts`, usado em `buscarCandidatosPublicos.ts`)
- [x] Deduplicação entre provedores (chave `(cnpjOrgao, ano, sequencial, numeroItem)` + fallback)
      (`src/lib/similaridade/deduplicarCandidatos.ts`) — a chave primária só é usada quando o
      provedor expõe `identidadeContratacao` (hoje só o PNCP, enriquecido para isso); os demais
      caem no fallback `(valorUnitario, dataReferencia, descricaoNormalizada)`.
- [x] `maxDuration` explícito nas rotas de busca — `pesquisaSimilaridade.ts` é o único consumidor
      do registry hoje, mas é uma Server Action (`"use server"`), e um arquivo `"use server"` só
      pode exportar funções assíncronas no Next 16/Turbopack (`export const maxDuration` ali quebra
      o build). A configuração de rota foi para o segmento que hospeda o formulário que dispara a
      action: `src/app/(app)/processos/[id]/page.tsx`.
- [x] Runner genérico de ingestão (baixa → valida cabeçalho → grava lote → reporta rejeitadas)
      (`src/lib/ingestao/runner.ts` + `checksum.ts`) — sem cliente HTTP concreto, como previsto.
- [x] Página administrativa de status das ingestões (`/ingestoes`, na sidebar em "Consulta") —
      lista `FonteReferencia` e `LoteIngestao` com os contadores; vazias até M16+ chamar o runner.
- [x] Testes: timeout, provedor caindo sem derrubar os demais, dedupe
      (`src/lib/similaridade/__tests__/buscarCandidatosPublicos.test.ts`)
- [x] **Verificação:** os testes de timeout, isolamento e dedupe validados **por mutação** (§9.39) —
      as três guardas (`Promise.allSettled`, `comTimeout`, `deduplicarCandidatos`) foram desligadas
      uma de cada vez e o teste correspondente falhou em todos os três casos; revertido depois.
- [x] **Verificação:** `migrate status` contra produção retorna `up to date` (§9.19) — **aplicada em
      2026-08-07**, com autorização explícita do usuário (CLAUDE.md §8). Executada via
      `supabase db query --linked` (SQL da migration + `INSERT` em `_prisma_migrations` com o
      checksum SHA-256 do arquivo, numa única transação — mesmo padrão do M13), não pela rota
      `/api/admin/migrate` nem pelo CLI do Prisma diretamente. Confirmado por duas consultas
      independentes contra o banco de produção: `_prisma_migrations` lista
      `20260807130150_m15_fonte_referencia` com `finished_at` preenchido (9 de 9 migrations
      aplicadas), e `information_schema.tables` confirma as três tabelas novas
      (`fontes_referencia`, `lotes_ingestao`, `precos_referencia`) presentes.

**Riscos.** Migration com coluna nova em model já consultado → a varredura de `select` acima não é
opcional. Migration só está pronta depois de aplicada em produção (§9.19) — **aplicada e verificada
em 2026-08-07, ver checkbox acima.**

### M16 — Compras.gov: materiais e itens de contratações da 14.133

> **Spike concluído em 2026-08-06 — resultado no §4.1. O milestone mudou de escopo: o prêmio não é
> o módulo de pesquisa de preço, é o `modulo-contratacoes`.** As tarefas abaixo já refletem isso.

**Objetivo.** Fechar a lacuna de material de consumo e TI/equipamentos (cobertura zero hoje) e, de
quebra, obter preço homologado **e** estimado no mesmo registro, sem o N+1 de `/resultados` que o
cliente do PNCP faz desde o M14.0.

- [x] **Spike (a)** — endpoints de catálogo e de preço de material localizados
- [x] **Spike (b)** — envelope paginado confirmado; sem risco de truncamento silencioso
- [x] **Spike (c)** — preço homologado confirmado, com fornecedor vencedor nomeado
- [x] **Spike (d)** — URL de evidência derivável e conferida contra a API do PNCP
- [x] **Spike (e)** — cobertura, latência e limites da API medidos
- [x] Model `ItemCatalogoReferencia` (`prisma/schema.prisma`) — catálogo sem preço, decisão de
      design registrada no §4.2 acima. Migration `20260807145132_m16_item_catalogo_referencia`
      aplicada em **dev** (`prisma migrate dev`); produção fica para depois, com autorização
      explícita (mesmo padrão do M15, §9.19/CLAUDE.md §8).
- [x] Upsert idempotente de `FonteReferencia` "catmat"/"catser" (`src/lib/ingestao/fontesComprasGov.ts`)
- [x] Ingestão do catálogo CATMAT (343.880 itens) para tabela local
      (`src/lib/ingestao/catalogoComprasGov.ts` + `scripts/ingerir-catalogo-compras-gov.ts`) —
      paginação com concorrência limitada (5, CLAUDE.md §9.11), validação Zod na fronteira,
      `LoteIngestao` como rastro de auditoria. Rodar a ingestão completa (688 páginas) em produção
      fica para depois, com autorização explícita (fora do escopo desta execução).
- [x] Migrar o catálogo CATSER da ingestão por request para a mesma tabela (elimina o download de
      3.014 itens a cada cold start em `comprasGov.ts`) — com fallback para o download por request
      enquanto a tabela estiver vazia (ingestão real ainda não rodou em produção), avisado via log;
      perda de recall aceita e documentada (`ItemCatalogoReferencia` não guarda os nomes textuais
      de grupo/classe/subclasse que o catálogo por request expõe).
- [x] Matching local por termo → `codItemCatalogo` sobre o catálogo ingerido
      (`src/lib/similaridade/matchingCatalogoLocal.ts`) — query `ILIKE` parametrizada (Prisma
      `contains`/`mode: "insensitive"`) pelo token mais longo do termo, `take` limitado a 400,
      pontuação final por sobreposição de tokens raizados (reusa `tokenizar`/`raizPlural` de
      `texto.ts`, não `sobreposicaoLexical.ts` — aquele espera `CandidatoSimilaridade[]`, não linha
      de catálogo). Sem índice trigram/full-text — decisão consciente, a chamada de rede ao
      Compras.gov (22–40s a frio) domina o tempo total, não a query local.
- [x] Provedor sobre `modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133` **wireado no
      registry** (`src/lib/similaridade/provedorComprasGovContratacoes.ts`,
      `chave: "compras_gov_contratacoes"` em `REGISTRY_PROVEDORES_PUBLICOS`) — busca por até 5
      códigos candidatos do matching local, janela de 730 dias (mesma convenção de
      `comprasGov.ts`), concorrência limitada a 3 (§9.11), `tipoCandidato: "contratacao_publica"`
      (não `preco_referencia` — é consulta ao vivo, não dado ingerido, ver §3.3/§4.2).
      `identidadeContratacao` preenchido quando `numeroItemPncp` existe, alimentando o dedupe com o
      PNCP. Tabela de catálogo vazia (estado real de produção até a ingestão completa rodar) resulta
      em `[]` rápido, sem erro — o provedor fica um no-op seguro até lá.
- [x] Usar `valorUnitarioResultado`, nunca `valorUnitarioEstimado` (§9.61a) —
      `comprasGovContratacoes.ts`; `valorUnitarioEstimado` só existe no schema Zod de parsing, nunca
      no tipo de saída (confirmado por `grep`, revisão de código e teste de presença — troca por
      engano derrubaria o teste).
- [x] Descartar item sem `temResultado` e contratação cancelada — idem, testado. **Correção de
      2026-08-07:** o campo `dataCancelamentoPncp` citado aqui **não existe** na API real —
      substituído por heurística sobre `situacaoCompraItemNome` (ver nota abaixo).
- [x] Excluir `orgaoEntidadeCnpj === ORGAO_CNPJ` (§9.9) — reusa `cnpjOrgaoProprio()`/`normalizarCnpj()`
      de `src/lib/domain/orgaoProprio.ts` em vez de reimplementar a regra.
- [x] Derivar a URL de evidência de `idContratacaoPNCP` → `pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}`
      — mesmo padrão de `montarUrlEdital()` em `pncp.ts`, testado contra o exemplo real do spike.

**Correção de 2026-08-07 — os quatro itens acima estavam testados contra um fixture errado, não
contra a API real.** Ao retomar o wiring, uma chamada HTTP real (200, `tamanhoPagina=10`,
`dataInclusaoPncpInicial`/`dataInclusaoPncpFinal=2025-01`) e o OpenAPI do backend
(`/v3/api-docs`) revelaram que `comprasGovContratacoes.ts` usava nomes de campo inventados, nunca
confirmados contra a API:
- Parâmetros de data: eram `dataInicial`/`dataFinal`; os reais e **obrigatórios** são
  `dataInclusaoPncpInicial`/`dataInclusaoPncpFinal` — toda chamada real teria devolvido erro.
- `descricaoItem` não existe — o campo real é `descricaoResumida`.
- `orgaoEntidadeRazaoSocial` não existe — removido do tipo de saída.
- `dataCancelamentoPncp` não existe — não há campo de data/flag de cancelamento nesta API.
  Substituído por checagem de `situacaoCompraItemNome` (regex `/cancelad/i`), heurística por não
  haver enum documentado nem exemplo real de item cancelado à mão — sinalizado como tal no código.
- `unidadeMedida` existe (ex. `"Unidade  "`, com espaços à direita) e não estava sendo capturado —
  `CandidatoSimilaridade.unidade` é obrigatório e este cliente não o preenchia.

O fixture de teste (`itemDe()`) usava os mesmos nomes inventados que o código de produção, então a
suíte passava sem exercitar a resposta real — nenhuma revisão anterior (dev, code-reviewer,
verifier) pegou isso porque nenhuma fez uma chamada HTTP de verdade a este endpoint específico
antes de aprovar. As regras de negócio em si (preço homologado, exclusão do próprio órgão,
evidência derivável) continuam corretas — só os nomes de campo de origem mudaram. Corrigido e
recoberto por 22 testes (era 21) antes de prosseguir para o wiring no registry.
- [x] Avaliar `modulo-arp` como fonte adicional (traz `linkAtaPNCP` pronto — ver §4.1) — **decisão:
      adiar para o M20**, mesmo tratamento do Tier B (§2.2). O próprio §4.1a já classificou como
      "candidato adicional", não lacuna — `modulo-contratacoes` cobre o caso geral (item de
      contratação da 14.133) e ata de registro de preços é um subconjunto dele. Sem uso real do
      provedor principal ainda, não há como medir se falta cobertura que só `modulo-arp` fecha;
      construir os dois de uma vez arrisca o mesmo erro da §9.35 (justificativa por plausibilidade,
      não por evidência). Reabrir no M20 se o uso real do `modulo-contratacoes` mostrar lacuna em
      compras via ata.
- [x] Tratar dispersão: o spike encontrou R$ 0,26 e R$ 96,37 para o mesmo código CATMAT — reusa
      `excluirDiscrepantes()` de `src/lib/domain/priceStats.ts` (já existente, não reimplementado),
      aplicado por grupo de `codItemCatalogo` com tolerância `"aquisicao"`, dentro do provedor
      antes de mapear para `CandidatoSimilaridade`. Confirmado por mutação (desligar o filtro faz o
      teste cair) por dois agentes independentes (dev e verifier).
- [ ] **Verificação:** três itens que a Câmara compra, conferidos contra o Painel de Preços na web
- [ ] **Verificação:** a URL de evidência gerada aberta de verdade no navegador (§9.8)

**Tentativa parcial em 2026-08-07 (não fecha os dois itens acima — continuam `[ ]`).** Sem acesso a
navegador real neste ambiente, tentei a verificação mais forte disponível: para o item real
`idContratacaoPNCP: "06272868000127-1-000057/2024"` (codItemCatalogo 611701, "Mesa Reunião
Redonda", capturado numa chamada real ao `modulo-contratacoes` nesta sessão), consultei a **API
oficial de consulta do PNCP** — `pncp.gov.br/api/consulta/v1/orgaos/06272868000127/compras/2024/57`
— fonte independente do Compras.gov, não só um espelho dele. Bateu: mesmo `numeroControlePNCP`,
órgão "CONSELHO REGIONAL DE ENFERMAGEM COREN MA", objeto "aquisição de mobiliário", consistente com
os itens de mobiliário retornados. A página `pncp.gov.br/app/editais/...` (a URL de evidência em
si) devolveu `ECONNRESET` tanto por `curl` quanto por fetch de página — é SPA com proteção
anti-bot, mesmo obstáculo já registrado no spike do M16 (§4.1d). Isso confirma que os **dados por
trás** da evidência são reais e batem, mas não substitui abrir a URL literalmente num navegador
(§9.8 pede exatamente isso, porque formato de URL errado só aparece na renderização real). Não
tentei o Painel de Preços (paineldeprecos.planejamento.gov.br) por ser também um portal
JS-pesado sem API de consulta simples conhecida. Os dois itens seguem como tarefa manual para
quem tiver acesso a navegador.

### M17 — SINAPI

**Objetivo.** Obras e serviços de engenharia — incluindo manutenção predial, que é onde o
Compras.gov admite cobertura baixa.

**Spikes de pesquisa executados em 2026-08-07 — registro completo em
[ApiPlan-M17-spike.md](ApiPlan-M17-spike.md).** Metodologia: cada afirmação tem URL/documento
primário por trás (Notas_SINAPI.pdf, Livro_Metodologias.pdf da Caixa, Lei 14.133, IN 65, Decreto
7.983/2013), acessados nessa data — nada por dedução ou memória do modelo (mesmo princípio do §4.1).

- [x] **Spike:** localizar a publicação vigente da Caixa; confirmar formato, estabilidade,
      granularidade (insumos e composições), recorte por UF, distinção desonerado/não-desonerado,
      competência mensal e URL permanente por competência. Confirmado por fonte primária: localização
      do portal, granularidade insumos×composições (composições é a referência certa para a maioria
      dos itens de pesquisa de preço, não insumos), recorte por UF com a nuance de que cada "UF" é na
      verdade a capital (localidade de referência do IBGE), motivo de negócio do
      desonerado/não-desonerado (regimes tributários diferentes coexistem — Leis 13.670/2018,
      12.844/2013, 13.161/2015, 14.973/2024), estabilidade (**instável, documentado três vezes** —
      2020, 2022, 2025 — em mudança estrutural de layout). **Fechado em 2026-08-07 (continuação):** o
      usuário baixou os dois ZIPs reais de dezembro/2024 (SP, Desonerado/NaoDesonerado) pelo
      navegador — o WAF bloqueia `curl` mesmo com headers de navegador, `429` persistente confirmado
      nesta sessão — e a inspeção do XLSX (via XML interno) confirmou formato (3 relatórios XLSX
      distintos por regime: Insumos, Composições Sintético, Composições Analítico, mais um relatório
      de Família sem distinção de regime), estrutura de coluna de cada um, regime como **ZIP
      inteiramente separado** (não aba/coluna — cada baixa é um regime só) e URL previsível por
      template: `.../sinapi-a-partir-jul-2009-{uf}/SINAPI_ref_Insumos_Composicoes_{UF}_{AAAAMM}_
      {Regime}.zip`. Registro completo na seção 4 de
      [ApiPlan-M17-spike.md](ApiPlan-M17-spike.md). **Ajuste obrigatório antes de codificar:** a
      chave `@@unique` de `PrecoReferencia` (§3.2) precisa incluir o regime — sem isso a segunda
      ingestão (segundo ZIP) colide com a primeira para o mesmo código/competência/UF.
- [x] **Spike:** confirmar o enquadramento legal exato (inciso e redação vigente) contra
      [lei-14133-2021](lei-14133-2021-licitacoes-contratos.md) e a IN 65 — não citar de memória.
      **Achado que corrige uma premissa implícita do plano: a IN 65/2021 explicitamente não regula
      obras e serviços de engenharia** (art. 1º §1º da própria IN, confirmado por dupla fonte
      primária independente — gov.br/compras e PDF de universidade, texto idêntico). Quem rege é
      diretamente a **Lei 14.133, art. 23 §2º, inciso I** — e não é "fonte prioritária entre várias
      combináveis" como no §1º (bens/serviços gerais): o §2º estabelece uma **ordem** a esgotar
      (Sicro/Sinapi no topo, depois tabela/mídia especializada, depois contratações similares, depois
      NF-e). O vínculo histórico do dever da Caixa de manter o SINAPI vem do Decreto 7.983/2013
      (vigência formal pós-14.133 não confirmada, irrelevante para uso interno de priorização). Onde
      o CLAUDE.md/PRD citarem "IN 65" como base para hierarquia de fonte em obras/engenharia, a
      citação correta passa a ser Lei 14.133 art. 23 §2º.
- [x] Schema: campo `regime` em `PrecoReferencia` + chave única regravada (bloqueador identificado
      pelo spike, ver nota no §3.2 acima) — migration `20260807195603_m17_preco_referencia_regime`
      aplicada em dev, testes do runner cobrindo o campo (inclusive verificação por mutação)
- [x] Runner rejeita lote com cabeçalho inesperado e **falha visivelmente** (§9.22) —
      `validarCabecalhoSinapi()` em `src/lib/ingestao/sinapi.ts`, compara as 12 colunas do relatório
      de Composições Sintético uma a uma contra o layout medido no spike; layout diferente rejeita o
      lote inteiro (não tenta adivinhar). Confirmado por mutação.
- [x] Runner sinaliza/rejeita lote **estruturalmente válido mas com preços zerados em massa** —
      precedente real: a Caixa publicou os relatórios de out/2025 a dez/2025 com custos zerados por
      falha de envio do IBGE ("Nota 12/2025 nº 01"), sanado só em 22/12/2025. "Cabeçalho ok" não é
      garantia de "preço utilizável". `detectarZeramentoEmMassa()` (limiar 50% das linhas com custo
      ≤ 0) + hook opcional `validarLinhas` novo no runner genérico (`runner.ts`) — checagem sobre o
      **conjunto** de linhas, separada da rejeição por linha que `normalizarLinha` já fazia (sem
      isso, um lote 100% zerado apareceria como "todas as linhas rejeitadas" sem sinalizar causa
      sistêmica). Confirmado por mutação; hook é genérico, reutilizável por fonte futura com o mesmo
      problema.
- [x] Parser do relatório de **Composições Sintético** (`src/lib/ingestao/sinapi.ts`) — decisão do
      spike (§1.3): composição é a referência certa para pesquisa de preço, não insumo avulso;
      "Sintético", não "Analítico" (que traz a receita de insumos, útil para decomposição, não para
      a série principal). `parsearLinhasSinapi`/`normalizarLinhaSinapi` extraem competência e
      localidade do cabeçalho de contexto (linha 3 do arquivo), tratam separador de milhar
      brasileiro (`5.602,92`) e recebem `regime` como parâmetro externo (não é coluna da planilha —
      é o ZIP de origem que determina, confirmado no spike §4). **Testado contra os dois tipos de
      fixture** (CLAUDE.md §9.46): sintética gerada em memória (`XLSX.utils.aoa_to_sheet`, casos de
      borda) e o **arquivo real de dezembro/2024** baixado pelo usuário
      (`src/lib/ingestao/__fixtures__/sinapi_composicoes_sintetico_sp_202412.xlsx`, 7.829 linhas,
      commitado no repo para reprodutibilidade) — 24 testes, incluindo verificação de que >99% das
      linhas reais normalizam com sucesso e que a competência real (sem episódio de zeramento) não
      dispara falso positivo na guarda nova.
- [x] `FonteReferencia` "sinapi" cadastrada via upsert idempotente
      (`src/lib/ingestao/fontesSinapi.ts`, `garantirFonteSinapi()`) — `baseLegal` já com o inciso
      exato confirmado pelo spike (Lei 14.133 art. 23 §2º I), ao contrário do CATMAT/CATSER do M16
      (que registram o enquadramento como "não verificado").
- [x] Função orquestradora `ingerirSinapi()` (`src/lib/ingestao/ingerirSinapi.ts`) ligando
      `fontesSinapi.ts` + `sinapi.ts` + `runner.ts` — decidido com o usuário: **upload manual**, não
      download automático. O WAF da Caixa bloqueia acesso automatizado mesmo com headers de
      navegador completos (confirmado nesta sessão, `429` persistente); `baixar()` do runner
      genérico aqui só embrulha o `Buffer` já recebido por upload, sem `fetch`. A competência é
      **extraída do arquivo** (cabeçalho de contexto), não digitada pelo operador — evita divergência
      entre nome do arquivo e conteúdo. Rota administrativa `POST /api/admin/ingerir-sinapi`
      (multipart: campos `arquivo` + `regime`), mesmo padrão de auth fail-closed dos vizinhos
      (`ADMIN_MIGRATE_SECRET`, CLAUDE.md §9.45). 6 + 7 testes (orquestrador + rota, incluindo
      ingestão de ponta a ponta contra o arquivo real de 7.829 linhas); `pnpm build` confirma a rota
      compilando e listada no build de produção.
- [x] Provedor de consulta `buscarCandidatosSinapi()` (`src/lib/similaridade/provedorSinapi.ts`),
      wireado no registry (`chave: "sinapi"` em `REGISTRY_PROVEDORES_PUBLICOS`) — diferente do
      provedor Compras.gov (M16), **sem chamada de rede**: os dados já foram ingeridos localmente,
      então é consulta direta a `PrecoReferencia` (matching por texto livre, mesmo princípio de duas
      fases de `matchingCatalogoLocal.ts`: token mais distintivo filtra no banco, sobreposição de
      tokens pontua em memória — mas aqui a linha já **é** o candidato final, com preço, não um
      código intermediário que precisa de uma segunda consulta externa). **Decisão de design:** só a
      **competência mais recente por código** entra no resultado (de-duplicação em memória sobre
      `orderBy: competencia desc`) — sem isso, um código ingerido em várias competências apareceria
      repetido na série com valores de meses diferentes. Guarda explícita descarta candidato sem
      `urlEvidencia` (nunca deveria acontecer depois do achado abaixo, mas não depende disso
      silenciosamente — confirmado por mutação). Habilitado mesmo com a tabela vazia em produção —
      no-op seguro, mesmo padrão do M16. `tipoCandidato: "preco_referencia"` (valor único do M15,
      §3.3 — não um valor por fonte).
      **Achado durante o design do provedor, corrigido no parser:** `normalizarLinhaSinapi`
      (`sinapi.ts`) não preenchia `urlEvidencia` — todo candidato SINAPI ficaria sem evidência
      acessível e não poderia alimentar a estimativa (CLAUDE.md §9.8). Corrigido: preenche com a URL
      do portal oficial de downloads (`caixa.gov.br/site/Paginas/downloads.aspx`) — mesma URL para
      toda a competência, já que o spike confirmou que não há link estável por item/registro (§1.6).
- [ ] Exibir competência, regime de desoneração **e localidade de referência (capital, não o
      estado)** de forma explícita na UI (os três já são capturados pelo parser em
      `metadados`/`regime`/`dataReferencia`/`uf` — falta o componente que os renderiza)
- [ ] **Verificação:** uma competência importada, contagem conferida contra o arquivo de origem —
      parser já testado contra o arquivo real (24 testes acima), mas isto é sobre a ingestão de
      ponta a ponta (banco), que depende do orquestrador acima
- [ ] **Verificação:** três composições conferidas manualmente contra a planilha oficial

**Peso legal (corrigido pelo spike).** O SINAPI não deriva peso da IN 65/2021 — ela não se aplica a
obras/engenharia. O peso vem diretamente da Lei 14.133 art. 23 §2º I, que o coloca como **primeiro
parâmetro a esgotar** (não apenas prioritário) para custo de obras e serviços de engenharia, à frente
de tabela/mídia especializada e de contratações similares. Município sem recurso da União pode usar
"outros sistemas de custos" (§3º do mesmo artigo — abre a porta para o CADTERC do M18), mas isso não
dispensa o SINAPI como parâmetro válido quando não há recurso federal envolvido.

**Riscos (ampliados pelo spike).** Layout de planilha muda entre competências e quebra em silêncio —
**risco real e recorrente, não teórico**: quatro mudanças estruturais/de classificação documentadas
em seis anos (2020, 2022, formato 2025, classificação 2025), fora retificações pontuais. Não há URL
previsível por competência — o runner de ingestão provavelmente precisa de navegação/scraping da
página de downloads a cada execução, não montagem de URL por template mês/ano. E lote pode vir
estruturalmente válido com preços zerados em massa (precedente out-nov/2025), que é falha de dado,
não de formato — o runner precisa distinguir os dois casos.

### M18 — CADTERC / BEC-SP

**Objetivo.** Serviços continuados: limpeza, vigilância, recepção, copeiragem. É a lacuna que o
comentário do nosso próprio código admite.

- [x] **Spike — este milestone pode não sobreviver a ele.** Verificar se a publicação atual é
      legível por máquina, qual a periodicidade e se há URL estável por caderno. **Concluído em
      2026-08-07 — resultado completo em [`ApiPlan-M18-spike.md`](ApiPlan-M18-spike.md). O
      milestone não sobreviveu ao spike, como o próprio plano previu como possível**: só PDF de
      leitura humana (sem CSV/XLSX/API), periodicidade irregular por caderno (não uma competência
      mensal única) e, o achado mais forte, **2 dos 4 links de caderno testados já devolviam 404
      na própria página oficial** no momento do spike — evidência medida, não hipótese, de que não
      há URL estável por caderno.
- [x] **Decisão com o usuário depois do spike, não antes:** (a) ingestão semiautomática com
      conferência humana; (b) cadastro manual dos postos relevantes como tabela interna, tratando o
      CADTERC como referência documental; (c) descartar. **Registrada como recomendação do spike,
      não como decisão executada** — este agente não tem acesso direto ao usuário nesta execução;
      a recomendação (descartar ingestão automática; considerar cadastro manual como trabalho
      futuro separado, sujeito a demanda real) está em `ApiPlan-M18-spike.md` §6-7, aguardando
      confirmação do usuário antes de qualquer código de cadastro ser escrito.
- [ ] Ingestão ou cadastro, conforme a decisão acima — **não iniciado**: a decisão do usuário sobre
      (b) vs. (c) ainda não foi tomada: ver `ApiPlan-M18-spike.md` §7.
- [ ] Gerar automaticamente a justificativa de uso de tabela estadual junto com a fonte — depende
      do item acima; não faz sentido sem uma fonte real cadastrada.
- [ ] **Verificação:** um caderno conferido posto a posto contra o documento oficial — não
      aplicável enquanto não houver ingestão/cadastro.

**Peso legal.** Tabela de referência **estadual**, não federal — usável, mas com enquadramento mais
fraco que o do SINAPI na IN 65, e provavelmente exigindo justificativa registrada no processo. O
sistema deve gerar essa justificativa, não deixar para o pesquisador lembrar.

### M19 — Qualificação de fornecedor

**Objetivo.** Não é preço: é o outro lado da conformidade. Hoje o checklist de proposta e o score de
fornecedor não consultam nenhuma base oficial.

- [x] Cliente de consulta a CEIS/CNEP (sanções, via Portal da Transparência — token gratuito) —
      `src/lib/integracoes/portalTransparencia.ts`
- [x] Consulta de situação cadastral de CNPJ — `src/lib/integracoes/situacaoCadastralCnpj.ts`
      (BrasilAPI, ver §4.3 para o porquê da escolha)
- [x] Gravar o resultado **com a data da consulta** — model novo `QualificacaoFornecedor`
      (histórico, um registro por consulta, nunca sobrescrito) + espelho em
      `Fornecedor.statusQualificacao` e `Proposta.statusQualificacaoFornecedor`. Não foi plugado em
      `HistoricoCotacao` porque aquele model é sobre *resposta a cotação* (SLA/prazo), um eixo
      diferente de *qualificação regulatória do fornecedor* — misturar os dois obrigaria a linha de
      `HistoricoCotacao` a existir mesmo sem cotação nenhuma. Ver §4.3.
- [x] Alerta na proposta quando o fornecedor estiver sancionado — `registrarProposta` grava
      `statusQualificacaoFornecedor` na proposta e emite log de alerta quando o status é
      `sancionado`/`cadastro_irregular`
- [x] Guarda de token: ausência **nega** a consulta e sinaliza (§9.45) — `if (!token)` em
      `consultarSancoesCnpj`, nunca `if (token && ...)`
- [ ] **Verificação:** um fornecedor sancionado conhecido é detectado — **não verificado contra a
      API real** (ver limitação em §4.3: obtenção de token do Portal da Transparência é cadastro
      manual por e-mail, fora do alcance deste ambiente). Testado com fixture MOCK documentado
      como tal em `portalTransparencia.test.ts`
- [x] **Verificação:** por mutação, remover o token e confirmar que a consulta é negada, não
      pulada — confirmado em duas camadas (cliente e domínio/action), ver §4.3

### M20 — Reavaliação do Tier B e estudo de sobreposição

**Objetivo.** Decidir com dado, não com panorama.

- [ ] Estudo de sobreposição PNCP × plataformas comerciais, para fechar ou reabrir a decisão da
      §2.3 com número
- [ ] Avaliação de LICITAÇÕES-e e estaduais à luz do que o uso real de M16–M18 mostrar faltando
- [ ] BPS/CMED — apenas se surgir demanda concreta de objeto de saúde
- [ ] *(opcional)* Medição de sobreposição PNCP × LicitaCon descrita na §2.5 — só vale o esforço se
      o uso real apontar **descoberta** como gargalo, e não cobertura de preço

### 4.1 Registro do spike do M16 — executado em 2026-08-06

Medido contra a API real (`https://dadosabertos.compras.gov.br`), a partir do OpenAPI em
`/v3/api-docs`. Nada aqui é dedução: cada linha tem uma chamada por trás.

**(a) Endpoints — existem, e são mais do que se procurava.** O lado de materiais espelha o de
serviços, mas o levantamento revelou dois módulos melhores que o alvo original:

| Módulo | O que é | Serve para |
|---|---|---|
| `modulo-material/4_consultarItemMaterial` | Catálogo CATMAT — **343.880 itens** | Ingestão do catálogo |
| `modulo-pesquisa-preco/1_consultarMaterial` | Preços praticados por código | Fatia fina — ver cobertura |
| **`modulo-contratacoes/2_` e `3_`** | **Itens de contratações da 14.133, com número de controle PNCP** | **O provedor principal** |
| `modulo-arp/1_`, `2_` | Atas de registro de preços por item, com `linkAtaPNCP` e `linkCompraPNCP` prontos | Candidato adicional |

**(b) Paginação — envelope, sem truncamento silencioso.** Toda resposta vem como
`{ resultado, totalRegistros, totalPaginas, paginasRestantes }`. `tamanhoPagina` aceita 10 a 500 e
rejeita fora da faixa com mensagem explícita. O modo de falha do §9.61b **não se aplica** a esta API
— ao contrário do PNCP, aqui dá para saber quando acabou.

**(c) Preço — homologado, e melhor do que se esperava.** Um registro real do
`modulo-contratacoes` traz os dois valores lado a lado:

```
codItemCatalogo: 331791   "CAPA ENCADERNAÇÃO, MATERIAL PVC, TIPO A3..."
valorUnitarioEstimado:  1,69      ← orçamento antes do certame
valorUnitarioResultado: 1,00      ← homologado    (41% de diferença)
situacaoCompraItemNome: "Homologado"    temResultado: true
nomeFornecedor: "VM COMERCIO DE PAPEL LTDA"   codFornecedor: 49426829000140
```

Isso resolve num único request o que o cliente do PNCP faz hoje com N+1 chamadas a
`/itens/{n}/resultados` (M14.0). O `modulo-pesquisa-preco` também devolve preço praticado — cada
registro tem fornecedor vencedor nomeado, marca e `dataResultado`, o que um preço estimado nunca
tem.

**(d) Evidência — derivável e conferida.** O campo `idContratacaoPNCP` vem no formato
`13672605000170-1-000119/2025`. Consultado na API do PNCP
(`/api/consulta/v1/orgaos/13672605000170/compras/2025/119`, HTTP 200), bate exatamente:
`numeroControlePNCP` idêntico, órgão "MUNICIPIO DE UNA", objeto "materiais de expediente". A mesma
resposta ainda traz `linkSistemaOrigem` apontando para o Comprasnet com o `idCompra` que o
Compras.gov havia devolvido — duas evidências independentes que se confirmam.
**Pendente:** a página `pncp.gov.br/app/editais/...` não respondeu ao `curl` (é SPA, provavelmente
bloqueio de user-agent). Só a API foi validada; abrir a página no navegador continua na lista de
verificação do M16 (§9.8).

**(e) Cobertura e limites — medidos.**

| Medida | Valor | Consequência |
|---|---|---|
| Universo CATMAT | 343.880 itens | Baixar por request é inviável; ingestão é obrigatória |
| Busca por texto livre | **Não existe** — `descricaoItem` só casa a descrição inteira, exata (0 resultados para "PAPEL", 1 para a string completa) | Matching tem de ser local, como já é para CATSER |
| Densidade — classe 7510 (artigos de escritório), 12 meses | **41.038 itens homologados** de 51.372 | Cobertura real e densa |
| Densidade — `modulo-pesquisa-preco`, por item | 3 de 10 itens tinham qualquer preço (2, 4 e 8 registros) | Fatia fina demais para ser o provedor principal |
| Janela de consulta | **Máximo 365 dias**, erro explícito acima disso | Ingestão por janelas móveis |
| Latência — consulta fria | **22 a 40 s** | **Inviável ao vivo em serverless** (§9.11) |
| Latência — consulta repetida | 0,2 a 0,4 s | Há cache do lado deles, mas não dá para contar com ele |
| Filtro regional | `estado`/`codigoMunicipio` no `modulo-pesquisa-preco`; **ausente** no `modulo-contratacoes` | Recorte por UF precisa ser local no provedor principal |

**Veredito.** O M16 sobrevive ao spike com folga e fica **mais valioso** do que o plano previa. Duas
consequências que não estavam escritas: a decisão de ingestão (§1) deixa de ser preferência e passa
a ser imposição técnica, porque 40 s de consulta fria não cabem em função serverless; e o
`modulo-contratacoes` é candidato a **substituir parte do cliente do PNCP**, não só a complementá-lo
— avaliar isso no M16, sem desmontar nada antes de comparar resultado a resultado.

**Dado incômodo que o spike revelou.** Para o mesmo código CATMAT 331791 apareceram preços de
R$ 0,26, R$ 1,00, R$ 29,00, R$ 68,32, R$ 86,77 e R$ 96,37. Parte é unidade de fornecimento
divergente (pacote × unidade), parte é erro de digitação do órgão comprador. Nenhum ingerido às
cegas: tratamento de dispersão é entrega do M16, não refinamento posterior.

### 4.2 Decisão de design — o catálogo CATMAT não cabe em `PrecoReferencia`

Verificado contra a API real em 2026-08-07, ao retomar o M16 depois do merge do M15:

```
curl "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=500"
→ { "resultado": [{ "codigoItem": 206504, "codigoClasse": 7110, "nomeClasse": "MOBILIÁRIO PARA
    ESCRITÓRIO", "descricaoItem": "CADEIRA ESCRITÓRIO, ...", "statusItem": true, ... }, ...],
    "totalRegistros": 343880, "totalPaginas": 688, "paginasRestantes": 687 }
```

**Nenhum campo de preço.** O catálogo é só identidade do item (código, descrição, classe,
`statusItem` ativo/inativo) — confirma o texto do §4.1(e) ("busca por texto livre não existe;
matching tem de ser local"), mas expõe uma lacuna que o plano não tinha registrado: o schema do
M15 define `PrecoReferencia.valorUnitario` e `.competencia` como `NOT NULL`
(`prisma/schema.prisma:654-655`), e o comentário do próprio model diz "registro de preço de uma
fonte de referência **ingerida**". Um item de catálogo sem preço não é esse tipo de registro —
forçá-lo na tabela exigiria inventar um `valorUnitario`/`competencia` sentinela, o que é
exatamente o tipo de gambiarra que a §1 do CLAUDE.md proíbe ("nenhum preço entra na estimativa sem
vínculo a fonte, data e evidência"): um preço fictício numa coluna `NOT NULL` é indistinguível de
um preço real para qualquer consulta futura que esqueça de filtrar.

**Decisão:** o catálogo (CATMAT e CATSER) ganha um model próprio, `ItemCatalogoReferencia` —
identidade para matching local, sem preço. Preço continua vindo só de fonte que efetivamente
publica preço (o provedor `modulo-contratacoes` já construído, ou uma futura ingestão de
`modulo-pesquisa-preco`), nunca do catálogo. Migration em dev primeiro, aplicação em produção só
com autorização explícita (mesmo padrão do M15, §9.19/§9.20/CLAUDE.md §8).

### 4.3 Registro do M19 — executado em 2026-08-07

Medido contra a API real de duas fontes distintas: `api.portaldatransparencia.gov.br` (CEIS/CNEP) e
`brasilapi.com.br` (situação cadastral). Nada aqui é dedução de memória (CLAUDE.md §9.63).

**(a) CEIS/CNEP — Portal da Transparência (CGU).** Endpoints confirmados pelo OpenAPI real
(`GET /v3/api-docs`), não adivinhados:

```
GET /api-de-dados/ceis?codigoSancionado={cnpj}&pagina=1
GET /api-de-dados/cnep?codigoSancionado={cnpj}&pagina=1
Header: chave-api-dados: <token>
```

Resposta é array nu (`CeisDTO[]`/`CnepDTO[]`) — sem envelope de paginação documentado no
`securitySchemes`, mas o parâmetro `pagina` é obrigatório, então o cliente assume paginação e lê só
a primeira página (suficiente para o caso de uso: existe/não existe sanção; paginação completa fica
como próximo passo se o volume por CNPJ um dia justificar). Campos usados
(`sancionado.nome`, `tipoSancao.descricaoResumida`, `orgaoSancionador.nome`, `dataInicioSancao`,
`dataFimSancao`, `numeroProcesso`, `linkPublicacao`) vêm do schema `CeisDTO`/`CnepDTO` do OpenAPI.

Autenticação confirmada por chamada real: sem header `chave-api-dados`, HTTP 401 com corpo
`{"Erro na API": "Chave de API não informada!..."}`; com token inválido, HTTP 401 com
`{"Erro na API": "Chave de API inválida!"}` — mesma família de erro, mensagens diferentes,
confirmando que o mecanismo é o `apiKey` em header declarado no `securitySchemes`, não Bearer.

**Limitação registrada explicitamente:** obter um token de produção do Portal da Transparência é
cadastro manual por e-mail (`portaldatransparencia.gov.br/api-de-dados/cadastrar-email`) — não há
endpoint de autoatendimento, e este ambiente de execução não tem acesso a caixa de e-mail nem
capacidade de completar esse cadastro. **Não foi possível consultar um CNPJ real e confirmar um
fornecedor sancionado contra a API viva.** O formato de requisição/resposta foi validado contra o
OpenAPI publicado e contra o comportamento real de erro (401 nos dois casos de token
ausente/inválido); o caminho de sucesso com resultado não-vazio permanece **hipótese não
verificada ao vivo** — mesmo status que a §9.63 exige declarar explicitamente. O teste de "fornecedor
sancionado detectado" usa um fixture com o formato do schema OpenAPI real, mas conteúdo (nome,
órgão, sanção) inventado — documentado como MOCK no cabeçalho do teste, não como caso real.

**(b) Situação cadastral de CNPJ — decisão de fonte.** Avaliadas três opções:

| Fonte | Token | Notas |
|---|---|---|
| Receita Federal (API oficial) | Sim, pago/restrito | Sem endpoint público gratuito conhecido para este uso |
| Minha Receita | Não | Faz proxy síncrono ao site da Receita a cada chamada — mais sujeita a instabilidade sob carga, schema menos documentado |
| **BrasilAPI** (escolhida) | **Não** | Infraestrutura própria, schema documentado, `situacao_cadastral`/`descricao_situacao_cadastral` estruturados |

Confirmado por chamada real (`GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, só dígitos):

- CNPJ existente (`00000000000191`, Banco do Brasil — CNPJ público, usado só como amostra de
  formato): HTTP 200, `descricao_situacao_cadastral: "ATIVA"`, `situacao_cadastral: 2`,
  `data_situacao_cadastral`, `razao_social`.
- CNPJ inexistente (`00000000000000`): HTTP 404,
  `{"message": "...", "type": "not_found", "name": "NotFoundError"}`.

Sem guarda de token — a BrasilAPI é gratuita e sem autenticação, então **não** compete com a mesma
exigência fail-closed de credencial que CEIS/CNEP tem; o cliente ainda assim nunca inventa um
resultado quando a chamada falha (erro de rede/formato vira `encontrado: false`, nunca "ATIVA"
silencioso).

**(c) Onde o resultado é gravado.** Novo model `QualificacaoFornecedor` (histórico completo, um
registro por consulta, com `dataConsulta`) + dois campos-espelho:
`Fornecedor.statusQualificacao` (consulta mais recente, para listar/filtrar sem subquery) e
`Proposta.statusQualificacaoFornecedor` (o que valia no momento em que a proposta foi registrada).
Novo enum `StatusQualificacao`: `regular` | `sancionado` | `cadastro_irregular` | `nao_verificado`.
`nao_verificado` é tanto o estado inicial quanto o resultado de uma consulta negada — nunca
confundido com "regular" (regra de domínio em `avaliarQualificacao`,
`src/lib/domain/qualificacaoFornecedor.ts`, prioridade: sanção > cadastro irregular > não
verificado > regular).

Migration `20260807190000_m19_qualificacao_fornecedor` escrita manualmente (não gerada por
`prisma migrate dev`): Docker Desktop não estava acessível neste ambiente de execução (serviço
parado, requer elevação para iniciar, fora do escopo autorizado) e não havia `.env` com banco de
dev configurado. O SQL foi conferido linha a linha contra o padrão das migrations anteriores do
projeto. **Aplicada em produção em 2026-08-08**, com autorização explícita do usuário (CLAUDE.md
§8), via `POST /api/admin/migrate` (mesmo canal do M15/M16, CLAUDE.md §9.7) — junto com
`20260807195603_m17_preco_referencia_regime` (M17, pendente havia mais tempo, aplicada na mesma
chamada porque a rota aplica todas as pendentes de uma vez). Confirmado por `GET
/api/admin/migrate` logo em seguida: `pendentes: []`, as 12 migrations do projeto em `aplicadas`
(§9.19 — nunca deu por pronta só pela ausência de erro no POST).

**(d) Verificação por mutação (§9.39/§9.45/§9.53).** A guarda fail-closed foi testada em duas
camadas, cada uma com a mutação inversa aplicada e revertida:

1. `consultarSancoesCnpj` (cliente): mutação temporária trocou `if (!token) return negada` por
   `return { negada: false, sancoes: [] }` — os dois testes que afirmam "nega sem token" caíram
   (`expected false to be true`, `expected {...} to not deeply equal {...}`), confirmando que a
   asserção detecta a regressão. Revertida antes do commit.
2. `avaliarQualificacao` (domínio) + `qualificarFornecedor` (action): mutação temporária desligou
   o ramo `consultaSancoesNegada` (`if (false && ...)`) — os testes "NUNCA 'regular'" caíram nas
   duas camadas (`expected 'regular' to be 'nao_verificado'`), confirmando que tanto a regra de
   negócio quanto a action que a invoca protegem a garantia ponta a ponta. Revertida antes do
   commit.

**Pendências explícitas para quando houver token real:** (1) validar o caminho de sucesso de
`consultarSancoesCnpj` com uma chamada real a um CNPJ sancionado conhecido; (2) rodar
`prisma migrate dev` contra um banco real para gerar a migration pelo caminho normal e comparar
com a escrita manualmente. (3) — aplicar a migration em produção — **concluída em 2026-08-08**,
ver nota acima.

---

## 5. Regras deste plano herdadas do CLAUDE.md §9

Registradas aqui porque este plano é, por natureza, o tipo de trabalho que já as violou antes.

1. **Fonte sem URL de evidência acessível não alimenta estimativa** (§9.8). Validar abrindo a URL
   gerada, não conferindo que a request original teve 200.
2. **Toda busca continua excluindo o CNPJ do próprio órgão** (§9.9). Vale para cada provedor novo,
   não só para o PNCP — verificar no código de cada um, porque lição documentada não é lição
   implementada (§9.33).
3. **Lista nua sem envelope é suspeita de truncamento silencioso** (§9.61b). Paginar até a página
   vir incompleta e conferir contra um caso grande conhecido.
4. **Preço de referência é o efetivamente contratado, não o estimado** (§9.61a). Aplicar a pergunta
   a cada fonte nova antes de aceitá-la.
5. **Resposta externa é validada com Zod na fronteira** (§ convenções + §9.12).
6. **Chamadas por item rodam com concorrência limitada** (§9.11).
7. **Migration só está pronta quando aplicada em produção** (§9.19), e coluna nova em model já
   consultado exige varredura de `select` (§9.46) — inclusive nas relações aninhadas.
8. **Guarda de configuração ausente nega, nunca libera** (§9.45).
9. **Suíte verde com Prisma mockado não diz nada sobre compatibilidade de schema** (§9.46). Fonte
   nova precisa de ao menos um teste contra a API/arquivo real, ainda que manual e registrado.
10. **Teste de ausência só vira garantia depois da mutação inversa** (§9.53, §9.56).

## 6. Ordem e dependências

```
M15 (fundação) ──┬── M16 Compras.gov ──┐
                 ├── M17 SINAPI ───────┼── M20 reavaliação
                 ├── M18 CADTERC ──────┘
                 └── M19 fornecedor
```

M15 é pré-requisito de todos. M16–M19 são independentes entre si e podem ser reordenados conforme a
urgência do processo real que estiver na mesa. A ordem sugerida (M16 → M17 → M18) segue custo
crescente e certeza decrescente: o M16 está **confirmado por spike** (§4.1), o SINAPI é provável, o
CADTERC pode não sobreviver ao seu.

**Estado em 2026-08-06:** 5 tarefas concluídas (as cinco do spike do M16), 50 pendentes.

**Estado em 2026-08-07:** 18 tarefas concluídas (as cinco do spike do M16 + 13 do M15 — fundação
completa exceto a aplicação da migration em produção, que exige autorização do usuário fora do
escopo desta execução), 37 pendentes.

**Estado em 2026-08-07 (continuação — fundação de catálogo do M16):** +4 tarefas concluídas
(`ItemCatalogoReferencia`, upsert de `FonteReferencia` catmat/catser, ingestão paginada do CATMAT,
migração do CATSER para a tabela local com fallback) — 22 concluídas, 33 pendentes.

**Estado em 2026-08-07 (continuação — wiring do provedor no registry):** +9 tarefas concluídas
(matching local, provedor wireado, as quatro regras de negócio do cliente re-verificadas contra a
API real após a correção da §9.63, `modulo-arp` decidido/adiado, tratamento de dispersão) —
**31 concluídas, 26 pendentes**. Nesse meio-tempo, uma verificação contra a API real revelou que o
cliente `comprasGovContratacoes.ts` (mergeado antes, "verificado" por duas rodadas de revisão) usava
nomes de parâmetro/campo inventados — corrigido, com lição nova no CLAUDE.md (§9.63). O que falta do
M16: a ingestão completa do CATMAT (688 páginas) em produção — exige autorização explícita do
usuário — e as duas verificações manuais finais (3 itens conferidos contra o Painel de Preços na
web; URL de evidência aberta de verdade no navegador).

**Estado em 2026-08-07 (continuação — spikes de pesquisa do M17, sem código):** +2 tarefas concluídas
(os dois spikes do M17, ambos `[x]`) — **33 concluídas, 24 pendentes**. Achados que corrigem premissas
do plano: a IN 65/2021 não regula obras/engenharia — o SINAPI deriva peso diretamente da Lei 14.133
art. 23 §2º I; e o schema de `PrecoReferencia` do M15 precisa de um campo `regime` antes do runner do
SINAPI (desonerado/não-desonerado são ZIPs separados, não cobertos pela chave única atual). Formato
de arquivo, estrutura de colunas e URL por template confirmados por inspeção direta de dois ZIPs reais
(baixados pelo usuário via navegador — WAF bloqueia acesso automatizado mesmo com headers de browser).
Registro completo em [ApiPlan-M17-spike.md](ApiPlan-M17-spike.md).

**Estado em 2026-08-07 (continuação — schema do M17, TDD):** +1 tarefa concluída (campo `regime` em
`PrecoReferencia`, `[x]`) — **34 concluídas, 23 pendentes**. Teste escrito antes da implementação
(fase vermelha confirmada), migration `20260807195603_m17_preco_referencia_regime` aplicada em dev
(`migrate status`: `Database schema is up to date!`), garantia validada por mutação (§9.39). Suíte
completa (717 testes), typecheck e lint verdes após a mudança. Produção fica para quando o runner do
SINAPI for escrito, com autorização explícita.

**Estado em 2026-08-07 (continuação — parser e guardas do M17, TDD):** +4 tarefas concluídas
(`FonteReferencia` sinapi, parser de Composições Sintético, guarda de cabeçalho inesperado, guarda
de zeramento em massa — todas `[x]`) — **38 concluídas, 19 pendentes**. TDD em todas as peças: teste
escrito antes da implementação, cada guarda nova confirmada por mutação (§9.39). Parser testado
contra fixture sintética **e** o arquivo real de dezembro/2024 baixado pelo usuário (7.829 linhas,
commitado como fixture em `src/lib/ingestao/__fixtures__/` — CLAUDE.md §9.46). Hook `validarLinhas`
novo no runner genérico (`runner.ts`) é reutilizável por qualquer fonte futura com o mesmo problema
de falha sistêmica no agregado. Suíte completa (737 testes), typecheck e lint verdes. **Falta antes
da ingestão real:** função orquestradora ligando `fontesSinapi.ts` + `sinapi.ts` + `runner.ts` —
depende de decidir o mecanismo de baixa (o WAF da Caixa bloqueia acesso automatizado mesmo com
headers de navegador, confirmado nesta sessão; provavelmente upload manual, não `fetch` direto).

**Estado em 2026-08-07 (continuação — orquestrador e rota administrativa do M17):** +1 tarefa
concluída (`[x]`) — **39 concluídas, 18 pendentes**. Decidido com o usuário: upload manual (a
tentativa de download automatizado nesta mesma sessão confirmou o bloqueio do WAF mesmo com headers
completos de navegador). `ingerirSinapi()` liga as três peças; rota `POST /api/admin/ingerir-sinapi`
recebe o arquivo por multipart. TDD ponta a ponta, incluindo teste de ingestão real contra o arquivo
de 7.829 linhas com mocks de banco. `pnpm build` confirma a rota no build de produção. **Achado de
infraestrutura de teste, não do código de produção:** `Request`/`FormData` do ambiente jsdom (usado
pela suíte) serializam `File` como string em vez do objeto real — contornado mockando
`request.formData()` diretamente no teste da rota, documentado no próprio arquivo de teste para não
ser redescoberto. Suíte completa: 750/751 (1 falha pré-existente e não relacionada,
`painelPrecos.test.ts`, timeout de rede — confirmado por `git log` que nenhum arquivo daquele módulo
foi tocado nesta sessão), typecheck e lint verdes. Falta do M17: provedor de consulta (wiring no
registry de similaridade), exibição na UI, e as duas verificações finais.

**Estado em 2026-08-07 (continuação — spike do M18/CADTERC, em worktree isolado, em paralelo ao
M17 acima):** +2 tarefas concluídas (spike e recomendação registrados) — **41 concluídas, 16
pendentes**. O milestone **não sobreviveu ao spike**, exatamente como o plano previu ser possível:
o CADTERC hoje é só PDF de leitura humana, sem CSV/XLSX/API, com periodicidade irregular por
caderno e — achado mais forte — 2 dos 4 links de caderno testados já devolviam 404 na própria
página oficial no momento do spike. Recomendação registrada em `ApiPlan-M18-spike.md`: descartar
ingestão automática; cadastro manual como opção (b) fica como trabalho futuro sujeito a demanda
real, não decidido nesta execução por não haver acesso direto ao usuário. Nenhum model, provedor ou
parser foi implementado — a fundação do M15 já comporta a opção (b) se e quando decidida.

**Estado em 2026-08-07 (continuação — provedor de consulta do M17):** +1 tarefa concluída (`[x]`) —
**42 concluídas, 15 pendentes**. `buscarCandidatosSinapi()` wireado no registry, consulta direta a
`PrecoReferencia` sem chamada de rede (diferente do M16), de-duplicação por competência mais recente
por código. Achado corrigido no parser: `normalizarLinhaSinapi` não preenchia `urlEvidencia` — todo
candidato SINAPI ficaria sem evidência acessível (CLAUDE.md §9.8); agora preenche com a URL do portal
oficial de downloads. TDD ponta a ponta, guarda de `urlEvidencia` confirmada por mutação. Suíte
completa: 758/759 (mesma falha pré-existente e não relacionada em `painelPrecos.test.ts`), typecheck,
lint e build verdes. Falta do M17: exibição de competência/regime/localidade na UI e as duas
verificações finais (competência importada contra o arquivo de origem; composições conferidas
manualmente contra a planilha oficial).

**Estado em 2026-08-07 (M19 — qualificação de fornecedor, em worktree isolado):** +5 tarefas
concluídas (cliente CEIS/CNEP, cliente de situação cadastral, gravação com data em
`QualificacaoFornecedor`, alerta na proposta, guarda fail-closed) + 1 verificação por mutação
concluída — a verificação de fornecedor sancionado conhecido **não** foi marcada (sem token de
produção do Portal da Transparência neste ambiente, ver §4.3). Trabalho feito em paralelo a M17/M18
(sessão distinta, sem tocar `src/lib/ingestao/`), incluindo correção pós-revisão: varredura completa
de `select` explícito nas consultas pré-existentes de `Fornecedor`/`Proposta` que a coluna nova do
M19 expunha ao risco do CLAUDE.md §9.46 (`src/lib/actions/fornecedores.ts`,
`src/app/(app)/fornecedores/page.tsx`, `src/app/(app)/cotacoes/page.tsx`,
`src/lib/actions/alertas.ts`).

**Estado em 2026-08-07 (consolidação — merge de M17+M18+M19 em `main`):** **47 concluídas, 14
pendentes**, somando as 42 do M15–M18 (contador acima, já incluindo o spike do M18) + 5 do M19. M20
segue inteiro pendente. Falta do M17: exibição na UI e as duas verificações finais. Falta do M19: a
verificação de fornecedor sancionado real (sem token de produção) e aplicação da migration em
produção (`20260807190000_m19_qualificacao_fornecedor`, escrita manualmente por falta de banco local
acessível — nunca aplicada nem em dev, ver §4.3).
