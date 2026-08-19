// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): o script administrativo que roda
// este import precisa importá-lo fora do bundler do Next, onde `server-only` sempre lança. Não é
// alcançável a partir de `components/`.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizarMunicipio } from "@/lib/domain/normalizarMunicipio";
import { linhaCandidatoCnpjSchema, type LinhaCandidatoCnpj } from "@/lib/validations/candidatoCnpjRow";
import { parseLinhaCsv } from "./parseLinhaCsv";

/**
 * Import streaming (M27) do CSV de candidatos a Fornecedor gerado pelo filtro DuckDB sobre o dump
 * da Receita Federal (SP + situação ativa). O arquivo tem potencialmente milhões de linhas, então é
 * lido por `readline` — uma linha por vez, nunca o conteúdo inteiro em memória — e gravado em lotes
 * de `tamanhoLote`.
 *
 * Colunas são mapeadas por NOME a partir do header (1ª linha), não por posição: o CSV é gerado por
 * uma query externa a este repo, e depender da ordem das colunas transforma qualquer reordenação da
 * query num embaralhamento silencioso de campos. Coluna extra no header é ignorada; coluna
 * obrigatória ausente derruba o import na hora (erro explícito), porque nesse caso TODAS as linhas
 * seriam rejeitadas e um contador de rejeição não distinguiria isso de um arquivo ruim.
 *
 * Linha malformada (aspas não fechadas, contagem de campos divergente, Zod reprovou) incrementa
 * `linhasRejeitadas` e o processo segue — um arquivo desse tamanho sempre tem resíduo, e abortar
 * tudo por causa de uma linha desperdiça a carga inteira.
 *
 * A escrita é `INSERT ... ON CONFLICT ("cnpj") DO UPDATE` em lote, nunca `createMany` com
 * `skipDuplicates` (CLAUDE.md §9.72): a cada competência nova do dump da Receita, empresa já
 * importada muda de situação, endereço ou razão social, e `skipDuplicates` ignoraria a linha em
 * silêncio — o resync nunca refletiria mudança nenhuma.
 */

/** Colunas que precisam existir no header — as demais do schema são opcionais no CSV. */
const COLUNAS_OBRIGATORIAS = [
  "cnpj",
  "razaoSocial",
  "situacaoCadastral",
  "municipio",
  "estado",
  "cnaePrincipalCodigo",
  "cnaePrincipalDescricao",
] as const;

const TAMANHO_LOTE_PADRAO = 1000;

/**
 * `situacaoCadastralData` vem como AAAAMMDD no dump da Receita. Janela fixa de plausibilidade
 * (CLAUDE.md §9.65): fonte externa devolve data-sentinela (`00010101`, `19000101`) que `new Date`
 * aceita sem reclamar, e um candidato gravado com data falsa some de qualquer filtro por recência.
 * Janela fixa, não comparada com `Date.now()`, para não acoplar a regra ao relógio.
 */
function parseDataRfb(bruto: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(bruto.trim());
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1950 || ano > 2100) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Campo textual opcional: string vazia do CSV vira `null`, não `""`. */
function opcional(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export interface ResultadoImportacaoCandidatos {
  importacaoId: string;
  linhasLidas: number;
  linhasImportadas: number;
  linhasRejeitadas: number;
}

export interface OpcoesImportacaoCandidatos {
  caminho: string;
  competenciaRfb: string;
  tamanhoLote?: number;
  dryRun?: boolean;
}

export async function importarCandidatosCnpj(
  opcoes: OpcoesImportacaoCandidatos,
): Promise<ResultadoImportacaoCandidatos> {
  const { caminho, competenciaRfb, dryRun = false } = opcoes;
  const tamanhoLote = opcoes.tamanhoLote ?? TAMANHO_LOTE_PADRAO;

  const importacao = await db.importacaoCandidatosCnpj.create({
    data: { competenciaRfb, arquivoOrigem: caminho },
  });

  let linhasLidas = 0;
  let linhasImportadas = 0;
  let linhasRejeitadas = 0;
  let colunas: string[] | null = null;
  let lote: LinhaCandidatoCnpj[] = [];

  const gravarLote = async () => {
    if (lote.length === 0) return;
    if (!dryRun) await escreverLote(lote, competenciaRfb);
    linhasImportadas += lote.length;
    lote = [];
  };

  try {
    const leitor = createInterface({
      input: createReadStream(caminho, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const bruta of leitor) {
      const linha = bruta.replace(/\r$/, "");

      if (colunas === null) {
        const header = parseLinhaCsv(linha);
        if (!header) throw new Error("Header do CSV inválido (aspas não fechadas)");
        const nomes = header.map((c) => c.trim());
        const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !nomes.includes(c));
        if (faltando.length > 0) {
          throw new Error(`CSV sem coluna obrigatória: ${faltando.join(", ")}`);
        }
        colunas = nomes;
        continue;
      }

      if (linha.trim() === "") continue;
      linhasLidas++;

      const campos = parseLinhaCsv(linha);
      if (!campos || campos.length !== colunas.length) {
        linhasRejeitadas++;
        continue;
      }

      const registro: Record<string, string> = {};
      colunas.forEach((nome, i) => {
        registro[nome] = campos[i] ?? "";
      });

      const validado = linhaCandidatoCnpjSchema.safeParse({
        cnpj: registro.cnpj ?? "",
        razaoSocial: registro.razaoSocial ?? "",
        nomeFantasia: registro.nomeFantasia ?? "",
        situacaoCadastral: registro.situacaoCadastral ?? "",
        situacaoCadastralData: registro.situacaoCadastralData ?? "",
        municipio: registro.municipio ?? "",
        estado: registro.estado ?? "",
        cnaePrincipalCodigo: registro.cnaePrincipalCodigo ?? "",
        cnaePrincipalDescricao: registro.cnaePrincipalDescricao ?? "",
        email: registro.email ?? "",
        telefone: registro.telefone ?? "",
        logradouro: registro.logradouro ?? "",
        numero: registro.numero ?? "",
        bairro: registro.bairro ?? "",
        cep: registro.cep ?? "",
      });

      if (!validado.success) {
        linhasRejeitadas++;
        continue;
      }

      lote.push(validado.data);
      if (lote.length >= tamanhoLote) await gravarLote();
    }

    await gravarLote();

    await db.importacaoCandidatosCnpj.update({
      where: { id: importacao.id },
      data: { linhasLidas, linhasImportadas, linhasRejeitadas, concluidoEm: new Date() },
    });

    return { importacaoId: importacao.id, linhasLidas, linhasImportadas, linhasRejeitadas };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    await db.importacaoCandidatosCnpj.update({
      where: { id: importacao.id },
      data: {
        linhasLidas,
        linhasImportadas,
        linhasRejeitadas,
        erro: motivo,
        concluidoEm: new Date(),
      },
    });
    throw erro;
  }
}

/**
 * Upsert em lote — 1 round-trip por lote. SQL bruto porque a API tipada do Prisma não tem upsert em
 * massa (`createMany` não aceita `onConflict: update`, e um `upsert` por linha seria 1 round-trip
 * por empresa num arquivo de milhões). Parametrizado via `Prisma.sql`/`Prisma.join`: nenhum valor é
 * concatenado na string.
 *
 * `categoriaSugerida` fica de fora do UPDATE de propósito: ela é calculada depois, a partir do CNAE
 * (`CategoriaSugeridaPorCnae`), e uma reimportação de competência nova não pode zerar o que já foi
 * classificado.
 */
async function escreverLote(lote: LinhaCandidatoCnpj[], competenciaRfb: string): Promise<void> {
  const linhas = lote.map(
    (c) =>
      Prisma.sql`(gen_random_uuid(), ${c.cnpj}, ${c.razaoSocial}, ${opcional(c.nomeFantasia)}, ${c.situacaoCadastral}, ${parseDataRfb(c.situacaoCadastralData)}, ${normalizarMunicipio(c.municipio)}, ${c.estado.toUpperCase()}, ${c.cnaePrincipalCodigo}, ${c.cnaePrincipalDescricao}, ${opcional(c.email)}, ${opcional(c.telefone)}, ${opcional(c.logradouro)}, ${opcional(c.numero)}, ${opcional(c.bairro)}, ${opcional(c.cep)}, ${competenciaRfb}, now(), now())`,
  );

  await db.$executeRaw`
    INSERT INTO "empresas_candidatas_fornecedor"
      ("id", "cnpj", "razaoSocial", "nomeFantasia", "situacaoCadastral", "situacaoCadastralData",
       "municipio", "estado", "cnaePrincipalCodigo", "cnaePrincipalDescricao", "email", "telefone",
       "logradouro", "numero", "bairro", "cep", "competenciaRfb", "importadoEm", "atualizadoEm")
    VALUES ${Prisma.join(linhas)}
    ON CONFLICT ("cnpj") DO UPDATE SET
      "razaoSocial" = EXCLUDED."razaoSocial",
      "nomeFantasia" = EXCLUDED."nomeFantasia",
      "situacaoCadastral" = EXCLUDED."situacaoCadastral",
      "situacaoCadastralData" = EXCLUDED."situacaoCadastralData",
      "municipio" = EXCLUDED."municipio",
      "estado" = EXCLUDED."estado",
      "cnaePrincipalCodigo" = EXCLUDED."cnaePrincipalCodigo",
      "cnaePrincipalDescricao" = EXCLUDED."cnaePrincipalDescricao",
      "email" = EXCLUDED."email",
      "telefone" = EXCLUDED."telefone",
      "logradouro" = EXCLUDED."logradouro",
      "numero" = EXCLUDED."numero",
      "bairro" = EXCLUDED."bairro",
      "cep" = EXCLUDED."cep",
      "competenciaRfb" = EXCLUDED."competenciaRfb",
      "atualizadoEm" = now()
  `;
}
