# Base Normativa — Plataforma de Pesquisa de Preços (CMS)

Documento de insumo para o M7 e norteador permanente das operações da Divisão de Compras
da Câmara Municipal de Santos. Registra a hierarquia normativa completa que governa a pesquisa
de preços — da legislação federal até as regras internas da CMS.

> **Como usar:**
> - Preencha cada seção antes de iniciar o M7.
> - Regras confirmadas e revisadas juridicamente: marque `[x]`.
> - Regras a verificar ou pendentes de confirmação: `[ ]`.
> - Ao implementar uma regra no código (`lib/domain/`), referencie o código da norma
>   (ex.: `// IN 65/2021, art. 5º, §2º`) para rastreabilidade.
> - A **Seção 7** registra os pontos de conflito entre níveis — priorize esses na revisão jurídica antes do M7.

---

## Hierarquia Normativa

```
Lei Federal / Constituição Federal
    └── Lei nº 14.133/2021 (Nova Lei de Licitações)
        └── IN SEGES/ME 65/2021 (pesquisa de preços)
            └── Leis e Decretos Estaduais (SP)
                └── Leis e Decretos Municipais — Prefeitura de Santos
                    │   ├── Decreto nº 10.222/2023 (normas gerais de licitação)
                    │   └── Decreto nº 10.297/2023 (contratação direta)
                    └── Regulamentos Internos — Câmara Municipal de Santos (CMS)
                            └── Ato da Mesa nº 17/2023
                                └── Normas Operacionais — Divisão de Compras
```

> Em caso de conflito, prevalece a norma de hierarquia superior.
> Normas internas só podem ser **mais restritivas**, nunca mais permissivas que a norma federal.

---

## 1. Legislação Federal

Base legal máxima. Define os princípios e obrigações que nenhuma norma inferior pode contrariar.

| Código | Norma | Artigos / Dispositivos relevantes | Status |
|---|---|---|---|
| FED-01 | Constituição Federal — art. 37, XXI | Princípio da isonomia e obrigatoriedade de licitação | [ ] |
| FED-02 | Lei nº 14.133/2021 — Nova Lei de Licitações | Art. 23 (valor estimado e pesquisa de preços); art. 40 (especificações do TR); art. 67–70 (habilitação); art. 74–75 (dispensa e inexigibilidade); art. 156 (sanções) | [x] |
| FED-03 | Lei nº 8.666/1993 | Dispositivos ainda vigentes em processos iniciados antes de 30/12/2023 | [ ] |
| FED-04 | Lei Complementar nº 123/2006 — art. 44–45 | Tratamento diferenciado a ME/EPP: empate ficto e preferência na cotação | [ ] |
| FED-05 | IN SGD/ME nº 94/2022 | Plano de contratações anual para soluções de TIC | [ ] |

---

## 2. Instruções Normativas e Atos Federais

Regulamentações do Poder Executivo Federal com força normativa direta sobre a pesquisa de preços.

| Código | Norma | Assunto principal | Status |
|---|---|---|---|
| IN-01 | IN SEGES/ME nº 65/2021 | **Pesquisa de preços para aquisições federais** — fonte prioritária de regras operacionais | [ ] |
| IN-02 | IN nº 5/2017 — Ministério do Planejamento | Pesquisa de preços para serviços com dedicação exclusiva de mão de obra | [ ] |

### Resumo operacional da IN 65/2021 (regras já mapeadas no sistema)

| # | Regra | Dispositivo |
|---|---|---|
| R-01 | Priorizar contratações públicas similares como fonte | Art. 5º |
| R-02 | Preço só entra na estimativa com fonte + data + evidência | Art. 3º, §1º |
| R-03 | Pesquisa direta exige ≥ 3 fornecedores consultados | Art. 5º, §4º |
| R-04 | Registrar fornecedores que não responderam | Art. 5º, §5º |
| R-05 | Captura obrigatória de data/hora de acesso em sites | Art. 6º |
| R-06 | Análise crítica obrigatória em caso de grande dispersão | Art. 8º |
| R-07 | Justificativa registrada quando fonte pública não for usada | Art. 4º, §2º |
| R-08 | Bloqueio de marketplaces como fonte admissível | Art. 6º, §1º |

---

## 3. Legislação Estadual — São Paulo

Normas do Estado de SP aplicáveis à Câmara Municipal de Santos.

| Código | Norma | Assunto | Status |
|---|---|---|---|
| EST-01 | _a verificar com assessoria jurídica_ | Normas estaduais de SP aplicáveis ao Poder Legislativo municipal | [ ] |
| EST-02 | _a verificar com assessoria jurídica_ | _a preencher_ | [ ] |

> **Nota:** A Câmara Municipal de Santos é órgão do Poder Legislativo municipal e rege-se
> primariamente pelas normas federais e por seus regulamentos internos. Confirmar com assessoria
> jurídica quais normas estaduais têm aplicação direta (ver ATJ-03).

---

## 4. Legislação Municipal — Prefeitura de Santos

Leis, decretos e portarias do Município de Santos com impacto nas operações de compras da CMS.

> **Atenção:** Estes decretos são da Prefeitura de Santos (Poder Executivo). A CMS (Poder Legislativo)
> adotou a Lei 14.133/2021 diretamente via Ato da Mesa nº 17/2023. Os decretos municipais abaixo
> são referência subsidiária para interpretação — ver ATJ-01.

| Código | Norma | Número/Data | Assunto | Status |
|---|---|---|---|---|
| MUN-01 | Decreto da Prefeitura de Santos | nº 10.222 / 20 out 2023 | Normas gerais de licitação e contratos: pesquisa de preços (arts. 24–30), SRP (arts. 77–99), gestão de contratos (arts. 103–106), modalidades e habilitação | [x] |
| MUN-02 | Decreto da Prefeitura de Santos | nº 10.297 / 29 dez 2023 | Contratação direta (dispensa e inexigibilidade): alçadas de aprovação, instrução processual obrigatória, ratificação do Prefeito para contratos >R$500k | [x] |
| MUN-03 | _a verificar_ | _a preencher_ | Decreto Municipal nº 8.179/2018 — Formalização de contratos pelo DERAT/GPM (referenciado pelo Decreto 10.222) | [ ] |

---

## 5. Regulamentos Internos — Câmara Municipal de Santos (CMS)

Resoluções, portarias e manuais emitidos pela própria CMS.

| Código | Documento | Número/Data | Assunto | Status |
|---|---|---|---|---|
| CMS-01 | Ato da Mesa | nº 17 / 14 set 2023 (consolidado até 01/04/2024, com alterações do Ato da Mesa nº 4/2024) | **Regulamentação completa da Lei 14.133/2021 no âmbito da CMS**: agentes de contratação, planejamento, ETP, TR, pesquisa de preços (arts. 49–65), modalidades, habilitação, SRP, contratos, sanções | [x] |
| CMS-02 | Ato da Mesa | nº 4 / 2024 | Altera dispositivos do Ato da Mesa nº 17/2023 (arts. 14, 31, 57, 90, 103 e outros) | [x] |
| CMS-03 | Resolução | nº 19 / 09 ago 2019 | Designação de gestores e fiscais de contratos (referenciada pelo Ato da Mesa nº 17/2023, art. 7º) | [ ] |

---

## 6. Normas Operacionais — Divisão de Compras

Regras práticas do dia a dia, derivadas das normas acima. São estas que se traduzem diretamente
em código (`lib/domain/`), fluxos de aprovação (RBAC) e templates de documentos.

### 6.1 Prazos e SLA

| Código | Regra | Prazo | Norma base | Status |
|---|---|---|---|---|
| OP-SLA-01 | Prazo mínimo para resposta de fornecedor em cotação direta | **≥ 5 dias úteis** contados da emissão do pedido | CMS-01 / art. 56, I | [x] |
| OP-SLA-02 | Reiteração da solicitação ao fornecedor sem resposta | Havendo tempo hábil, pode reiterar após os 5 dias úteis | CMS-01 / art. 56, §1º | [x] |
| OP-SLA-03 | Validade máxima de proposta de fornecedor | **180 dias** a contar da data do orçamento; propostas de datas distintas não podem diferir em mais de 180 dias entre si | CMS-01 / art. 60, III e §2º | [x] |
| OP-SLA-04 | Validade de pesquisa em site de domínio amplo | **90 dias** a contar da data da pesquisa | CMS-01 / art. 60, V | [x] |
| OP-SLA-05 | Validade de pesquisa em mídia/site especializado | Prazo do próprio site; se omisso, **90 dias** | CMS-01 / art. 60, IV | [x] |
| OP-SLA-06 | Validade de contratação pública similar como fonte | **12 meses** a contar da homologação (ou conforme vigência da ata/edital) | CMS-01 / art. 60, I e II | [x] |

### 6.2 Alçadas de Aprovação

| Código | Etapa | Responsável | Condição | Norma base | Status |
|---|---|---|---|---|---|
| OP-ALC-01 | Aprovação da série de preços consolidada (Quadro Demonstrativo) | Divisão de Compras | Após aplicação do tratamento estatístico e com ≥ 3 preços válidos | CMS-01 / arts. 55–58 | [x] |
| OP-ALC-02 | Aprovação de exceção (< 3 fornecedores ou < 3 preços) | Setor competente — _a definir internamente_ | Justificativa formal no processo | CMS-01 / art. 55, §4º e art. 58 | [ ] |
| OP-ALC-03 | Aprovação quando não há fonte pública disponível | Setor competente — _a definir internamente_ | Justificativa da impossibilidade de uso das fontes prioritárias (incisos I e II do art. 54) | CMS-01 / art. 54, §1º | [ ] |
| OP-ALC-04 | Aprovação em caso de grande dispersão de preços | Setor competente — _a definir internamente_ | Análise crítica obrigatória registrada no processo | CMS-01 / art. 55, §2º; IN-01 / R-06 | [ ] |
| OP-ALC-05 | Autorização de contratação direta | Autoridade competente da CMS | Após instrução processual completa (docs. obrigatórios do art. 11 do Decreto 10.297) | MUN-02 / arts. 3º–5º | [x] |

### 6.3 Critérios de Aderência

| Código | Critério | Detalhe | Norma base | Status |
|---|---|---|---|---|
| OP-ADH-01 | Janela temporal para contratação similar ser válida | **12 meses** anteriores à data da pesquisa de preços (em execução ou concluídas) | CMS-01 / art. 60, II; MUN-01 / art. 24, IV | [x] |
| OP-ADH-02 | Critério estatístico para exclusão de preços discrepantes — aquisições | Preços **> 30% acima ou abaixo da mediana** são exorbitantes/inexequíveis e devem ser excluídos | CMS-01 / art. 57, III (com redação do Ato da Mesa nº 4/2024) | [x] |
| OP-ADH-03 | Critério estatístico para exclusão de preços discrepantes — obras/engenharia | Preços **> 75% acima ou abaixo da mediana** são exorbitantes/inexequíveis | CMS-01 / art. 57, II | [x] |
| OP-ADH-04 | Mínimo de preços válidos no Quadro Demonstrativo | **≥ 3 preços válidos** após tratamento estatístico | CMS-01 / art. 58 | [x] |
| OP-ADH-05 | Similaridade técnica exigida para contratação similar | _a verificar com assessoria jurídica_ — norma não detalha grau mínimo; verificar IN 65/2021 | IN-01; CMS-01 / art. 54, II | [ ] |
| OP-ADH-06 | Restrição geográfica para contratações similares | Não há restrição geográfica expressa nas normas consultadas | CMS-01 / art. 54, II; MUN-01 / art. 24, IV | [x] |

### 6.4 Regras de Exceção

| Código | Situação | Condição para exceção | Aprovador | Norma base | Status |
|---|---|---|---|---|---|
| OP-EXC-01 | Menos de 3 fornecedores/preços consultados | Justificativa formal registrada no processo administrativo | Setor competente (a definir internamente) | CMS-01 / art. 55, §4º | [ ] |
| OP-EXC-02 | Não uso de fontes prioritárias (PNCP/contratações similares) | Demonstração formal da impossibilidade; fontes I e II do art. 54 são de uso prioritário | Setor competente (a definir internamente) | CMS-01 / art. 54, §1º; IN-01 / R-07 | [ ] |
| OP-EXC-03 | Proposta fora do prazo de validade de 180 dias aceita | Justificativa no processo + aplicação de índice de atualização de preços correspondente | Setor competente (a definir internamente) | CMS-01 / art. 56, §2º | [x] |
| OP-EXC-04 | Uso isolado de um único parâmetro de pesquisa | Justificativa no procedimento; uso combinado é a regra | Setor competente (a definir internamente) | CMS-01 / art. 54, §2º | [x] |
| OP-EXC-05 | Pesquisa de preços para inexigibilidade | Justificativa com base em contratos de objetos idênticos do futuro contratado (NF últimos 12 meses) ou objetos semelhantes de mesma natureza | Autoridade competente | CMS-01 / art. 63 | [x] |

### 6.5 Templates e Documentos Obrigatórios

| Código | Documento | Conteúdo mínimo obrigatório (norma) | Gerado em | Status |
|---|---|---|---|---|
| OP-TPL-01 | Quadro Demonstrativo de Preços | Descrição do objeto; setor/servidor responsável; fontes consultadas; série de preços coletados; método estatístico; justificativas de desconsideração; memória de cálculo; justificativa de escolha dos fornecedores (se pesquisa direta) | Relatório final da pesquisa | [x] |
| OP-TPL-02 | Solicitação formal de cotação ao fornecedor | Deve exigir: descrição do objeto, valor unitário e total, CPF/CNPJ, endereços e telefone, data de emissão, nome e identificação do responsável | Módulo de disparo de e-mail | [x] |
| OP-TPL-03 | Justificativa de exceção (< 3 fornecedores) | Registro formal da impossibilidade de consultar ≥ 3 fornecedores + relação dos consultados e dos que não responderam | Exceção OP-EXC-01 | [ ] |
| OP-TPL-04 | Registro de fornecedores que não responderam | Lista com identificação de todos os fornecedores consultados que não enviaram proposta | Módulo de cotações (SLA) | [x] |
| OP-TPL-05 | Justificativa de não uso de fonte pública prioritária | Demonstração da impossibilidade de uso do PNCP e de contratações similares | Exceção OP-EXC-02 | [ ] |

---

## 7. Pontos de Atenção Jurídica (Conflitos e Lacunas)

Registra onde as normas de diferentes níveis divergem, são silentes ou exigem interpretação.
**Estes pontos devem ser resolvidos com a assessoria jurídica antes da implementação no M7.**

| Código | Tema | Tensão / Lacuna | Hierarquia aplicável | Resolução |
| --- | --- | --- | --- | --- |
| ATJ-01 | Aplicabilidade dos Decretos Municipais (10.222 e 10.297) à CMS | Os decretos são do Poder Executivo (Prefeitura). A CMS é do Poder Legislativo e se autorregulamenta pelo Ato da Mesa nº 17/2023. Os decretos municipais NÃO vinculam a CMS, mas são referência interpretativa subsidiária. | Ato da Mesa nº 17/2023 prevalece no âmbito da CMS | Confirmar com assessoria jurídica se alguma cláusula dos decretos se aplica diretamente à CMS |
| ATJ-02 | Prazo de cotação direta: Ato da Mesa (5 dias úteis) vs. Decreto 10.222 (máx. 6 meses do edital) | O Ato da Mesa estabelece prazo mínimo de resposta de 5 dias úteis (art. 56, I). O Decreto 10.222 fixa prazo máximo de 6 meses da divulgação do edital (art. 24, V). São critérios diferentes (prazo de resposta vs. prazo de validade da pesquisa). | Ato da Mesa nº 17/2023 — aplicável à CMS | Não há conflito real: 5 dias úteis é o prazo de resposta; 180 dias é a validade da proposta (art. 60, III do Ato da Mesa). Registrar assim no sistema. |
| ATJ-03 | Aplicabilidade de normas estaduais de SP à CMS | Não foram identificadas normas estaduais com aplicação direta à pesquisa de preços da CMS | Lei 14.133/2021 e Ato da Mesa nº 17/2023 | Verificar com assessoria jurídica se há decreto estadual regulamentador da Lei 14.133 aplicável |
| ATJ-04 | Alçadas internas de aprovação não definidas no Ato da Mesa | O Ato da Mesa não define os cargos/funções internos da CMS responsáveis por aprovar exceções (OP-ALC-02, 03, 04 e OP-EXC-01, 02) | Ato da Mesa nº 17/2023 / normas internas da CMS | Definir internamente com a Divisão de Compras e registrar em norma operacional própria antes do M7 |
| ATJ-05 | Grau mínimo de similaridade técnica para contratação similar | Nem a IN 65/2021 nem o Ato da Mesa definem critério objetivo de "similaridade" — fica à interpretação do agente público | IN-01; CMS-01 / art. 54, II | Definir critério interno (ex.: mesmo CATMAT/CATSER ou especificação técnica ≥ X% compatível) com assessoria |

---

## 8. Histórico de Atualizações

| Data | Seção alterada | Descrição da mudança | Responsável |
| --- | --- | --- | --- |
| 2026-06-14 | Criação | Estrutura inicial do documento | Divisão de Compras / CMS |
| 2026-06-14 | Todas | Preenchimento com base nos 4 documentos normativos: Ato da Mesa nº 17/2023, Lei 14.133/2021, Decreto Municipal nº 10.222/2023 e Decreto Municipal nº 10.297/2023 | Claude Code / Divisão de Compras |

---

_Responsável pelo preenchimento e revisão jurídica: Divisão de Compras / CMS_
_Este documento é insumo direto para `lib/domain/` — qualquer regra aqui deve ter código correspondente no M7._
