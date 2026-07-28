import { analisarResposta, type Trecho } from "@/lib/assistente/formatacao";

// Renderiza a resposta do assistente a partir da árvore de `formatacao.ts`.
//
// Monta elementos React, nunca HTML: o conteúdo vem de um modelo de linguagem
// (e, via busca web, de páginas que ele leu), então é entrada não confiável. O
// projeto não tem um `dangerouslySetInnerHTML` sequer — este componente mantém
// isso verdadeiro. Toda a decisão de "o que é negrito" mora no parser puro, que
// é testado isoladamente; aqui só há mapeamento para tags.

function TrechoInline({ trecho }: { trecho: Trecho }) {
  switch (trecho.tipo) {
    case "negrito":
      return <strong className="font-semibold">{trecho.texto}</strong>;
    case "italico":
      return <em>{trecho.texto}</em>;
    case "codigo":
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {trecho.texto}
        </code>
      );
    case "link":
      return (
        <a
          href={trecho.url}
          target="_blank"
          // `noreferrer` junto de `noopener`: o destino é escolhido pelo modelo,
          // e não deve receber referência à janela nem o cabeçalho de origem.
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {trecho.texto}
        </a>
      );
    default:
      return <>{trecho.texto}</>;
  }
}

function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((trecho, indice) => (
        <TrechoInline key={indice} trecho={trecho} />
      ))}
    </>
  );
}

export function RespostaFormatada({ conteudo }: { conteudo: string }) {
  const blocos = analisarResposta(conteudo);

  return (
    <div className="space-y-2 text-sm">
      {blocos.map((bloco, indice) => {
        if (bloco.tipo === "paragrafo") {
          // `whitespace-pre-wrap` preservado: quebra de linha simples dentro de
          // um parágrafo é intencional na resposta do modelo.
          return (
            <p key={indice} className="whitespace-pre-wrap">
              <Trechos trechos={bloco.trechos} />
            </p>
          );
        }

        const Lista = bloco.ordenada ? "ol" : "ul";
        return (
          <Lista
            key={indice}
            className={
              bloco.ordenada
                ? "list-decimal space-y-1 pl-5"
                : "list-disc space-y-1 pl-5"
            }
          >
            {bloco.itens.map((item, posicao) => (
              <li key={posicao}>
                <Trechos trechos={item} />
              </li>
            ))}
          </Lista>
        );
      })}
    </div>
  );
}
