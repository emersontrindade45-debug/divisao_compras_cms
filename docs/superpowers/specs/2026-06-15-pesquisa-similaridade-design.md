# Pesquisa de Similaridade (TR → Contratos Públicos → Fornecedores)

Data: 2026-06-15
Status: aprovado para planejamento

## 1. Contexto e motivação

O fluxo real de trabalho da Divisão de Compras **não** é cadastrar processos pela UI: a
planilha padrão (formato fixo, não pode ser alterado) é o registro mestre. O analista
preenche os itens a cotar na planilha e sobe o Termo de Referência (TR) — PDF que descreve
o objeto em detalhe, vindo do Google Drive.

O maior gargalo do processo manual hoje é **encontrar contratações públicas similares**
(fonte prioritária pela IN SEGES/ME 65/2021) com precisão suficiente para servir de
justificativa formal numa instrução processual. Um erro de matching aqui tem custo de
conformidade, não é só uma conveniência de produto.

Esta feature substitui essa busca manual por um pipeline assistido por IA que:
1. Lê o TR e enriquece a descrição de cada item da planilha com especificação técnica.
2. Busca contratos públicos similares (PNCP + Painel de Preços) e, quando aplicável, preços
   de mercado em sites eletrônicos já homologados (lista branca existente).
3. Rankeia os candidatos por similaridade com parâmetros e pesos explícitos e auditáveis.
4. Sugere fornecedores diretos qualificados, priorizando proximidade geográfica.
5. Permite revisão humana item a item, sincronizando qualquer edição de volta para a
   planilha original.

Nada entra automaticamente na série de preços do processo — todo resultado é proposto para
análise; a promoção a `Fonte` é uma ação manual do usuário.

## 2. Fora de escopo nesta versão

- Disparo automático de e-mail de cotação (a Câmara de Santos envia por fora do sistema).
  O registro de cotação/SLA continua existindo; só a integração SMTP/Resend sai do
  caminho crítico.
- Fontes de dado adicionais: Portal da Transparência (notas fiscais) e SEFAZ/NFePortal
  ficam para uma fase 2. Não têm granularidade ou API pública adequada hoje para entrar
  na v1 com a mesma confiabilidade do PNCP/Painel de Preços.
- Cadastro manual de processo/item via formulário de UI — não existe e não será construído;
  a planilha continua sendo a única porta de entrada de itens.
- Detecção automática de fraude/colusão entre fornecedores.

## 3. Fluxo ponta a ponta

1. Usuário abre o processo e sobe, na nova aba **"Pesquisa por Similaridade"**, dois
   arquivos: a planilha padrão (itens a cotar) e o PDF do TR.
2. O TR é enviado ao Gemini Flash, que extrai por item: descrição normalizada,
   especificação técnica detalhada (material, dimensão, características), unidade de
   medida e quantidade. Esse extrato é casado com a linha correspondente da planilha pela
   descrição (mesmo objeto, fontes diferentes).
3. Para cada item enriquecido, o sistema dispara em paralelo:
   - **Busca de contratos**: consulta PNCP e Painel de Preços (Compras.gov.br) por
     palavra-chave/categoria.
   - **Busca em sites eletrônicos**: só para itens cuja natureza for de uso comum
     (decisão guiada pela especificidade extraída, não por uma lista de categorias fixa);
     restrita aos domínios já cadastrados como lista branca no módulo Sites existente.
   - **Busca de fornecedores diretos**: consulta primeiro a base de fornecedores já
     cadastrada, filtrando por nicho/tag do objeto e expandindo por camada geográfica
     (Baixada Santista → Estado de SP → Sudeste → Sul → Centro-Oeste), parando na primeira
     camada com fornecedores qualificados suficientes. Só busca fornecedor novo na
     internet quando nenhuma camada da base atual tiver candidato qualificado.
4. Os contratos candidatos do PNCP/Painel de Preços passam pelo **ranking de
   similaridade** (ver §4). Resultado: lista ordenada por score, com o detalhamento de
   cada parâmetro.
5. Para cada item, abre uma **caixa de diálogo de revisão**: descrição, quantidade,
   unidade, preço sugerido (já passado pela regra de exclusão de discrepantes existente em
   `priceStats.ts`), lista de candidatos rankeados com detalhamento dos parâmetros, e
   fornecedores sugeridos. O usuário edita o que for necessário diretamente ali.
6. Toda edição feita na caixa de diálogo é sincronizada de volta para a mesma planilha
   (mesmo arquivo/aba), não uma cópia.
7. Fornecedores novos descobertos na internet são cadastrados na base existente, já
   tagueados por nicho e camada geográfica, para reaproveitamento em processos futuros.
8. Depois da revisão, a tela do processo mostra uma **tabela resumo read-only** dos itens
   já revisados (com preço final e fonte). Clicar num item reabre a caixa de diálogo para
   editar de novo.

## 4. Ranking de similaridade

Score de 0 a 100%, calculado por item candidato a contrato público, com 3 parâmetros
ponderados e 1 filtro de corte:

| Parâmetro | Peso | O que avalia |
|---|---|---|
| Descrição semântica | 40% | Quão parecida é a descrição do objeto do TR/planilha vs. a descrição do item no contrato encontrado (comparação feita pela IA, não por palavra-chave exata) |
| Especificação técnica | 35% | Características específicas extraídas do TR (material, dimensão, voltagem etc.) batem com o que está descrito no contrato candidato |
| Unidade/quantidade | 25% | Unidade de medida (caixa/unidade/metro linear/pacote) e ordem de grandeza da quantidade são compatíveis |
| Recência/validade (corte) | — | Contratos com mais de 365 dias (mesma regra de validade de fonte já existente em `in65Rules.ts`) são excluídos do ranking automaticamente, não entram no cálculo de % |

**Adaptação de unidade/desmembramento**: quando o TR tem um item agregado e o contrato
vem desmembrado (ex.: "1 conjunto" no TR vs. "mesa" + "cadeiras" separados no contrato), ou
quando a unidade não bate diretamente (ex.: metro linear vs. unidade), a IA tenta
normalizar e propor a conversão, mas o resultado fica marcado visualmente como
**"adaptado"** e o score de confiança exibido é reduzido. Cada candidato no ranking mostra
o detalhamento dos 3 parâmetros com seus percentuais individuais, não só o score final —
isso serve de justificativa auditável para a instrução processual.

## 5. Componentes técnicos

- **`src/lib/ia/`** (novo) — client abstrato de IA com duas operações: `extrairEspecificacaoTR(pdf)`
  e `rankearSimilaridade(itemTR, candidatos[])`. Implementação inicial usa Gemini Flash
  (camada gratuita do Google AI Studio) via SDK oficial; interface trocável por outro
  provedor depois sem alterar os chamadores.
- **`src/lib/integracoes/pncp.ts`** (novo) — client HTTP tipado para a API pública do PNCP.
- **`src/lib/integracoes/painelPrecos.ts`** (novo) — client HTTP tipado para a API do
  Painel de Preços (Compras.gov.br).
- **`src/lib/similaridade/`** (novo) — orquestra o pipeline: chama extração de TR, dispara
  buscas paralelas (contratos, sites, fornecedores), aplica o ranking de §4, monta o
  resultado por item. Não duplica regras de conformidade — reaproveita `priceStats.ts` e
  `in65Rules.ts` já existentes.
- **`src/lib/actions/pesquisaSimilaridade.ts`** (novo) — server action
  `processarPesquisaSimilaridade(processoId, planilha, tr)` que orquestra o fluxo completo
  e persiste o resultado.
- **Modelo Prisma novo `ResultadoSimilaridade`** — vinculado a `Item`; guarda score final,
  os 3 parâmetros individuais com percentual, fonte candidata, flag `adaptado` (boolean) e
  justificativa textual curta gerada pela IA.
- **`src/lib/sheets/`** (estende o existente) — adiciona função de escrita
  (`atualizarPlanilha()`) usando a Google Sheets API com escopo de edição. Hoje o módulo só
  lê CSV público; a escrita exige credencial com permissão (Service Account recomendado —
  ver pendência em §7).
- **`src/lib/actions/fornecedores.ts`** (estende o existente) — novo método
  `buscarOuQualificarFornecedor(nicho, regiaoPreferencial)`: consulta a base existente
  primeiro, expande camadas geográficas, só então busca fornecedor novo via IA/web.
- **Remoção/ajuste**: `criarCotacao` deixa de disparar e-mail via Resend; mantém o registro
  de cotação/SLA no banco. `src/lib/email/` reduzido a templates de referência (cópia
  manual) ou removido, a decidir na implementação conforme uso real.

## 6. UI

- Nova aba **"Pesquisa por Similaridade"** em `src/app/(app)/processos/[id]/`.
- Upload de planilha + TR nessa aba (reaproveita componente de upload já usado em
  `SincronizarPlanilhaForm`).
- Caixa de diálogo por item (modal), com:
  - Campos editáveis: descrição, quantidade, unidade, preço.
  - Lista de candidatos rankeados (contratos), cada um mostrando score total e o
    detalhamento dos 3 parâmetros.
  - Indicador visual quando o candidato é "adaptado" (desmembramento/conversão de unidade).
  - Lista de fornecedores sugeridos com indicação da camada geográfica de origem.
- Tabela resumo read-only na aba, pós-revisão, com botão para reabrir o diálogo de cada item.

## 7. Pendências a decidir na implementação

- **Credencial Google Sheets para escrita**: recomendado Service Account (chave JSON no
  Google Cloud Console, planilha compartilhada com o e-mail do service account) por ser
  mais simples para automação servidor-a-servidor, sem depender de login do usuário. OAuth
  é a alternativa caso a Service Account não seja viável operacionalmente — decisão a
  confirmar com o usuário no início da implementação.
- Critério exato de "natureza de uso comum" para acionar busca em sites eletrônicos será
  refinado durante a implementação do prompt de extração — hoje fica a cargo da
  especificidade percebida pela IA, sem lista fixa de categorias.

## 8. Critérios de sucesso

- Para um TR + planilha de teste real, o sistema retorna candidatos a contrato público
  cujo score de descrição semântica + especificação técnica reflita corretamente a
  identidade do objeto (validação manual pelo usuário em itens conhecidos).
- Itens com unidade/desmembramento diferente aparecem claramente marcados como "adaptado",
  nunca misturados sem aviso aos candidatos diretos.
- Edição feita na caixa de diálogo reflete corretamente na planilha original após o salvamento.
- Nenhum preço é promovido a `Fonte`/série de preços sem ação manual do usuário.
