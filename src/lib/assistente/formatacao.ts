// Formatação das respostas do assistente (M13).
//
// O modelo responde em Markdown — e não por acaso: o próprio prompt de sistema
// é escrito com `**negrito**`, então ele espelha o formato que lê. O chat, no
// entanto, renderizava tudo com `whitespace-pre-wrap`, e os asteriscos
// apareciam crus na tela.
//
// Este módulo converte o texto num pequeno arranjo de blocos e trechos. Ele NÃO
// gera HTML: quem renderiza (`RespostaFormatada`) monta elementos React a partir
// desta árvore. É deliberado — texto vindo de um modelo é entrada não confiável,
// e o projeto inteiro não tem um `dangerouslySetInnerHTML` sequer. Manter assim
// significa que nenhuma resposta do assistente pode injetar marcação.
//
// O escopo é o que o modelo de fato emite neste produto: negrito, código
// inline, listas e links. O que não estiver coberto (tabela, heading, citação)
// cai para texto puro, preservado como veio — degradar é melhor que quebrar.

/** Trecho de texto dentro de um parágrafo ou item de lista. */
export type Trecho =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrito"; texto: string }
  | { tipo: "italico"; texto: string }
  | { tipo: "codigo"; texto: string }
  | { tipo: "link"; texto: string; url: string };

export type Bloco =
  | { tipo: "paragrafo"; trechos: Trecho[] }
  | { tipo: "lista"; ordenada: boolean; itens: Trecho[][] };

const ITEM_MARCADOR = /^\s*[-*•]\s+(.*)$/;
const ITEM_NUMERADO = /^\s*\d+[.)]\s+(.*)$/;
/** Linha indentada que continua o item anterior (texto que quebrou de linha). */
const CONTINUACAO = /^\s{2,}\S/;

// Alternativas em ordem de precedência — a primeira que casar vence:
//   1. `código`      — antes de tudo, para que ** dentro de código fique literal
//   2. **negrito**   — antes do itálico, senão `*` casaria primeiro e sobraria `*`
//   3. *itálico*     — conteúdo sem `*`, para não atravessar outro par
//   4. [texto](url)
//
// Todo conteúdo precisa começar e terminar em caractere não-branco. É essa
// regra que impede "3 * 4 = 12 * 2" de virar itálico: depois do primeiro `*`
// vem um espaço, e a alternativa não casa.
//
// `_itálico_` NÃO é suportado de propósito: o domínio é cheio de identificadores
// com underscore (`pendente_equalizacao`, `utilizavel_integralmente`), e dois
// deles na mesma frase virariam um itálico que engole o texto do meio.
const TRECHO =
  /`([^`\n]+)`|\*\*(\S|\S[\s\S]*?\S)\*\*|\*(\S|\S[^*\n]*?\S)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Só `http`/`https` viram link clicável. Sem isso, um `javascript:` ou `data:`
 * vindo do modelo (ou de uma página que ele leu na web) viraria um link
 * executável dentro do painel autenticado.
 */
function urlSegura(url: string): boolean {
  try {
    const protocolo = new URL(url).protocol;
    return protocolo === "http:" || protocolo === "https:";
  } catch {
    return false;
  }
}

function texto(valor: string): Trecho[] {
  return valor ? [{ tipo: "texto", texto: valor }] : [];
}

/** Quebra uma linha nos marcadores inline, preservando o que não casar. */
export function analisarTrechos(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let cursor = 0;

  TRECHO.lastIndex = 0;
  let achado: RegExpExecArray | null;
  while ((achado = TRECHO.exec(linha)) !== null) {
    const [bruto, codigo, negrito, italico, rotuloLink, urlLink] = achado;

    trechos.push(...texto(linha.slice(cursor, achado.index)));

    if (codigo !== undefined) {
      trechos.push({ tipo: "codigo", texto: codigo });
    } else if (negrito !== undefined) {
      trechos.push({ tipo: "negrito", texto: negrito });
    } else if (italico !== undefined) {
      trechos.push({ tipo: "italico", texto: italico });
    } else if (rotuloLink !== undefined && urlLink !== undefined) {
      // Link de esquema não permitido não some: volta como texto literal, para
      // o usuário ver o que o modelo escreveu em vez de um trecho desaparecer.
      trechos.push(
        urlSegura(urlLink)
          ? { tipo: "link", texto: rotuloLink, url: urlLink }
          : { tipo: "texto", texto: bruto },
      );
    }

    cursor = achado.index + bruto.length;
  }

  trechos.push(...texto(linha.slice(cursor)));
  return juntarTexto(trechos);
}

/**
 * Funde trechos de texto vizinhos num só.
 *
 * Eles aparecem quando um marcador é recusado e volta literal (link de esquema
 * bloqueado, por exemplo): o pedaço recusado fica entre o texto de antes e o de
 * depois. Sem fundir, a árvore teria nós redundantes e duas asserções
 * diferentes descreveriam o mesmo texto.
 */
function juntarTexto(trechos: Trecho[]): Trecho[] {
  return trechos.reduce<Trecho[]>((acumulado, trecho) => {
    const anterior = acumulado[acumulado.length - 1];
    if (trecho.tipo === "texto" && anterior?.tipo === "texto") {
      acumulado[acumulado.length - 1] = { tipo: "texto", texto: anterior.texto + trecho.texto };
      return acumulado;
    }
    acumulado.push(trecho);
    return acumulado;
  }, []);
}

/**
 * Converte a resposta do assistente em blocos renderizáveis.
 *
 * Linha em branco separa blocos; linhas consecutivas de lista viram uma lista
 * só; linha indentada continua o item anterior.
 */
export function analisarResposta(conteudo: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;

  const fecharParagrafo = () => {
    if (paragrafo.length === 0) return;
    blocos.push({ tipo: "paragrafo", trechos: analisarTrechos(paragrafo.join("\n")) });
    paragrafo = [];
  };

  const fecharLista = () => {
    if (!lista) return;
    blocos.push({
      tipo: "lista",
      ordenada: lista.ordenada,
      itens: lista.itens.map((item) => analisarTrechos(item)),
    });
    lista = null;
  };

  for (const linha of conteudo.split("\n")) {
    if (linha.trim() === "") {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    const marcador = ITEM_MARCADOR.exec(linha);
    const numerado = ITEM_NUMERADO.exec(linha);

    if (marcador ?? numerado) {
      fecharParagrafo();
      const ordenada = numerado !== null;
      const item = (numerado?.[1] ?? marcador?.[1] ?? "").trim();
      // Trocar de tipo de lista fecha a anterior: `- a` seguido de `1. b` são
      // duas listas, não uma com itens de marcação misturada.
      if (lista && lista.ordenada !== ordenada) fecharLista();
      lista ??= { ordenada, itens: [] };
      lista.itens.push(item);
      continue;
    }

    if (lista && CONTINUACAO.test(linha)) {
      const ultimo = lista.itens.length - 1;
      lista.itens[ultimo] = `${lista.itens[ultimo]} ${linha.trim()}`;
      continue;
    }

    fecharLista();
    paragrafo.push(linha);
  }

  fecharParagrafo();
  fecharLista();
  return blocos;
}
