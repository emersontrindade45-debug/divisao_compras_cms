# Spike do M18 — CADTERC / BEC-SP (executado em 2026-08-07)

Registrado no formato dos spikes anteriores (§4.1 e §4.2 do `ApiPlan.md`). Nada aqui é dedução:
cada afirmação tem uma requisição HTTP real por trás, com data e URL citadas. Fontes acessadas:
`www.bec.sp.gov.br`, `compras.sp.gov.br` (o portal atual — a BEC/SP redireciona para ele) e os
PDFs dos cadernos hospedados em `compras.sp.gov.br/wp-content/uploads/...`.

## 1. O que é o CADTERC, confirmado contra a fonte

A página oficial (`https://compras.sp.gov.br/agente-publico/cadterc/`, HTTP 200 em 2026-08-07)
descreve: *"Os Estudos Técnicos de Serviços Terceirizados – CADTERC objetivam divulgar as
diretrizes para contratações de fornecedores de serviços terceirizados pelos órgãos da
Administração Pública Estadual, com padronização de especificações técnicas **e preços
referenciais**."* Confirma a premissa do plano — a fonte carrega preço, não só especificação.

O antigo endereço do sistema BEC/SP (`www.bec.sp.gov.br`) está com o domínio ativo, mas em
manutenção declarada: a página inicial (`.../BECSP/Home/Home.aspx`, HTTP 200) exibe um aviso de
"Comunicado de Manutenção" para o período **31/07/2026 a 07/08/2026** e direciona todo contato
para `compras.sp.gov.br`. O CADTERC hoje mora só no portal novo; a URL antiga
(`Cadastro_Servicos_Terceirizados.aspx`, citada de memória em pesquisas antigas) devolve
"Endereço inexistente!!!" — confirma que a estrutura de URLs do sistema antigo mudou e não é mais
confiável como referência.

## 2. Pergunta 1 — legível por máquina ou só leitura manual?

**Só PDF de leitura manual, confirmado.** Os seis "cadernos" listados na página
(Vol. 01 Vigilância Patrimonial, Vol. 02 Portarias, Vol. 03 Limpeza Predial, Vol. 07 Limpeza
Hospitalar, Vol. 13 Vigilância Eletrônica, Vol. 19 Recepção) são links diretos para arquivos
`.pdf` em `wp-content/uploads/`. Não há CSV, XLSX, JSON nem endpoint de API na página nem
referenciado por ela. O Vol. 02 (Portarias) nem PDF tem — é rotulado "Catálogo Eletrônico de
Padronização", sem link de download na página (provavelmente um sistema interno à parte, fora do
escopo verificável aqui).

Baixei dois PDFs que respondiam (ver §3) e rodei `pdftotext -layout` neles. O preço de referência
por posto está de fato lá — ex., no Vol. 19 (Recepção), "Quadro 21: Estimativa dos preços
referenciais (R$/dia) por regime dos postos":

```
Posto de Recepcionista diurno – 44 horas semanais – 2ª a 6ª feira        R$ 323,28
Posto de Recepcionista diurno – 12 horas diárias – 2ª a 6ª feira         R$ 430,69
Posto de Recepcionista diurno – 08 horas diárias – 2ª feira a domingo    R$ 307,97
Posto de Recepcionista diurno – 12 horas diárias – 2ª feira a domingo    R$ 411,58
Posto de Recepcionista noturno – 12 horas diárias – 2ª feira a domingo   R$ 469,83
Posto de Recepcionista diuturno – 24 horas diárias – 2ª feira a domingo  R$ 881,42
```

Mas isso é **um quadro de resumo dentro de ~65 páginas de texto corrido e composições de custo
detalhadas** (mão de obra, encargos sociais, benefícios, BDI — dezenas de "Quadros" numerados por
página, sem marcação estrutural — nenhum separador de coluna/linha estável entre eles).
`pdftotext -layout` extrai o quadro-resumo de forma legível porque o PDF usa espaçamento fixo
nessa página específica, mas não há garantia de que esse layout se mantenha entre cadernos ou
entre revisões — o próprio texto virou uma tabela por acidente de diagramação, não por desenho
para ser parseado. Cada caderno cobre um objeto diferente (Recepção tem "postos" por escala de
horário; Vigilância Eletrônica, por exemplo, teria outra unidade de medida) — um parser precisaria
de um mapeamento manual por caderno, não um parser único reaproveitável como o do SINAPI/CATMAT.

**Conclusão da pergunta 1: não há dado estruturado. Todo o conteúdo é PDF de leitura humana**, com
uma tabela-resumo por caderno que só é semi-extraível por heurística de layout de texto, sujeita a
quebrar a cada nova versão do PDF sem aviso algum (mesmo modo de risco da nota de "Riscos" do
plano para o M17 — layout de planilha que muda entre competências e quebra em silêncio — só que
aqui não há nem "competência" com estrutura fixa para ancorar a expectativa).

## 3. Pergunta 2 — periodicidade de atualização

**Irregular, por caderno, não por calendário fixo.** Cada volume carrega seu próprio cabeçalho de
"Data-base" e "Versão":

| Caderno | Data-base | Versão | Publicação (mês/ano do upload) |
|---|---|---|---|
| Vol. 19 — Recepção | Janeiro/2026 | 1: Julho/2026 | `/uploads/2026/07/` |
| Vol. 13 — Vigilância Eletrônica | Janeiro/2026 | 01: Abril/2026 | `/uploads/2026/04/` |
| Vol. 01 — Vigilância Patrimonial | (não verificado — link 404, ver §4) | — | `/uploads/2026/08/` |
| Vol. 03 — Limpeza Predial | (não verificado — link 404, ver §4) | — | `/uploads/2026/08/` |
| Vol. 07 — Limpeza Hospitalar | (não verificado — link 404, ver §4) | — | `/uploads/2026/08/` |

A página também expõe abas "Estudos Técnicos 2026 / 2025 / 2024 / Antigos" — carregadas
por JS/AJAX e não presentes no HTML estático capturado por `curl`, então o **histórico de
revisões por caderno não foi verificável neste spike** (ver §5). O que dá para afirmar com
evidência direta: não existe uma competência mensal única como a do SINAPI — cada caderno é
revisado em data própria (Recepção em julho, Vigilância Eletrônica em abril, ambos com
data-base comum de janeiro/2026, sugerindo um reajuste anual de base com revisões pontuais de
versão ao longo do ano).

## 4. Pergunta 3 — URL estável por caderno?

**Não.** Confirmado por evidência direta, não hipótese: dos 4 PDFs de caderno listados na página
em 2026-08-07, **2 devolveram 404** ao serem baixados na mesma sessão, minutos depois de terem
sido lidos da própria página oficial:

| Caderno | URL listada na página | Resultado |
|---|---|---|
| Vol. 19 — Recepção | `.../2026/07/P07_Recepcao_Vol19_V1A-1-1.pdf` | HTTP 200, 1,3 MB |
| Vol. 13 — Vigilância Eletrônica | `.../2026/04/P05_Estudo_SEM_Marcas_Revisao_Vol13_2026_V1-1.pdf` | HTTP 200, 7,2 MB |
| Vol. 01 — Vigilância Patrimonial | `.../2026/08/P01_Vig_Patrimonial_Vol01_V1A_CNP.pdf` | **HTTP 404** |
| Vol. 03 — Limpeza Predial | `.../2026/08/P03_Limpeza_Predial_Vol03_V1B.pdf` | **HTTP 404** |

O 404 é da própria aplicação WordPress do portal (`<title>Página não encontrada – Portal de
Compras</title>`), não de bloqueio anti-bot — o `Referer` correto e um `User-Agent` de navegador
não mudaram o resultado. O padrão do path (`wp-content/uploads/AAAA/MM/nome-com-sufixo-de-
versão.pdf`) é o de um upload manual de mídia do WordPress: o mês no caminho é o mês do último
upload, o sufixo de versão (`V1A`, `V1B`, `V1-1`) é escrito à mão no nome do arquivo, e nada
nesse esquema sobrevive a uma reedição do caderno — republicar o Vol. 03 move o arquivo para
`/uploads/2026/09/` (ou qualquer mês seguinte) com um nome novo, e o link antigo, se citado em
algum processo, morre. Dois cadernos dos quatro checados já estavam quebrados **na própria
página que os lista**, o que é evidência de que isso não é hipotético — está acontecendo agora.

**Conclusão da pergunta 3: não há URL estável por caderno.** Uma evidência arquivada hoje
(`urlEvidencia` num `PrecoReferencia`, se este milestone tivesse ingestão) tem risco concreto e já
demonstrado de apontar para 404 amanhã — o oposto do que a §9.8/regra de conformidade do CLAUDE.md
exige ("nenhum preço entra na estimativa sem vínculo a fonte, data e evidência **armazenada**").

## 5. O que não foi possível verificar (declarado explicitamente, não presumido)

- Conteúdo dos cadernos Vol. 01 (Vigilância Patrimonial) e Vol. 03 (Limpeza Predial) — os dois
  candidatos mais óbvios para "limpeza" e "vigilância", citados no objetivo do M18 — não foi lido
  porque os links quebraram antes da leitura (§4). Não há como confirmar se o formato do
  quadro-resumo se repete neles sem baixá-los por outro caminho (ex.: cache, Wayback Machine —
  não tentado neste spike).
- Histórico de revisões por caderno (abas "2025", "2024", "Antigos") — carregado via JS/AJAX, não
  presente no HTML estático capturado por `curl`; não foi possível medir a frequência real de
  atualização ao longo de vários anos, só a "foto" de 2026-08-07.
- Vol. 02 (Portarias) — descrito como "Catálogo Eletrônico de Padronização", sem link de PDF na
  página. Pode ser outro sistema (talvez com dado mais estruturado), não investigado.
- Enquadramento legal exato (inciso da Lei 14.133/IN 65 que autoriza tabela de referência
  **estadual**) — não verificado contra o texto da lei, mesma ressalva já registrada para o
  Compras.gov (§9.35, `fontesComprasGov.ts`). Fica para quando/se este milestone avançar.

## 6. Recomendação

**(c) Descartar a ingestão automática. Não implementar código de ingestão/parsing neste
milestone.**

Razões, na ordem do que mais pesa:

1. **Falha no filtro F1 do próprio plano (§2 do `ApiPlan.md`) de forma mensurada, não hipotética.**
   "A fonte produz preço com fonte + data + URL/documento citável e arquivável?" — metade dos
   cadernos testados já não tem URL válida na própria página que os anuncia. Arquivar o PDF no
   momento da consulta (mitigando o link morto) resolveria a citabilidade da evidência, mas não
   resolve o problema de fundo: não há dado estruturado para ingerir, só texto corrido.
2. **Não há uma tabela para ingerir, no sentido do M15/M16/M17.** O runner genérico
   (`src/lib/ingestao/runner.ts`) espera `parsearLinhas`/`normalizarLinha` sobre um arquivo com
   estrutura repetível. O CADTERC não oferece isso: cada caderno tem layout de PDF próprio, uma
   tabela-resumo pequena (6 a ~10 linhas) cercada de dezenas de páginas de texto e tabelas de
   composição de custo sem marcação, e dois dos quatro cadernos verificados sequer abriram. Um
   parser "genérico" aqui seria na prática um parser por caderno, escrito à mão, e ainda assim
   frágil a qualquer reedição — o preço do esforço não compensa o retorno (poucas dezenas de
   linhas de preço por caderno, ~6 cadernos).
3. **A opção (b) do plano — cadastro manual como tabela interna — é estritamente melhor para este
   volume de dado.** Os quadros-resumo de preço referencial por posto (a informação que
   efetivamente interessa à pesquisa de preço) somam algumas dezenas de linhas no total dos
   cadernos existentes. Cadastrar isso manualmente, com a data de leitura e o link para o PDF
   (baixado e arquivado no momento do cadastro, não referenciado ao vivo) demora menos e produz
   dado mais confiável do que escrever e manter um parser de PDF heurístico para uma fonte que já
   demonstrou ter a metade dos links quebrados.

**Não implementado neste milestone**: nenhum model novo, nenhum provedor, nenhum parser. A
fundação do M15 (`FonteReferencia`, `LoteIngestao`, `PrecoReferencia`, runner genérico) já
comporta a opção (b) se e quando o usuário decidir seguir por ela — o cadastro manual pode entrar
como registros com `LoteIngestao` de origem "manual" (o schema não exige que `baixar()` venha de
HTTP), e a justificativa automática do §2 do M18 se aplica igual, mas isso é trabalho de UI/action
que só faz sentido depois da decisão do usuário sobre a opção (b), que este spike não pode tomar
sozinho (o próprio plano exige "decisão com o usuário depois do spike, não antes").

## 7. Decisão pendente do usuário

Este spike recomenda (c)/(b) híbrido — descartar ingestão automática, e considerar (b) cadastro
manual como trabalho futuro separado, sujeito a demanda real (será que a Câmara de fato contrata
serviços cobertos por algum dos 4-6 cadernos existentes? o objetivo do M18 cita limpeza,
vigilância, recepção, copeiragem — copeiragem não aparece em nenhum caderno hoje encontrado).
Nenhuma linha de código de ingestão foi escrita. Fica para o usuário decidir se abre um milestone
de cadastro manual (fora deste M18 tal como planejado, ou como continuação dele) ou se descarta de
vez, dado o baixo volume de dado e o risco de manutenção.
