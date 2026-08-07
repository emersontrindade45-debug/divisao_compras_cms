# M17 — SINAPI: registro dos dois spikes (sem código)

Executado em 2026-08-07. Cobre só os dois primeiros checkboxes do M17 em
[docs/ApiPlan.md](ApiPlan.md) — "Spike: localizar a publicação vigente da Caixa..." e "Spike:
confirmar o enquadramento legal exato...". Nenhum código foi escrito; nenhuma migration, provedor
ou runner foi implementado. Metodologia: toda afirmação abaixo tem uma URL/arquivo por trás,
acessado nesta data — nada por dedução ou por memória do modelo (mesmo princípio do registro do
spike do M16, §4.1 do ApiPlan.md).

Dois documentos oficiais da Caixa foram baixados diretamente de `caixa.gov.br` (contornando um
desafio anti-bot do WAF com cookie de sessão + user-agent de navegador — sem isso, `curl` entra em
loop de redirecionamento 302 infinito) e ficam disponíveis para conferência em
`/tmp/claude-0/.../scratchpad/Notas_SINAPI.pdf` e `Livro_Metodologias.pdf` desta sessão:

- **Notas_SINAPI.pdf** (71 páginas) — `https://www.caixa.gov.br/Downloads/sinapi-historico-de-encargos-e-notas/Notas_SINAPI.pdf`,
  acesso em 2026-08-07. Log cronológico oficial de todas as notas de atualização/retificação do
  SINAPI, mantido pela própria equipe Sinapi.
- **Livro_Metodologias.pdf** (113 páginas) — `https://www.caixa.gov.br/Downloads/sinapi-metodologia/Livro_SINAPI_Metodologias_Conceitos.pdf`,
  acesso em 2026-08-07. Manual técnico oficial: conceitos de insumo, composição, família homogênea,
  encargos sociais/complementares.

---

## 1. Spike de formato (Tarefa 1)

### 1.1 Onde fica a publicação vigente

Portal oficial: **`www.caixa.gov.br/SINAPI`** (redireciona para
`https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx`, HTTP 200
confirmado por `curl` com cookie de sessão em 2026-08-07). A partir dali, os links de download por
UF ficam em `https://www.caixa.gov.br/site/Paginas/downloads.aspx`, organizados por âncoras
`#categoria_NNN` (uma por UF/tipo de relatório — `categoria_638` a `categoria_664` no HTML coletado
nesta sessão). **Não confirmado:** o conteúdo por trás de cada âncora é renderizado em JavaScript
do lado do cliente (a página é um shell SharePoint/ASP.NET); `curl` devolve o mesmo HTML genérico
independentemente da âncora, então não foi possível listar programaticamente a URL exata do arquivo
ZIP de São Paulo da competência vigente nesta sessão — só a existência e a localização da página de
navegação foram confirmadas.

Achado colateral relevante: o **"Sumário de Publicações"**, um índice que no passado listava links
diretos e estáveis por competência, foi **descontinuado em 07/05/2025** — "Nota 05/2025 nº 01 –
Descontinuação do Sumário de Publicações do SINAPI" (Notas_SINAPI.pdf, p. 12): *"O Sumário de
Publicações foi criado pela equipe do SINAPI (...). No entanto, com a reformulação dos modelos de
relatórios e a atualização do portal do SINAPI, o Sumário tornou-se obsoleto."* Isso é evidência
direta de que a estrutura de acesso já mudou uma vez e removeu justamente o mecanismo que teria
dado URL previsível — reforça a resposta do item 1.6 abaixo.

### 1.2 Formato do arquivo

**Não confirmado por fonte primária de forma explícita para o relatório mensal principal** (preços
de insumos / custo de composições). Múltiplas fontes secundárias independentes e convergentes
(agregadores especializados em orçamento de obra) descrevem: arquivo ZIP por UF/competência
contendo planilhas XLSX. A fonte primária confirma indiretamente que a Caixa usa formato de
planilha Excel para relatórios correlatos e que já migrou de PDF para Excel em pelo menos dois
relatórios distintos:
- "Nota 02/2022 nº 02 – Alteração no formato do Relatório de Manutenção de Insumos": *"A partir da
  ref.: Jan/2022, o 'Relatório de Manutenção de Insumos' (...) passa a ter o formato XLS."*
  (Notas_SINAPI.pdf, p. 45-46)
- "Nota 02/2025 nº 01 – Atualizações importantes no SINAPI": os relatórios mensais de preços/custos
  passaram, a partir da referência Jan/2025, a ser publicados **só** no "novo formato" que estava em
  teste desde ago/2024 (Notas_SINAPI.pdf, p. 13) — o texto não nomeia a extensão do arquivo.

Tratar como **XLSX dentro de ZIP, por UF, com pelo menos duas variantes (insumos / composições)**
como hipótese forte (múltiplas fontes secundárias concordam), não como fato verificado por fonte
primária — confirmar baixando um ZIP real antes de escrever o parser (item de verificação do
próprio M17: "runner rejeita lote com cabeçalho inesperado").

### 1.3 Granularidade — insumos × composições

Confirmado por fonte primária (Livro_Metodologias.pdf): são **dois relatórios/conceitos distintos**.

| | Relatório de Insumos | Relatório de Composições |
|---|---|---|
| O que é | Preço unitário de item individual (material, mão de obra, equipamento) por Família Homogênea, com coeficiente de representatividade (Livro_Metodologias.pdf, p. 33, "Figura 1 - Relatório de Insumos") | Custo unitário de um serviço completo, calculado a partir de uma receita de insumos com coeficientes de consumo |
| Classificação | Encargos Complementares, Equipamento (Aquisição), Equipamento (Locação), Especiais, Mão de Obra, Material, Serviços (Livro_Metodologias.pdf, p. 34) | Agrupada em Cadernos Técnicos por tipo de serviço |
| Uso numa pesquisa de preço | Referência para item avulso (ex.: preço de um saco de cimento) — raramente é o que se cota num processo de obra | **É a referência correta para a maioria dos itens de uma pesquisa de preço de obra/serviço de engenharia** — compara-se o preço do serviço completo (ex.: "m² de alvenaria de vedação"), não os insumos que o compõem |

Consequência prática para o M17: o provedor de preço de referência deve consultar **composições**
por padrão; expor insumos seria útil só para conferência/decomposição, não como a série de preço
principal.

### 1.4 Recorte por UF

Confirmado por fonte primária, com uma nuance que os agregadores secundários não deixam explícita.
Livro_Metodologias.pdf, p. 70: *"planilhas atualizadas dos Encargos Sociais adotadas para cada uma
das **vinte e sete localidades de referência do SINAPI (as capitais estaduais e o Distrito
Federal)**, onde o IBGE realiza coleta de preços de insumos."*

**Nuance importante para a UI/documentação do M17:** o SINAPI não pesquisa preço em todo o
território de um estado — pesquisa na capital, e o arquivo publicado com o rótulo "SP" reflete a
coleta feita na cidade de São Paulo, usada representativamente para o estado inteiro. Isso deveria
aparecer explicitamente na evidência exibida ao usuário (mesma lógica de "captura obrigatória de
data/hora de acesso" do §1 do CLAUDE.md — aqui é "captura obrigatória de que praça gerou o
número").

### 1.5 Desonerado × não desonerado

Confirmado por fonte primária **o motivo**, não a mecânica exata do arquivo. Livro_Metodologias.pdf,
p. 70: os percentuais de Encargos Sociais que compõem o custo de mão de obra de cada composição são
afetados pelas Leis 13.670/2018, 12.844/2013, 13.161/2015 (desoneração da folha de pagamento da
construção civil) e 14.973/2024 (regime de transição para o fim da desoneração) — regimes
tributários diferentes sobre a folha geram **dois percentuais de encargos sociais legítimos e
simultâneos**, logo dois custos finais diferentes para a mesma composição.

Isso confirma, com fonte primária, a premissa do próprio M17 ("dois preços legítimos para o mesmo
código, que não podem se misturar numa série de preços") — mas a fonte primária não descreve a
mecânica de arquivo (se são duas abas, dois arquivos, ou uma coluna de regime). Fontes secundárias
convergentes: Caixa publica dois conjuntos de arquivo por UF/mês, um por regime. **Tratar como não
verificado por fonte primária até abrir um ZIP real** — mas o motivo de negócio (não misturar) está
confirmado e é o que importa para o desenho do schema.

### 1.6 Competência mensal e URL estável

**Mensal, confirmado.** Publicação alvo é por volta do dia 9-11 do mês seguinte à referência
(ex.: referência out/2025 prevista para 11/11/2025 — Notas_SINAPI.pdf, p. 10), mas **atrasos são
recorrentes e documentados**: pelo menos 4 notas só em 2024 tratam de atraso/nova estimativa de
publicação (jan/2024 — Notas_SINAPI.pdf, p. 17-18), fora o episódio maior de 2025 (item 2 abaixo).

**URL estável e previsível por competência: não confirmado — evidência aponta para o contrário.**
O mecanismo que antes ofereceria isso (Sumário de Publicações, item 1.1) foi descontinuado em
2025 "com a reformulação dos modelos de relatórios e a atualização do portal", e a navegação atual
depende de JavaScript renderizado no portal (não foi possível extrair um padrão de nome de arquivo
por `curl`). **Não assumir URL previsível ao desenhar o runner de ingestão** — provavelmente exige
navegação/scraping da página de downloads a cada execução, não montagem de URL por template
mês/ano como seria o ideal.

### 1.7 Estabilidade de layout — risco real, não teórico

Confirmado por fonte primária: **o layout já mudou pelo menos três vezes**, com datas e efeitos
documentados oficialmente.

| Quando | Mudança | Fonte |
|---|---|---|
| A partir da ref. 2020 (Nota 02/2020 nº 01) | Nova estrutura de classificação (macro classe + classe + tipo + código sequencial) para insumos **e** composições. Texto oficial: *"Com essa nova estrutura, as colunas, os campos e os arquivos Excel e PDF serão alterados"* | Notas_SINAPI.pdf, p. 65-66 |
| A partir da ref. Jan/2022 (Nota 02/2022 nº 02) | Relatório de Manutenção de Insumos migra de PDF para XLS | Notas_SINAPI.pdf, p. 46 |
| Testado desde ago/2024, exclusivo a partir da publicação de fev/2025 (Nota 02/2025 nº 01) | "Novo formato" dos relatórios mensais torna-se o único publicado; documento "Catálogo de Referências" é desativado porque o novo relatório já inclui tudo | Notas_SINAPI.pdf, p. 13 |
| A partir da ref. 09/2025 (Nota 10/2025 nº 01) | Insumos de encargo (alimentação, seguro, transporte, exames, ferramentas, EPI) reclassificados de categoria "MATERIAL" para "ENCARGOS COMPLEMENTARES" — muda o cálculo do percentual de mão de obra em toda composição que os usa | Notas_SINAPI.pdf, p. 11 |

**Veredito do item 7: risco real e recorrente, não teórico.** Quatro eventos de mudança estrutural
ou de classificação em seis anos (2020, 2022, 2025 formato, 2025 classificação) — em média mais de
uma mudança relevante a cada dois anos, sem contar retificações pontuais de dados (dezenas de notas
de erro/correção catalogadas no mesmo documento). A exigência do M17 de "runner rejeita lote com
cabeçalho inesperado e falha visivelmente" (§9.22 do CLAUDE.md) está justificada por histórico
documentado, não por precaução genérica.

---

## 2. Achado não previsto no roteiro original — interrupção de preços (out–nov/2025)

Vale registrar porque afeta diretamente a premissa "todo lote publicado tem preço confiável", que
nenhuma das sete perguntas do roteiro cobria.

De nov/2025 a 22/12/2025, o **IBGE deixou de enviar a carga de preços de insumos à Caixa**, e a
Caixa optou por publicar os relatórios mensais mesmo assim, **com valores de custo zerados**, a
partir da referência out/2025 (Notas_SINAPI.pdf, "Nota 12/2025 nº 01", p. 8-9): *"Os custos
unitários e preços apresentados nos relatórios não refletem valores reais, pois foram zerados para
permitir a continuidade da publicação."* O problema foi sanado em 22/12/2025 quando o IBGE enviou
os dados retroativos (Notas_SINAPI.pdf, "Nota 12/2025 nº 02", p. 8).

A mesma nota registra um risco em aberto, não resolvido no documento: *"O Acordo de Cooperação
Técnica firmado entre a CAIXA e o IBGE segue vigente até 21/01/2026. As negociações para a
assinatura de um novo acordo permanecem em andamento, porém ainda não há previsão para sua
formalização."* Nenhuma nota posterior (as mais recentes no documento são de 03/2026 e 05/2026, e
tratam de assuntos não relacionados) confirma explicitamente a renovação desse acordo. **Não
confirmado se o acordo foi formalmente renovado** — não achei nota que trate disso depois de
dez/2025.

**Consequência de design para o M17, além do cabeçalho inesperado:** o runner de ingestão precisa
também rejeitar (ou pelo menos sinalizar com destaque) um lote **estruturalmente válido mas com
preços zerados em massa** — o precedente de out-nov/2025 mostra que a Caixa publica esse tipo de
lote deliberadamente, então "cabeçalho ok" não é garantia de "preço utilizável".

---

## 3. Spike de enquadramento legal (Tarefa 2)

### 3.1 Lei 14.133/2021 — dispositivo exato

Confirmado em `docs/lei-14133-2021-licitacoes-contratos.md` (linhas 763-772 desta cópia local) —
**Art. 23, § 2º, inciso I**:

> "§ 2º No processo licitatório para contratação de obras e serviços de engenharia, conforme
> regulamento, o valor estimado, acrescido do percentual de Benefícios e Despesas Indiretas (BDI)
> de referência e dos Encargos Sociais (ES) cabíveis, será definido por meio da utilização de
> parâmetros na seguinte ordem:
>
> I - composição de custos unitários menores ou iguais à mediana do item correspondente do Sistema
> de Custos Referenciais de Obras (Sicro), para serviços e obras de infraestrutura de transportes,
> **ou do Sistema Nacional de Pesquisa de Custos e Índices de Construção Civil (Sinapi), para as
> demais obras e serviços de engenharia**;"

Ponto que muda a leitura do §2.3/M17 do plano: o **inciso I não é opcional entre várias fontes
combináveis** como no §1º (bens/serviços em geral, "combinados ou não") — o §2º estabelece
explicitamente uma **ordem** ("na seguinte ordem"), com o Sicro/Sinapi no topo (inciso I), seguido
de tabela de referência/mídia especializada (inciso II), contratações similares (inciso III) e nota
fiscal eletrônica (inciso IV). Isso é mais forte do que "fonte prioritária" — é o **primeiro
parâmetro a esgotar antes de ir para os demais** em obras e serviços de engenharia. Vale também
notar o § 3º do mesmo artigo, relevante por a CMS ser município: *"Nas contratações realizadas por
Municípios (...), desde que não envolvam recursos da União, o valor previamente estimado (...)
poderá ser definido por meio da utilização de outros sistemas de custos adotados pelo respectivo
ente federativo"* — abre a porta para o CADTERC do M18, mas não dispensa o Sinapi como parâmetro
válido e prioritário quando não há recurso federal envolvido.

### 3.2 IN SEGES/ME 65/2021 — relação com o artigo acima

Confirmado por dupla fonte primária independente: o texto extraído via WebFetch de
`gov.br/compras` e um PDF baixado de `pad.uem.br` batem palavra por palavra.

**Achado central, e ele muda a leitura do M17: a IN 65/2021 explicitamente não regula este caso.**

Art. 1º, § 1º: *"O disposto nesta Instrução Normativa não se aplica às contratações de obras e
serviços de engenharia."*

O preâmbulo da própria IN confirma a origem: foi editada "tendo em vista o disposto no **§ 1º** do
art. 23 da Lei nº 14.133" — ou seja, a IN 65 regulamenta o § 1º do art. 23 (bens e serviços em
geral), não o § 2º (obras e serviços de engenharia, onde mora o Sinapi). O Art. 5º da IN 65 (os
cinco parâmetros com prioridade para incisos I e II — Painel de Preços e contratações similares)
**não se aplica a obras/engenharia**; para esse escopo, quem manda é diretamente o art. 23, § 2º da
Lei 14.133 (item 3.1 acima), sem intermediação de IN federal.

Consequência prática para o CLAUDE.md/PRD deste projeto: onde o PRD ou o código citarem "IN
65/2021" como base para a hierarquia de fontes de obras/engenharia, a citação correta é a **Lei
14.133 art. 23 §2º** — a IN 65 é a base certa só para bens e serviços em geral (o que já é a maioria
do sistema hoje, mas não é o caso do M17).

### 3.3 Decreto 7.983/2013 — elo legal que faltava

Achado durante a pesquisa, fora do roteiro original mas necessário para fechar a cadeia normativa: a
própria Caixa, ao justificar por que está legalmente obrigada a manter o Sinapi atualizado (episódio
do item 2), cita o **Decreto Federal nº 7.983/2013**, que **antecede** a Lei 14.133/2021 e não foi
citado por ela diretamente nas seções lidas — mas continua sendo invocado pela Caixa como sua base
de manutenção do sistema em 2025/2026. Confirmado de forma independente em
`planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7983.htm` (acesso em 2026-08-07):

> "Art. 3º O custo global de referência de obras e serviços de engenharia, exceto os serviços e
> obras de infraestrutura de transporte, será obtido a partir das composições dos custos unitários
> previstas no projeto que integra o edital de licitação, menores ou iguais à mediana de seus
> correspondentes nos custos unitários de referência do Sistema Nacional de Pesquisa de Custos e
> Índices da Construção Civil - Sinapi (...). Parágrafo único. O Sinapi deverá ser mantido pela
> Caixa Econômica Federal - CEF, segundo definições técnicas de engenharia da CEF e de pesquisa de
> preço realizada pelo Instituto Brasileiro de Geografia e Estatística - IBGE."
>
> "Art. 7º Os órgãos e entidades responsáveis por sistemas de referência deverão mantê-los
> atualizados e divulgá-los na internet."

**Não confirmado:** se o Decreto 7.983/2013 foi formalmente recepcionado/mantido em vigor após a Lei
14.133/2021 (que revogou a Lei 8.666/1993, sob a qual o decreto foi editado) ou se segue vigente por
não conflitar com o novo marco — não encontrei, dentro do escopo desta pesquisa, um dispositivo
expresso de revogação ou de recepção. A própria Caixa o trata como vigente em nota publicada em
dezembro de 2025, o que é indício forte de vigência prática, mas não é a mesma coisa que confirmação
jurídica formal. Registrar como ponto a validar com a assessoria jurídica da Câmara antes de citar o
decreto como fundamento legal formal em peça processual — para uso interno de priorização de fonte
de preço, a Lei 14.133 art. 23 §2º já é fundamento suficiente e não depende dessa confirmação.

### 3.4 O que não foi possível confirmar (consolidado)

- URL exata (com nome de arquivo) do ZIP de São Paulo da competência vigente — página de downloads
  é renderizada em JavaScript, `curl` não expõe o link real (item 1.1).
- Formato exato do arquivo do relatório mensal principal (XLS vs. XLSX) por fonte primária — só
  inferido por convergência de fontes secundárias e por analogia com outros relatórios do mesmo
  portal que documentam formato Excel (item 1.2).
- Mecânica exata do arquivo para desonerado × não desonerado (arquivos separados, abas separadas ou
  coluna de regime) — o motivo de negócio está confirmado, a mecânica de arquivo não (item 1.5).
- Se o Acordo de Cooperação Técnica Caixa-IBGE (vencimento 21/01/2026) foi renovado — não há nota
  posterior no documento oficial que confirme (item 2).
- Vigência formal do Decreto 7.983/2013 face à revogação da Lei 8.666/1993 pela Lei 14.133/2021
  (item 3.3).

---

## Veredito

**Primeiro checkbox do M17** ("Spike: localizar a publicação vigente da Caixa; confirmar formato,
estabilidade, granularidade (...), recorte por UF, distinção desonerado/não-desonerado, competência
mensal e URL permanente por competência") — **parcialmente cumprido, não marcar `[x]` ainda.**
Cinco das sete dimensões pedidas foram confirmadas por fonte primária (localização do portal,
granularidade insumos×composições, recorte por UF com a nuance de "localidade de referência",
motivo do desonerado×não-desonerado, estabilidade — esta com resposta "instável, documentado três
vezes"); duas ficaram sem confirmação por fonte primária (formato exato do arquivo, e URL/nome
previsível por competência — que na prática se confirmou como **não existente**, e essa é uma
resposta útil, não uma lacuna). Falta um passo de verificação viável só com navegador real (abrir o
portal, navegar até SP, baixar o ZIP da competência vigente e inspecionar) antes de considerar o
spike de formato encerrado — não é código, mas exige uma sessão interativa que este ambiente
(`curl` sem JS) não reproduz.

**Segundo checkbox do M17** ("Spike: confirmar o enquadramento legal exato (inciso e redação
vigente) (...) — não citar de memória") — **pode ser marcado `[x]`.** O inciso (Lei 14.133/2021,
art. 23, § 2º, I) foi confirmado por transcrição literal do arquivo local já versionado no repo, e a
relação com a IN 65/2021 foi confirmada por dupla fonte primária independente (gov.br + PDF de
universidade), com um achado que corrige a hipótese implícita do plano: **a IN 65 não regula obras e
serviços de engenharia** — quem regula é diretamente o art. 23 §2º da Lei 14.133, e o vínculo
histórico com o Sinapi vem do Decreto 7.983/2013 (vigência formal pós-14.133 não confirmada, mas
irrelevante para fundamentar a priorização de fonte dentro deste sistema).

**Pendente para quando o M17 for de fato implementado** (fora do escopo desta tarefa, só registrado
para quem pegar o milestone depois): validar formato de arquivo abrindo um ZIP real; decidir se o
runner trata "preço zerado em massa" como falha de lote (recomendado, dado o precedente de
out-nov/2025); e revisar com a Câmara se o Decreto 7.983/2013 deve ser citado em peça processual ou
se basta a Lei 14.133 art. 23 §2º.
