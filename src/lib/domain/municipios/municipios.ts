import dados from "./municipiosIbge.json";
import { normalizarTexto } from "../normalizarMunicipio";

/**
 * Municípios brasileiros com o código IBGE de 7 dígitos.
 *
 * A lista é a oficial do IBGE (`servicodados.ibge.gov.br/api/v1/localidades/municipios`,
 * 5.571 municípios, baixada em 2026-11-16), versionada como JSON em vez de
 * consultada em runtime: muda só quando um município é criado, e depender de
 * mais uma API externa para montar um dropdown seria custo sem benefício.
 *
 * **Por que o código precisa vir desta lista, e não do que o usuário digitar.**
 * O filtro `municipios` da busca textual do PNCP recebe o código IBGE e, medido
 * em 2026-11-16, responde a código inexistente (`9999999`) e a separador errado
 * (`3548500,3550308`) com **0 resultados, sem erro** — a mesma falha silenciosa
 * de `ufs` (CLAUDE.md §9.98). Um código inválido viraria "nenhuma contratação
 * pública encontrada". Por isso todo código é conferido aqui antes de sair.
 */
export interface Municipio {
  /** Código IBGE de 7 dígitos (ex.: Santos = 3548500). */
  codigo: number;
  nome: string;
  /** Sigla da UF em maiúsculas. */
  uf: string;
}

/** Teto de cidades por filtro — mantém a URL do PNCP curta e o recorte legível. */
export const MAX_MUNICIPIOS_FILTRO = 20;

const MUNICIPIOS: readonly Municipio[] = (dados as [number, string, string][]).map(
  ([codigo, nome, uf]) => ({ codigo, nome, uf }),
);

const POR_CODIGO = new Map(MUNICIPIOS.map((m) => [m.codigo, m]));

/** Nome sem acento/caixa/pontuação, para busca tolerante ("sao jose" acha "São José"). */
function chaveBusca(s: string): string {
  return normalizarTexto(s).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const CHAVES = MUNICIPIOS.map((m) => chaveBusca(m.nome));

export function municipioPorCodigo(codigo: number): Municipio | undefined {
  return POR_CODIGO.get(codigo);
}

export function ehCodigoMunicipioValido(codigo: number): boolean {
  return POR_CODIGO.has(codigo);
}

/**
 * Busca por nome para o dropdown. Aceita "Santos", "sao jose" e "Santos/SP"
 * (ou "Santos SP") para desambiguar homônimos. Quem começa com o termo vem
 * antes de quem só o contém; dentro de cada grupo, ordem alfabética por UF e
 * nome (a da lista).
 */
export function buscarMunicipios(termo: string, limite = 20): Municipio[] {
  let chave = chaveBusca(termo.replace("/", " "));
  if (chave.length < 2) return [];

  // Sufixo de UF ("santos sp"): só vale se a última palavra for uma UF existente.
  let uf: string | null = null;
  const partes = chave.split(" ");
  const ultima = partes[partes.length - 1]!;
  if (partes.length > 1 && ultima.length === 2 && MUNICIPIOS.some((m) => m.uf === ultima)) {
    uf = ultima;
    chave = partes.slice(0, -1).join(" ");
  }

  const comeca: Municipio[] = [];
  const contem: Municipio[] = [];
  MUNICIPIOS.forEach((m, i) => {
    if (uf && m.uf !== uf) return;
    const nome = CHAVES[i]!;
    if (nome.startsWith(chave)) comeca.push(m);
    else if (nome.includes(chave)) contem.push(m);
  });
  return [...comeca, ...contem].slice(0, limite);
}

/** "Santos/SP" — rótulo usado no chip e nos avisos ao modelo. */
export function rotuloMunicipio(m: Municipio): string {
  return `${m.nome}/${m.uf}`;
}

/**
 * Confere se um município devolvido por uma fonte (nome + UF em texto livre,
 * sem código) é um dos selecionados. Usado pelas fontes que não filtram cidade
 * na origem mas devolvem o nome do município em cada linha.
 */
export function municipioEstaNaSelecao(
  nome: string | null | undefined,
  uf: string | null | undefined,
  selecionados: readonly Municipio[],
): boolean {
  if (!nome) return false;
  const chave = chaveBusca(nome);
  const ufNormalizada = uf ? uf.trim().toUpperCase() : null;
  return selecionados.some(
    (m) => chaveBusca(m.nome) === chave && (ufNormalizada === null || m.uf === ufNormalizada),
  );
}
