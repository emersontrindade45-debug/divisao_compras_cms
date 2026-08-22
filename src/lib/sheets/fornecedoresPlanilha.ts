/**
 * Parsing puro (sem I/O) da planilha de fornecedores (Google Sheets).
 *
 * A planilha real tem 5.495 linhas e as colunas `#`, `Tags`, `Nome/Razão Social`,
 * `CPF/CNPJ`, `Telefone`, `Telefone 2`, `E-mail`, `Contato`, `Município`, `UF`,
 * `Situação`, `Fonte`, `Processos Cotação`, `Respondeu?`, `Enviou Orçamento?`.
 * O cabeçalho é localizado por nome de coluna normalizado, não por posição
 * (CLAUDE.md §9.10) — tolera reordenação de colunas.
 *
 * `Situação` e as colunas de acompanhamento de cotação (`Processos Cotação`,
 * `Respondeu?`, `Enviou Orçamento?`) são explicitamente reconhecidas só para
 * serem ignoradas: `Situação` é texto livre inconsistente (medido na planilha
 * real, não é um enum) e as demais conflitam com o que o sistema já calcula a
 * partir de `Cotacao`/`HistoricoCotacao`.
 */

export interface FornecedorPlanilhaRow {
  /** Valor bruto da coluna "#" — chave de sincronização estável da planilha. */
  linhaId: string;
  /** Mascarado XX.XXX.XXX/XXXX-XX, ou `null` quando ausente/inválido. */
  cnpj: string | null;
  razaoSocial: string;
  /** Coluna "Tags", separada por vírgula. */
  categoria: string[];
  cidade: string;
  estado: string;
  /** Coluna "Contato". */
  responsavelContato: string;
  /** Primeiro e-mail válido da célula, "" se nenhum. */
  email: string;
  /** Demais e-mails válidos, deduplicados, sem o primeiro. */
  emailsAdicionais: string[];
  telefone: string | undefined;
  /** Coluna "Fonte", preservada sem regra de negócio associada. */
  fonte: string | undefined;
}

export interface CabecalhoFornecedoresPlanilha {
  indiceLinha: number;
  colunas: Record<string, number>;
}

export interface FornecedorPlanilhaRejeitada {
  linha: string;
  motivo: string;
}

export interface FornecedoresPlanilhaParseResult {
  linhas: FornecedorPlanilhaRow[];
  rejeitadas: FornecedorPlanilhaRejeitada[];
}

/** Normaliza: trim, minúsculas, sem acento — para casar nomes de coluna por alias. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Aliases reconhecidos por campo de destino — ordem de checagem não importa (sem sobreposição). */
const ALIASES_CAMPO: Record<string, string[]> = {
  linhaId: ["#"],
  razaoSocial: ["nome/razao social", "razao social", "nome"],
  cnpj: ["cpf/cnpj", "cnpj"],
  categoria: ["tags", "categoria"],
  telefone: ["telefone"],
  telefone2: ["telefone 2"],
  email: ["e-mail", "email", "e-mails"],
  contato: ["contato"],
  cidade: ["municipio", "cidade"],
  estado: ["uf", "estado"],
  fonte: ["fonte"],
  // Colunas de acompanhamento de cotação: mapeadas para que a ESCRITA (M27) saiba onde colocar
  // "Ativa" e o número do processo. O parser de LEITURA continua sem consumi-las — elas não entram
  // em `FornecedorPlanilhaRow` nem no sync do M24, que segue com a mesma forma de antes.
  situacao: ["situacao"],
  processosCotacao: ["processos cotacao"],
  emailEnviado: ["e-mail enviado?", "email enviado?", "e-mail enviado", "email enviado"],
};

/**
 * Colunas reconhecidas apenas para serem ignoradas — nunca entram em `colunas`.
 *
 * "Situação" e "Processos Cotação" saíram desta lista em 2026-08-22: a escrita do M27 precisa da
 * POSIÇÃO delas para preencher, e mantê-las aqui fazia `montarLinhaPlanilha` deixá-las em branco
 * (mesmo modo de falha da §9.79 — campo de escrita ausente não aparece em erro nem em teste que só
 * verifica os campos presentes). A leitura segue sem consumi-las.
 */
const ALIASES_IGNORADAS = ["respondeu?", "enviou orcamento?"];

const LIMITE_LINHAS_CABECALHO = 5;

/**
 * Procura, nas primeiras linhas, a que contém a coluna mais distintiva
 * ("CPF/CNPJ" ou "CNPJ") e mapeia o índice de cada coluna reconhecida por
 * nome — tolerante a reordenação de colunas. Retorna `null` se não achar.
 */
export function encontrarCabecalho(rows: string[][]): CabecalhoFornecedoresPlanilha | null {
  const limite = Math.min(rows.length, LIMITE_LINHAS_CABECALHO);
  const aliasesCnpj = ALIASES_CAMPO.cnpj!;

  for (let i = 0; i < limite; i++) {
    const row = rows[i] ?? [];
    const normalizados = row.map((c) => normalizar(c ?? ""));
    const temCnpj = normalizados.some((c) => aliasesCnpj.includes(c));
    if (!temCnpj) continue;

    const colunas: Record<string, number> = {};
    normalizados.forEach((norm, indice) => {
      if (!norm || ALIASES_IGNORADAS.includes(norm)) return;
      for (const [campo, aliases] of Object.entries(ALIASES_CAMPO)) {
        if (campo in colunas) continue;
        if (aliases.includes(norm)) {
          colunas[campo] = indice;
          break;
        }
      }
    });

    return { indiceLinha: i, colunas };
  }

  return null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split por `;`, trim, lowercase, descarta inválidos, deduplica preservando ordem. */
function parseEmails(celula: string): string[] {
  const vistos = new Set<string>();
  const emails: string[] = [];
  for (const parte of celula.split(";")) {
    const email = parte.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) continue;
    if (vistos.has(email)) continue;
    vistos.add(email);
    emails.push(email);
  }
  return emails;
}

/** Split por `,`, trim, remove vazios, dedup case-insensitive preservando primeira grafia. */
function parseCategoria(celula: string): string[] {
  const vistas = new Set<string>();
  const categoria: string[] = [];
  for (const parte of celula.split(",")) {
    const tag = parte.trim();
    if (!tag) continue;
    const chave = tag.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    categoria.push(tag);
  }
  return categoria;
}

/** Remove tudo que não é dígito; 14 dígitos → máscara XX.XXX.XXX/XXXX-XX; qualquer outro → null. */
function parseCnpj(raw: string): string | null {
  const digitos = raw.replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Parseia as linhas (matriz de células) da planilha de fornecedores em linhas
 * estruturadas e tolerantes. Reusado tanto pela reconciliação em lote quanto
 * pelo webhook de 1 linha (M24.2/M24.3).
 */
export function parseFornecedoresPlanilha(rows: string[][]): FornecedoresPlanilhaParseResult {
  const linhas: FornecedorPlanilhaRow[] = [];
  const rejeitadas: FornecedorPlanilhaRejeitada[] = [];

  const cabecalho = encontrarCabecalho(rows);
  if (!cabecalho) return { linhas, rejeitadas };

  const { indiceLinha, colunas } = cabecalho;

  for (let i = indiceLinha + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const totalmenteVazia = row.every((c) => !(c ?? "").trim());
    if (totalmenteVazia) continue;

    const get = (campo: string): string => {
      const idx = colunas[campo];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const linhaIdBruto = get("linhaId");
    const razaoSocial = get("razaoSocial");
    const rotuloLinha = linhaIdBruto || `linha ${i + 1}`;

    if (!razaoSocial) {
      rejeitadas.push({ linha: rotuloLinha, motivo: "razão social vazia" });
      continue;
    }
    if (!linhaIdBruto) {
      rejeitadas.push({ linha: razaoSocial, motivo: "sem identificador de linha (#)" });
      continue;
    }

    const cnpj = parseCnpj(get("cnpj"));
    const emails = parseEmails(get("email"));
    const categoria = parseCategoria(get("categoria"));

    const tel1 = get("telefone");
    const tel2 = get("telefone2");
    const telefone = tel1 && tel2 ? `${tel1} / ${tel2}` : tel1 || tel2 || undefined;

    const fonteBruta = get("fonte");

    linhas.push({
      linhaId: linhaIdBruto,
      cnpj,
      razaoSocial,
      categoria,
      cidade: get("cidade"),
      estado: get("estado"),
      responsavelContato: get("contato"),
      email: emails[0] ?? "",
      emailsAdicionais: emails.slice(1),
      telefone,
      fonte: fonteBruta || undefined,
    });
  }

  return { linhas, rejeitadas };
}
