# PROJECT ARCHITECTURE: Meu Projeto

## 1. CONTEXT & PROBLEM

A dor real é a baixa produtividade na obtenção de preços válidos para instrução dos processos de cotação, especialmente na busca por contratações públicas similares, pesquisas em sites eletrônicos admissíveis e localização de fornecedores diretos aptos a responder por e-mail. Hoje, essa etapa é manual, fragmentada e depende muito da experiência individual do servidor, o que aumenta o tempo de ciclo, gera retrabalho e dificulta montar uma pesquisa de preços juridicamente robusta.

O impacto é direto: atraso na tramitação dos processos, dificuldade para atingir rapidamente uma cesta de preços confiável, risco de uso de fontes inadequadas e maior chance de o processo voltar para correção por falta de justificativa, evidência ou consistência metodológica. Como a IN 65/2021 prioriza fontes públicas e exige formalização da pesquisa com série de preços, justificativas e registro dos fornecedores consultados, o gargalo operacional acaba virando também um risco de conformidade.

## 2. PROPOSED SOLUTION

A solução é construir uma plataforma web interna de orquestração da pesquisa de preços, desenhada especificamente para a fase mais crítica da cotação pública: descobrir, qualificar, registrar e consolidar preços com rapidez e rastreabilidade. Em vez de o servidor começar a busca do zero em cada processo, o sistema orienta a melhor rota de pesquisa conforme o tipo de objeto e centraliza contratações públicas similares, sites eletrônicos válidos e fornecedores diretos em um único fluxo operacional.

Na prática, a plataforma resolve o problema ao: priorizar fontes públicas, sugerir estratégias por tipo de item, validar evidências mínimas de cada fonte, organizar disparos de e-mail para fornecedores, controlar respostas e gerar uma série de preços pronta para memória de cálculo e instrução processual. Esse desenho segue a lógica já usada pelo módulo oficial Pesquisa de Preços do Compras.gov.br, que reúne diferentes parâmetros da IN 65/2021 em uma mesma pesquisa e relatório.

## 3. FUNCTIONAL REQUIREMENTS

Login e Autenticação, para controlar acesso dos servidores e manter rastreabilidade por usuário em cada pesquisa.

Dashboards, para acompanhar processos em andamento, fontes já pesquisadas, taxa de resposta de fornecedores e gargalos do setor.

Multi usuário, porque a operação envolve assistentes, estagiários, analistas jurídicos e diretoria atuando sobre o mesmo fluxo.

Permissões por usuário, separando quem pesquisa, quem revisa e quem aprova, em linha com a necessidade de segregação funcional.

Notificações, para alertar sobre prazo de resposta de fornecedores, pendências documentais e pesquisas sem fonte pública suficiente.

Relatórios e Exportação, para gerar relatório resumido, relatório completo e memória de cálculo da pesquisa de preços.

Integrações (API), para conexão com bases públicas, e-mail e eventualmente Google Drive, Google Sheets e Backsite.

Upload de Arquivos, para anexar propostas, prints, PDFs, e-mails, TR e documentos comprobatórios.

Busca e Filtros, para localizar contratações similares por item, período, quantidade, localidade, fornecedor e aderência.

Onboarding do Usuário, para ensinar o fluxo correto de pesquisa e padronizar a operação entre servidores.

Funcionalidades específicas do produto:

Cadastro estruturado do objeto, com descrição, unidade, quantidade, características técnicas e palavras-chave.

Motor de estratégia de busca, que sugere a ordem ideal entre contrato similar, site eletrônico e fornecedor direto.

Módulo de contratações públicas similares, com classificação de aderência e histórico reutilizável.

Validador de sites eletrônicos, com bloqueio de marketplaces e captura de data e hora do acesso.

Cadastro vivo de fornecedores, com categoria, contatos, histórico de resposta e score operacional.

Disparo de e-mails de cotação com template padronizado e controle de SLA.

Checklist automático de validade da proposta recebida, com CNPJ, descrição, valor, data e responsável.

Consolidação automática da série de preços com média, mediana ou menor valor e justificativa metodológica.

Não faz sentido priorizar, nesta versão, Kanban, Multi empresa, Parte premium, Chat/Mensagens, Calendário e Landing Page como núcleo do produto, porque o ganho principal está na inteligência operacional da pesquisa de preços, não em recursos comerciais ou de colaboração social

## 4. USER PERSONAS

Os principais usuários são servidores do setor de compras da Câmara Municipal de Santos que precisam instruir processos com rapidez, padronização e segurança documental. Eles não precisam de um software genérico de procurement; precisam de uma ferramenta especializada para encontrar e validar preços dentro da lógica exigida pela pesquisa de preços pública. Não precisa de Tipos de Usuários

## 5. TECHNICAL STACK

Para esse projeto, a stack mais coerente é:

Next.js, para construir uma aplicação web robusta com rotas, painéis e boa base para integrações.

React, para interface dinâmica e componentização dos fluxos operacionais.

Tailwind CSS, para acelerar a construção do front-end interno.

shadcn/ui, para componentes consistentes de tabelas, formulários, modais, filtros e dashboards.

Node.js, para integrações, automações e serviços de backend.

TypeScript, para aumentar segurança e manutenção do código.

PostgreSQL, para guardar processos, fontes, fornecedores, logs, respostas e histórico de pesquisa.

Prisma, para modelagem e acesso ao banco com produtividade.

Resend (e-mails), para disparo controlado de solicitações de orçamento e lembretes.

Vercel, se a implantação for web moderna com ambiente gerenciável, embora em contexto institucional também possa haver hospedagem própria.

Supabase pode ser opção se você quiser acelerar autenticação, banco e storage, mas PostgreSQL + Prisma já atende muito bem esse cenário.

## 6. DESIGN LANGUAGE

Como referência visual, o ideal é um produto com cara de sistema administrativo moderno: limpo, funcional, sóbrio e com forte ênfase em tabelas, filtros, evidências e status. A inspiração deve vir mais de produtos como Linear, Notion, Vercel Dashboard e sistemas internos de compliance do que de landing pages comerciais chamativas.

Direção visual recomendada:

Estética institucional moderna, com aparência séria e confiável.

Interface clara, com foco em produtividade, leitura rápida e pouco ruído visual.

Tabelas fortes, filtros evidentes, painéis compactos e status bem destacados.

Paleta neutra com uma cor principal discreta, evitando visual “startup colorida”.

Boa hierarquia para processo, fonte, evidência, resposta do fornecedor e resultado final.

Referências conceituais de design:

| Referência | O que aproveitar |
|---|---|
| Linear | Clareza, densidade informacional e navegação limpa. |
| Notion | Estrutura de blocos, organização e legibilidade. |
| Vercel Dashboard | Sobriedade visual e boa hierarquia de dados. |
| Retool / internal tools | Layout funcional para operações internas. |
| Compras.gov / Painel de Preços, como referência funcional | Estrutura de filtros, relatórios e lógica de pesquisa. |

## 7. PROCESS

- Break app build into logical milestones (steps)
- Each milestone should be a deliverable increment
- Prioritize core functionality first, then iterate
- Test each milestone before moving to the next

---
> Generated by NoCodeStartup Framework — optimized for Claude Code
