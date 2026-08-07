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
- [ ] Ingestão do catálogo CATMAT (343.880 itens) para tabela local
- [ ] Migrar o catálogo CATSER da ingestão por request para a mesma tabela (elimina o download de
      3.014 itens a cada cold start em `comprasGov.ts`)
- [ ] Matching local por sobreposição léxica sobre o catálogo ingerido (reusar
      `src/lib/similaridade/sobreposicaoLexical.ts`)
- [ ] Provedor sobre `modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133` **wireado no
      registry** (filtro por `codItemCatalogo`/`codigoClasse`, janela de 365 dias) — o cliente
      (`src/lib/integracoes/comprasGovContratacoes.ts`) já existe e está testado (ver os quatro
      itens abaixo), mas ainda não está no `REGISTRY_PROVEDORES_PUBLICOS`: a API não tem busca por
      texto livre (confirmado no spike §4.1), então o wiring depende do matching léxico sobre o
      catálogo ingerido (item acima) para resolver `termo → codItemCatalogo` primeiro.
- [x] Usar `valorUnitarioResultado`, nunca `valorUnitarioEstimado` (§9.61a) —
      `comprasGovContratacoes.ts`; `valorUnitarioEstimado` só existe no schema Zod de parsing, nunca
      no tipo de saída (confirmado por `grep`, revisão de código e teste de presença — troca por
      engano derrubaria o teste).
- [x] Descartar item sem `temResultado` e com `dataCancelamentoPncp` preenchida — idem, testado.
- [x] Excluir `orgaoEntidadeCnpj === ORGAO_CNPJ` (§9.9) — reusa `cnpjOrgaoProprio()`/`normalizarCnpj()`
      de `src/lib/domain/orgaoProprio.ts` em vez de reimplementar a regra.
- [x] Derivar a URL de evidência de `idContratacaoPNCP` → `pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}`
      — mesmo padrão de `montarUrlEdital()` em `pncp.ts`, testado contra o exemplo real do spike.
- [ ] Avaliar `modulo-arp` como fonte adicional (traz `linkAtaPNCP` pronto — ver §4.1)
- [ ] Tratar dispersão: o spike encontrou R$ 0,26 e R$ 96,37 para o mesmo código CATMAT
- [ ] **Verificação:** três itens que a Câmara compra, conferidos contra o Painel de Preços na web
- [ ] **Verificação:** a URL de evidência gerada aberta de verdade no navegador (§9.8)

### M17 — SINAPI

**Objetivo.** Obras e serviços de engenharia — incluindo manutenção predial, que é onde o
Compras.gov admite cobertura baixa.

- [ ] **Spike:** localizar a publicação vigente da Caixa; confirmar formato, estabilidade,
      granularidade (insumos e composições), recorte por UF, distinção desonerado/não-desonerado,
      competência mensal e URL permanente por competência
- [ ] **Spike:** confirmar o enquadramento legal exato (inciso e redação vigente) contra
      [lei-14133-2021](lei-14133-2021-licitacoes-contratos.md) e a IN 65 — não citar de memória
- [ ] Ingestão mensal de insumos e composições para SP
- [ ] Provedor de consulta
- [ ] Exibir competência e regime de desoneração de forma explícita (dois preços legítimos para o
      mesmo código não podem se misturar na série)
- [ ] Runner rejeita lote com cabeçalho inesperado e **falha visivelmente** (§9.22)
- [ ] **Verificação:** uma competência importada, contagem conferida contra o arquivo de origem
- [ ] **Verificação:** três composições conferidas manualmente contra a planilha oficial

**Peso legal.** O SINAPI é tabela de referência federal formalmente aprovada, com estatura normativa
própria em obras e serviços de engenharia — o que o coloca acima de site eletrônico na hierarquia da
IN 65 e o torna, para esse tipo de objeto, fonte que o sistema **deveria** oferecer primeiro.

**Riscos.** Layout de planilha muda entre competências e quebra em silêncio.

### M18 — CADTERC / BEC-SP

**Objetivo.** Serviços continuados: limpeza, vigilância, recepção, copeiragem. É a lacuna que o
comentário do nosso próprio código admite.

- [ ] **Spike — este milestone pode não sobreviver a ele.** Verificar se a publicação atual é
      legível por máquina, qual a periodicidade e se há URL estável por caderno
- [ ] **Decisão com o usuário depois do spike, não antes:** (a) ingestão semiautomática com
      conferência humana; (b) cadastro manual dos postos relevantes como tabela interna, tratando o
      CADTERC como referência documental; (c) descartar
- [ ] Ingestão ou cadastro, conforme a decisão acima
- [ ] Gerar automaticamente a justificativa de uso de tabela estadual junto com a fonte
- [ ] **Verificação:** um caderno conferido posto a posto contra o documento oficial

**Peso legal.** Tabela de referência **estadual**, não federal — usável, mas com enquadramento mais
fraco que o do SINAPI na IN 65, e provavelmente exigindo justificativa registrada no processo. O
sistema deve gerar essa justificativa, não deixar para o pesquisador lembrar.

### M19 — Qualificação de fornecedor

**Objetivo.** Não é preço: é o outro lado da conformidade. Hoje o checklist de proposta e o score de
fornecedor não consultam nenhuma base oficial.

- [ ] Cliente de consulta a CEIS/CNEP (sanções, via Portal da Transparência — token gratuito)
- [ ] Consulta de situação cadastral de CNPJ
- [ ] Gravar o resultado **com a data da consulta** no `HistoricoCotacao` / checklist
- [ ] Alerta na proposta quando o fornecedor estiver sancionado
- [ ] Guarda de token: ausência **nega** a consulta e sinaliza (§9.45)
- [ ] **Verificação:** um fornecedor sancionado conhecido é detectado
- [ ] **Verificação:** por mutação, remover o token e confirmar que a consulta é negada, não pulada

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
