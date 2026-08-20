import { normalizarTexto } from "@/lib/domain/normalizarMunicipio";
import { encontrarCabecalho } from "./fornecedoresPlanilha";

/**
 * Planeja a escrita de volta (banco → planilha Google) dos campos que o M26
 * enriqueceu em `Fornecedor`. Puro: sem I/O. A sincronização M24 sobrescreve
 * cidade/UF/telefone/e-mail/tags/razão social com o que está na planilha,
 * inclusive célula vazia — então o enriquecimento no banco some na próxima
 * sync se a planilha não for atualizada antes.
 *
 * Regras (as mesmas do M26, só que o destino é a célula, não o banco):
 * - Cidade, UF, Telefone, E-mail, Tags: só preenche célula **vazia**. Nunca
 *   sobrescreve o que já está na planilha (pode ser escolha editorial).
 * - Telefone: a planilha tem "Telefone" e "Telefone 2"; o banco tem um campo
 *   só. Considera o contato ocupado se **qualquer** das duas colunas tiver
 *   valor; se ambas vazias e o banco tiver telefone, preenche só "Telefone".
 * - Razão social: única exceção — escreve quando diverge após `normalizarTexto`
 *   (acento/caixa/espaço), mesmo com a célula preenchida. A Receita é a fonte
 *   de verdade para o CNPJ já cadastrado (M26).
 *
 * Não escreve CNPJ (o M26 não inventa CNPJ; a limpeza de 2026-08-19 já mascarou
 * os válidos). Não escreve Contato/Fonte/colunas de cotação.
 */

export type CampoEscritaPlanilha =
  | "razaoSocial"
  | "categoria"
  | "cidade"
  | "estado"
  | "email"
  | "telefone";

export interface FornecedorParaPlanilha {
  origemPlanilhaLinhaId: string;
  razaoSocial: string;
  categoria: string[];
  cidade: string;
  estado: string;
  email: string;
  emailsAdicionais: string[];
  telefone: string | null;
}

export interface AtualizacaoCelulaPlanilha {
  linhaId: string;
  campo: CampoEscritaPlanilha;
  coluna: number;
  /** Índice 0-based da linha na matriz lida (cabeçalho incluso). */
  linha: number;
  /** Linha 1-based no Sheets (A1). */
  linhaPlanilha: number;
  valorAnterior: string;
  valorNovo: string;
}

export interface PlanoEscritaFornecedoresPlanilha {
  atualizacoes: AtualizacaoCelulaPlanilha[];
  resumo: {
    linhasCasadas: number;
    linhasBancoSemMatch: number;
    celulasAPreencher: number;
    porCampo: Record<CampoEscritaPlanilha, number>;
  };
}

function celulaVazia(valor: string | undefined): boolean {
  return !(valor ?? "").trim();
}

function celulaTexto(row: string[], coluna: number | undefined): string {
  if (coluna === undefined) return "";
  return (row[coluna] ?? "").trim();
}

/** Compara razão social ignorando acento/caixa/espaçamento — mesma base do M26. */
function normalizarRazaoSocial(s: string): string {
  return normalizarTexto(s).replace(/\s+/g, " ");
}

function formatarTags(categoria: string[]): string {
  return categoria
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}

function formatarEmail(fornecedor: FornecedorParaPlanilha): string {
  const vistos = new Set<string>();
  const partes: string[] = [];
  for (const bruto of [fornecedor.email, ...fornecedor.emailsAdicionais]) {
    const email = bruto.trim();
    if (!email) continue;
    const chave = email.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    partes.push(email);
  }
  return partes.join("; ");
}

function resumoVazio(): PlanoEscritaFornecedoresPlanilha["resumo"] {
  return {
    linhasCasadas: 0,
    linhasBancoSemMatch: 0,
    celulasAPreencher: 0,
    porCampo: {
      razaoSocial: 0,
      categoria: 0,
      cidade: 0,
      estado: 0,
      email: 0,
      telefone: 0,
    },
  };
}

export function planejarEscritaFornecedoresPlanilha(
  linhas: string[][],
  fornecedores: FornecedorParaPlanilha[],
): PlanoEscritaFornecedoresPlanilha {
  const resumo = resumoVazio();
  const cabecalho = encontrarCabecalho(linhas);
  if (!cabecalho) return { atualizacoes: [], resumo };

  const { indiceLinha, colunas } = cabecalho;
  if (colunas.linhaId === undefined) return { atualizacoes: [], resumo };

  const linhaPorId = new Map<string, { row: string[]; indice: number }>();
  for (let i = indiceLinha + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const linhaId = celulaTexto(row, colunas.linhaId);
    if (!linhaId) continue;
    if (!linhaPorId.has(linhaId)) {
      linhaPorId.set(linhaId, { row, indice: i });
    }
  }

  const atualizacoes: AtualizacaoCelulaPlanilha[] = [];
  const linhaIdsCasados = new Set<string>();

  const empurrar = (
    linhaId: string,
    campo: CampoEscritaPlanilha,
    coluna: number,
    indiceLinhaMatriz: number,
    valorAnterior: string,
    valorNovo: string,
  ) => {
    if (!valorNovo) return;
    atualizacoes.push({
      linhaId,
      campo,
      coluna,
      linha: indiceLinhaMatriz,
      linhaPlanilha: indiceLinhaMatriz + 1,
      valorAnterior,
      valorNovo,
    });
    resumo.porCampo[campo] += 1;
  };

  for (const fornecedor of fornecedores) {
    const linhaId = fornecedor.origemPlanilhaLinhaId.trim();
    if (!linhaId) continue;
    const encontrada = linhaPorId.get(linhaId);
    if (!encontrada) {
      resumo.linhasBancoSemMatch += 1;
      continue;
    }
    linhaIdsCasados.add(linhaId);
    const { row, indice } = encontrada;

    if (colunas.cidade !== undefined) {
      const atual = celulaTexto(row, colunas.cidade);
      const novo = fornecedor.cidade.trim();
      if (celulaVazia(atual) && novo) {
        empurrar(linhaId, "cidade", colunas.cidade, indice, atual, novo);
      }
    }

    if (colunas.estado !== undefined) {
      const atual = celulaTexto(row, colunas.estado);
      const novo = fornecedor.estado.trim();
      if (celulaVazia(atual) && novo) {
        empurrar(linhaId, "estado", colunas.estado, indice, atual, novo);
      }
    }

    if (colunas.email !== undefined) {
      const atual = celulaTexto(row, colunas.email);
      const novo = formatarEmail(fornecedor);
      if (celulaVazia(atual) && novo) {
        empurrar(linhaId, "email", colunas.email, indice, atual, novo);
      }
    }

    if (colunas.telefone !== undefined) {
      const tel1 = celulaTexto(row, colunas.telefone);
      const tel2 = celulaTexto(row, colunas.telefone2);
      const novo = (fornecedor.telefone ?? "").trim();
      if (celulaVazia(tel1) && celulaVazia(tel2) && novo) {
        empurrar(linhaId, "telefone", colunas.telefone, indice, tel1, novo);
      }
    }

    if (colunas.categoria !== undefined) {
      const atual = celulaTexto(row, colunas.categoria);
      const novo = formatarTags(fornecedor.categoria);
      if (celulaVazia(atual) && novo) {
        empurrar(linhaId, "categoria", colunas.categoria, indice, atual, novo);
      }
    }

    if (colunas.razaoSocial !== undefined) {
      const atual = celulaTexto(row, colunas.razaoSocial);
      const novo = fornecedor.razaoSocial.trim();
      if (novo) {
        if (celulaVazia(atual) || normalizarRazaoSocial(atual) !== normalizarRazaoSocial(novo)) {
          empurrar(linhaId, "razaoSocial", colunas.razaoSocial, indice, atual, novo);
        }
      }
    }
  }

  resumo.linhasCasadas = linhaIdsCasados.size;
  resumo.celulasAPreencher = atualizacoes.length;
  return { atualizacoes, resumo };
}
