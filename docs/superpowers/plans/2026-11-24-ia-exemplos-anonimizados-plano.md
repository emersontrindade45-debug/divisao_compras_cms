# Plano — IA com exemplos anonimizados (M30.d)

Desenho aprovado: `docs/superpowers/specs/2026-11-24-ia-exemplos-anonimizados-design.md`.
Tudo local e com teste. Nada de push, migration em produção ou variável na Vercel sem autorização.

1. Domínio puro `domain/cotacaoEmail/exemplosIa.ts`: filtro de anonimato, semelhança por palavras, escolha de exemplos (1 de cada classe quando houver), mapa situação→classe.
2. Prompt (`classificarComIa.ts`): bloco "casos já decididos" por item, só na 1ª leitura; revisor nunca recebe.
3. Schema `ExemploClassificacaoIa` + migration aditiva (não aplicada).
4. Servidor `emailCotacao/exemplosIa.ts`: flag `IA_EXEMPLOS`, carga com `select` explícito, anexar aos itens; ligar em `sincronizar.ts` (revisor sem exemplos).
5. Coleta: casos decididos sem exemplo → ação `trechos` do script → Zod → rejeita o que não parece anônimo → grava.
6. Script do Google: ação `trechos` no `doPost`, ids validados, até 30 por chamada.
7. Rota `/api/jobs/coletar-exemplos` (fail-closed) + ação do botão + 3º passo do agendador.
8. `scripts/medir-exemplos.ts` (com × sem, deixar-um-de-fora) e ação de apagar tudo.

Verificação: testes + mutação por tarefa, typecheck, lint, suíte inteira. Medição real só depois que houver exemplos em produção.
