# PRD — Plataforma de Obtenção de Preços para a Divisão de Compras da Câmara Municipal de Santos

## Visão do produto

Este PRD define um produto voltado especificamente para resolver o principal gargalo operacional da Divisão de Compras da Câmara Municipal de Santos: obter preços válidos, comparáveis e defensáveis com rapidez suficiente para instruir os processos de cotação.[cite:30][cite:2] O foco do produto não é o processo de compras inteiro, mas a etapa crítica de descoberta, qualificação, coleta, consolidação e validação de preços por três fontes principais: contratações públicas similares, sítios eletrônicos admissíveis e fornecedores diretos consultados por e-mail.[cite:30]

A proposta é criar uma camada operacional que transforme a busca de preços em um fluxo guiado, com inteligência de priorização, checklists normativos, rastreabilidade completa e reaproveitamento de evidências, reduzindo o tempo de pesquisa e aumentando a segurança jurídica da estimativa.[cite:30][cite:32]

## Problema central

Hoje, a maior perda de produtividade está concentrada na fase de obtenção dos preços porque cada processo exige descobrir onde pesquisar, como validar a aderência do item, como filtrar fontes inadequadas e como documentar tudo de forma suficiente para resistir à revisão jurídica e à instrução do processo.[cite:30] Esse gargalo se desdobra em tarefas manuais repetitivas, baixa padronização entre servidores, dificuldade para encontrar contratações realmente comparáveis, perda de tempo com sites inadequados e demora no retorno de fornecedores consultados por e-mail.[cite:31][cite:32]

Além disso, a IN 65/2021 determina que a pesquisa seja formalizada com descrição do objeto, fontes consultadas, série de preços, método estatístico, memória de cálculo e justificativa da escolha dos fornecedores na pesquisa direta.[cite:30] Isso significa que o problema não é apenas “achar preço”, mas achar preço de forma auditável, metodologicamente consistente e alinhada às condições comerciais do objeto.[cite:30]

## Objetivo do produto

O produto deve permitir que a equipe encontre preços mais rápido, com melhor qualidade e com menos retrabalho, organizando a operação em torno de três perguntas: onde buscar primeiro, quando a fonte é válida e como transformar a coleta em evidência processual pronta para uso.[cite:30][cite:2] O sistema deve reduzir o tempo entre o recebimento do processo e a conclusão da pesquisa, aumentar o percentual de pesquisas aprovadas na primeira revisão e diminuir a dependência de conhecimento tácito dos servidores mais experientes.[cite:30][cite:31]

Objetivos específicos:

- Priorizar automaticamente fontes públicas e contratações similares, como exige a IN 65/2021.[cite:30]
- Acelerar a identificação de itens comparáveis em contratos públicos.[cite:2]
- Filtrar sites eletrônicos admissíveis e bloquear uso indevido de marketplaces na rotina operacional definida pelo setor.[cite:30][cite:38]
- Estruturar o envio e o controle de cotações por e-mail para fornecedores diretos.[cite:30][cite:32]
- Consolidar a série de preços com memória de cálculo e justificativas prontas para os autos.[cite:30]

## Resultado esperado

Ao final da operação, cada processo deve sair da plataforma com um dossiê mínimo de pesquisa contendo: fontes usadas, evidências anexas, justificativas de escolha, registro de tentativas, série de preços tratada criticamente e preço estimado calculado segundo método aceito.[cite:30][cite:2] O produto deve tornar a etapa de obtenção de preços repetível, mensurável e menos dependente de busca manual dispersa.[cite:2][cite:32]

## Base normativa do produto

A IN SEGES/ME nº 65/2021 estabelece que a pesquisa de preços pode usar parâmetros combinados, entre eles contratações similares feitas pela Administração Pública no período de um ano, sítios eletrônicos especializados ou de domínio amplo atualizados e pesquisa direta com, no mínimo, três fornecedores.[cite:30] O mesmo artigo determina a priorização dos parâmetros públicos dos incisos I e II e exige justificativa nos autos quando isso não for possível.[cite:30]

A norma também exige que propostas de fornecedores contenham, no mínimo, descrição do objeto, valor unitário e total, CNPJ ou CPF, contatos, data de emissão e identificação do responsável, além do registro dos fornecedores consultados que não responderam.[cite:30] Para o cálculo do preço estimado, a IN admite média, mediana ou menor valor, com análise crítica e descarte fundamentado de valores inexequíveis, inconsistentes ou excessivamente elevados.[cite:30]

A ferramenta oficial Pesquisa de Preços do Compras.gov.br existe justamente para apoiar pesquisas aderentes ao artigo 5º da IN 65/2021, permitindo consultar preços dos últimos 12 meses, usar filtros por localização e quantidade, incluir fornecedores e sites eletrônicos na mesma pesquisa e gerar relatórios completos e simplificados.[cite:2] Esse desenho é uma referência direta para a solução proposta neste PRD.[cite:2]

## Escopo do produto

O escopo é restrito à obtenção de preços e à preparação da evidência correspondente, sem substituir integralmente Backsite, Drive ou o fluxo jurídico-administrativo mais amplo.[cite:30] O produto deve atuar como motor de produtividade da pesquisa de preços, concentrando os dados e automações que hoje estão dispersos entre múltiplas ferramentas.[cite:2]

O sistema será dividido em três trilhas principais:

1. Trilhas de busca por contratações públicas similares.[cite:30]
2. Trilhas de busca por sites eletrônicos válidos para objetos comuns.[cite:30]
3. Trilhas de prospecção e gestão de fornecedores diretos por e-mail.[cite:30]

## Usuários

Os usuários operacionais serão assistentes legislativos e estagiários responsáveis pela pesquisa e coleta das evidências.[cite:30] Os usuários de controle serão analistas jurídicos e diretoria, que precisam revisar a aderência da fonte, a suficiência documental e a consistência da metodologia.[cite:30]

## Proposta de solução

A solução deve funcionar como uma “central de obtenção de preços”, onde o servidor inicia a pesquisa com base no objeto e o sistema orienta a estratégia mais adequada conforme o tipo de item, grau de especificidade, urgência, disponibilidade de histórico e suficiência das fontes públicas.[cite:30] Em vez de deixar a equipe começar do zero em cada processo, o sistema deve sugerir primeiro as melhores rotas de busca, registrar o que foi tentado e dizer quando a evidência já é suficiente para avançar.[cite:30][cite:2]

## Módulo 1 — Orquestrador de estratégia

Ao abrir um processo, o sistema deve classificar o objeto em duas dimensões: grau de padronização do item e grau de especificidade institucional.[cite:30] Com isso, ele deve sugerir a ordem de busca mais eficiente, por exemplo: contratos públicos similares primeiro; depois sites especializados se o item for comum; depois fornecedores diretos se o mercado for restrito ou a base pública for insuficiente.[cite:30]

Regras essenciais:

- Itens comuns: priorizar bases públicas e sites eletrônicos admissíveis.[cite:30]
- Itens específicos ou sob medida: priorizar contratos similares e fornecedores diretos qualificados.[cite:30]
- Ausência de fonte pública suficiente: exigir justificativa registrada antes de intensificar pesquisa com fornecedores.[cite:30]
- Pesquisa direta usada como base central: exigir registro de no mínimo três fornecedores consultados, salvo exceção justificada e aprovada.[cite:30]

## Módulo 2 — Busca de contratações públicas similares

Esse módulo deve ser o núcleo principal da solução porque a norma prioriza parâmetros públicos e porque essa é a fonte mais defensável para estimativa de preços.[cite:30] O sistema deve ajudar a equipe a localizar atas, contratos, homologações e itens comparáveis, organizando resultados por aderência ao objeto, período, quantidade, localidade e condições comerciais.[cite:2][cite:30]

Funcionalidades obrigatórias:

- Cadastro do item com descrição estruturada, unidade, quantidade, características técnicas e palavras-chave.
- Busca assistida em bases oficiais e bases já utilizadas internamente pela Câmara.[cite:2]
- Registro de similaridade entre item do processo e item encontrado, com campo de justificativa.
- Classificação da evidência como “alta aderência”, “aderência parcial” ou “não aderente”.
- Comparação lado a lado entre resultados públicos encontrados.
- Biblioteca interna de referências já usadas em processos anteriores, para reaproveitamento controlado.

Validações obrigatórias:

- O contrato ou registro similar deve estar dentro da janela temporal admitida ou ter justificativa de atualização.[cite:30]
- O item encontrado deve indicar quantidade, condições comerciais e compatibilidade mínima com o objeto.[cite:30]
- O sistema deve forçar anotação quando houver diferença relevante de marca, escopo, instalação, frete, local de entrega ou regime de execução.[cite:30]

## Módulo 3 — Busca em sites eletrônicos admissíveis

Esse módulo deve resolver o problema recorrente de perda de tempo com pesquisas em sites que não servem como evidência adequada para o processo.[cite:30][cite:38] O sistema deve ajudar o usuário a encontrar e registrar apenas sítios eletrônicos especializados ou de domínio amplo, atualizados, compatíveis com objetos comuns e com captura obrigatória da data e hora de acesso.[cite:30]

Funcionalidades obrigatórias:

- Lista branca de domínios aceitos e lista cinza para revisão manual.
- Lista vermelha de marketplaces e intermediários de venda, conforme a rotina operacional do setor e orientação recorrente em manuais de pesquisa de preços.[cite:38]
- Captura automática de URL, data e hora do acesso.[cite:30]
- Extração assistida de preço unitário, descrição do item, disponibilidade e observações comerciais.
- Campo obrigatório para justificar por que o item do site é comparável ao objeto solicitado.

Regras de uso:

- Só pode ser usado como fonte principal para itens comuns, padronizados e facilmente comparáveis.[cite:30]
- Não deve ser a principal fonte para objetos específicos da Câmara ou soluções sob medida.[cite:30]
- O sistema deve alertar quando o site não indicar vendedor próprio, entrega própria ou informações mínimas para validação interna.

## Módulo 4 — Descoberta e qualificação de fornecedores diretos

Esse módulo deve atacar o maior ponto de atraso quando a equipe precisa localizar fornecedores aptos para enviar solicitação formal de orçamento.[cite:30] A solução deve manter um cadastro vivo de fornecedores por categoria, histórico de resposta, qualidade documental e adequação ao tipo de objeto.[cite:30][cite:32]

Funcionalidades obrigatórias:

- Base de fornecedores por segmento, produto e serviço.
- Registro de CNPJ, e-mail, telefone, cidade, site e responsável comercial.
- Etiquetas por categoria de objeto, por exemplo mobiliário, arquivo deslizante, manutenção, tecnologia, material de expediente ou serviços especializados.
- Histórico de processos em que o fornecedor já participou, respondeu, recusou ou foi inválido.
- Score interno de confiabilidade operacional, com base em tempo de resposta e completude documental.

O sistema deve também permitir descoberta assistida de novos fornecedores a partir do objeto pesquisado e registrar a justificativa de escolha dos fornecedores consultados, porque isso é exigido na pesquisa direta prevista na IN 65/2021.[cite:30]

## Módulo 5 — Gestão de e-mails de cotação

A pesquisa direta só ganha produtividade real se a plataforma organizar o disparo, o acompanhamento e a validação das respostas.[cite:30] O sistema deve gerar automaticamente o e-mail de solicitação com número do processo, objeto, prazo final, anexos e condições formais do orçamento.[cite:30]

Funcionalidades obrigatórias:

- Template parametrizável de e-mail.
- Seleção em lote de fornecedores por categoria.
- Registro de data e hora de envio.
- Controle de SLA de resposta compatível com a complexidade do objeto, como exige a IN 65/2021.[cite:30]
- Lembretes automáticos para fornecedores sem resposta.
- Registro de resposta positiva, negativa, incompleta ou silenciosa.[cite:30]
- Armazenamento da relação de fornecedores consultados que não responderam.[cite:30]

## Módulo 6 — Validação do orçamento recebido

O sistema deve validar automaticamente se a proposta recebida contém os elementos mínimos exigidos para ser aproveitada na pesquisa.[cite:30][cite:32] Isso reduz o retrabalho causado por propostas inviáveis e impede que a equipe descubra tardiamente que um orçamento não serve para instrução do processo.[cite:30]

Checklist mínimo de validade:

- Descrição do objeto.[cite:30]
- Valor unitário e total.[cite:30]
- CNPJ ou CPF do proponente.[cite:30]
- Endereço físico, e-mail e telefone.[cite:30]
- Data de emissão.[cite:30]
- Nome e identificação do responsável.[cite:30]
- Compatibilidade com o modelo de orçamento e com o TR enviados pelo setor.[cite:30]

O sistema deve marcar cada proposta como válida, válida com ressalva ou inválida.[cite:30][cite:32]

## Módulo 7 — Consolidação da série de preços

Depois de coletar preços por múltiplas fontes, o sistema deve consolidar automaticamente a série de preços e sugerir o método estatístico aplicável, como média, mediana ou menor valor, com justificativa padronizada.[cite:30][cite:2] Também deve sinalizar grande dispersão de preços e exigir análise crítica quando houver variação relevante.[cite:30]

Saídas obrigatórias:

- Série completa de preços por item.
- Indicação da fonte de cada preço.
- Registro de exclusões e respectiva justificativa.[cite:30]
- Memória de cálculo pronta para os autos.[cite:30]
- Relatório resumido e relatório completo.[cite:2]

## Módulo 8 — Repositório de inteligência de mercado

A cada novo processo, a plataforma deve aprender com o histórico, criando um acervo interno de itens, fornecedores, palavras-chave, fontes bem-sucedidas e justificativas já aceitas.[cite:30] Isso é essencial para cortar tempo de pesquisa em demandas recorrentes e criar padrão institucional, não apenas produtividade individual.[cite:30]

Exemplos de reaproveitamento:

- Fornecedores que respondem rápido por categoria.
- Sites válidos por tipo de item.
- Contratações públicas anteriormente consideradas aderentes.
- Termos de busca que geram melhores resultados.
- Motivos comuns de invalidação de proposta.

## Fluxo operacional alvo

1. Receber o processo e cadastrar o objeto.
2. Classificar o item como comum ou específico.
3. Executar trilha prioritária de contratações públicas similares.[cite:30]
4. Complementar com sites admissíveis, se o item comportar esse tipo de referência.[cite:30]
5. Acionar fornecedores diretos se a suficiência da pesquisa ainda não tiver sido atingida ou se o objeto exigir mercado qualificado.[cite:30]
6. Validar respostas e descartar evidências inadequadas.[cite:30]
7. Consolidar a série de preços e gerar a memória de cálculo.[cite:30]
8. Exportar dossiê para planilha, Drive e Backsite.

## Regras de negócio críticas

1. A plataforma deve sempre sugerir primeiro fontes públicas prioritárias, salvo hipótese justificada.[cite:30]
2. A pesquisa em sites só pode avançar sem alerta quando houver aderência a item comum e domínio admissível.[cite:30][cite:38]
3. A pesquisa direta deve registrar justificativa da escolha dos fornecedores consultados.[cite:30]
4. Fornecedores sem resposta devem constar no processo quando a pesquisa direta for utilizada.[cite:30]
5. Nenhum preço pode compor a estimativa sem vínculo com fonte, data e evidência armazenada.[cite:30]
6. O sistema deve exigir análise crítica quando houver grande variação de preços.[cite:30]
7. Deve ser possível concluir o processo com menos de três preços apenas em situação excepcional justificada e aprovada.[cite:30]

## Métricas de sucesso

As métricas principais devem medir a produtividade exatamente no gargalo da obtenção de preços:

- Tempo médio para encontrar a primeira referência válida por processo.
- Tempo médio para concluir a série mínima de preços.
- Percentual de pesquisas que conseguem usar fonte pública prioritária.[cite:30]
- Percentual de processos que precisam retrabalhar a pesquisa por falha documental.
- Taxa de resposta de fornecedores por categoria.
- Tempo médio de resposta por fornecedor.
- Percentual de propostas invalidadas por ausência de campos mínimos.[cite:30]
- Quantidade média de fontes pesquisadas até atingir suficiência.
- Percentual de reaproveitamento de fornecedores e referências de processos anteriores.

## MVP recomendado

O MVP deve atacar somente o gargalo de obtenção de preços, com foco em ganhos rápidos de produtividade.[cite:30] A primeira versão deve ter:

- Cadastro estruturado do objeto.
- Orquestrador que indique a melhor rota de busca.
- Registro padronizado de contratações públicas similares.
- Validação de sites eletrônicos admissíveis.
- Cadastro vivo de fornecedores.
- Disparo e controle de e-mails de cotação.
- Checklist automático de validade das propostas.
- Consolidação inicial da série de preços.[cite:30][cite:2][cite:32]

## Casos de uso prioritários

### Caso 1 — Item comum de mercado

Exemplo: material de escritório ou item com especificação padronizada.[cite:30] A plataforma deve priorizar contratações públicas similares e complementar com sites eletrônicos admissíveis, minimizando acionamento manual de fornecedores.[cite:30]

### Caso 2 — Objeto institucional específico

Exemplo: solução sob medida ou item com instalação e adaptação ao ambiente da Câmara.[cite:30] A plataforma deve priorizar histórico público aderente e descoberta qualificada de fornecedores diretos, porque a comparação em sites tende a ser fraca.[cite:30]

### Caso 3 — Mercado restrito ou baixa resposta

Quando a equipe consulta fornecedores e recebe poucos retornos, o sistema deve registrar tentativas, sugerir novos fornecedores da base histórica e apontar necessidade de justificativa excepcional se o processo avançar com menos de três propostas.[cite:30]

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Resultado público pouco aderente | Preço estimado fraco | Campo obrigatório de aderência e justificativa |
| Uso de site inadequado | Glosa ou questionamento jurídico | Lista branca, lista vermelha e captura obrigatória de data/hora |
| Baixa resposta de fornecedores | Atraso na cotação | Base viva de fornecedores, follow-up automático e histórico de resposta |
| Propostas incompletas | Retrabalho | Checklist automático de validade antes de aceitar o orçamento |
| Excesso de fontes dispersas | Baixa produtividade | Repositório central e consolidação automática |

## Critérios de aceite

O produto será considerado adequado quando:

- Reduzir o tempo de obtenção de preços em relação ao fluxo atual.
- Indicar claramente ao servidor onde pesquisar primeiro em cada tipo de objeto.
- Separar com segurança sites admissíveis de fontes inadequadas.[cite:30][cite:38]
- Registrar e controlar o ciclo completo de consulta a fornecedores.[cite:30]
- Gerar série de preços e memória de cálculo prontas para instrução do processo.[cite:30][cite:2]
- Permitir revisão jurídica rápida sobre aderência da fonte e suficiência da evidência.[cite:30]

## Direção recomendada

A melhor formulação para esse produto não é um “sistema de compras” amplo, mas um “motor de pesquisa de preços” especializado na fase que hoje consome mais tempo e gera mais atrito operacional.[cite:30][cite:2] Ao focar em contratações públicas similares, sites eletrônicos válidos e fornecedores diretos com gestão de e-mails e validação documental, o setor tende a obter o maior ganho de produtividade com o menor esforço inicial de implantação.[cite:30][cite:32]
