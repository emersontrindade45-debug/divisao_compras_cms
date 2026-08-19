import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/sheets/csv";
import { parseFornecedoresPlanilha, type FornecedorPlanilhaRow } from "@/lib/sheets/fornecedoresPlanilha";

/**
 * Sincroniza o cadastro de `Fornecedor` a partir do CSV da planilha Google de
 * fornecedores (M24). Upsert por `origemPlanilhaLinhaId` (não `cnpj` — 56% das
 * linhas reais não têm CNPJ, ver comentário do schema), e fornecedor cujo
 * `linhaId` não aparece mais na leitura atual é marcado `status: inativo`
 * (nunca excluído — preserva `Cotacao`/`HistoricoCotacao`/`QualificacaoFornecedor`
 * já vinculados por FK).
 *
 * SQL bruto para o upsert, mesmo padrão de `catalogoComprasGov.ts` (M23):
 * `createMany` não tem `onConflict: update`, e um `upsert` do Prisma por linha
 * não escala para ~5.600 linhas dentro do teto de `maxDuration` da rota
 * administrativa que chama esta função.
 */

export type OrigemSincronizacao = "manual" | "reconciliacao" | "webhook";

export interface ResultadoSincronizacaoFornecedores {
  sincronizacaoId: string;
  linhasLidas: number;
  linhasCriadas: number;
  linhasAtualizadas: number;
  linhasDesativadas: number;
  linhasRejeitadas: number;
}

function categoriaSqlArray(categoria: string[]): Prisma.Sql {
  if (categoria.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(categoria)}]::text[]`;
}

function emailsAdicionaisSqlArray(emails: string[]): Prisma.Sql {
  if (emails.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(emails)}]::text[]`;
}

/**
 * Upsert em lote, com resolução de colisão de CNPJ em duas etapas.
 *
 * `cnpj` é `@unique` no schema, então `INSERT ... ON CONFLICT ("origemPlanilhaLinhaId")`
 * falha inteiro (Postgres não aceita duas cláusulas `ON CONFLICT` no mesmo
 * `INSERT` — confirmado empiricamente contra Postgres real) sempre que o CNPJ
 * de uma linha da planilha já pertence a outro `Fornecedor` — seja um cadastro
 * manual pré-existente, seja outra linha da própria planilha com CNPJ
 * duplicado. Resolvido buscando, antes do INSERT, quais CNPJs deste lote já
 * existem em fornecedores sem `origemPlanilhaLinhaId` (ainda não
 * sincronizados): essas linhas são mescladas via `UPDATE` direto por `id`
 * (o registro herda o `origemPlanilhaLinhaId`, deixando de ser puramente
 * manual); o restante segue pelo `INSERT ... ON CONFLICT` normal. CNPJ
 * duplicado *dentro* do próprio lote (duas linhas da planilha com o mesmo
 * CNPJ) é resolvido mantendo só a primeira ocorrência no INSERT — a segunda
 * seria rejeitada pelo Postgres do mesmo jeito (`ON CONFLICT` não repara
 * duplicata dentro do mesmo `VALUES`).
 *
 * Linhas já sincronizadas antes (mesmo `origemPlanilhaLinhaId`) têm os campos
 * vindos da planilha atualizados, sem tocar em campos que o sistema calcula
 * por conta própria (score, totalCotacoes, status, statusQualificacao).
 */
async function upsertLote(
  linhas: FornecedorPlanilhaRow[],
  fonteOrigem: string,
): Promise<{ afetadas: number }> {
  if (linhas.length === 0) return { afetadas: 0 };

  const agora = new Date();

  const cnpjsDoLote = [...new Set(linhas.map((l) => l.cnpj).filter((c): c is string => c !== null))];
  const colisoesCnpj =
    cnpjsDoLote.length > 0
      ? await db.fornecedor.findMany({
          where: { cnpj: { in: cnpjsDoLote }, origemPlanilhaLinhaId: null },
          select: { id: true, cnpj: true },
        })
      : [];
  const idPorCnpjColidido = new Map(colisoesCnpj.map((f) => [f.cnpj!, f.id]));

  let afetadas = 0;
  const cnpjsJaVistosNoLote = new Set<string>();
  const paraInserir: FornecedorPlanilhaRow[] = [];

  for (const linha of linhas) {
    const idExistentePorCnpj = linha.cnpj ? idPorCnpjColidido.get(linha.cnpj) : undefined;
    const duplicadoDentroDoLote = linha.cnpj !== null && cnpjsJaVistosNoLote.has(linha.cnpj);

    if (idExistentePorCnpj) {
      await db.$executeRaw`
        UPDATE "fornecedores" SET
          "razaoSocial" = ${linha.razaoSocial},
          "categoria" = ${categoriaSqlArray(linha.categoria)},
          "cidade" = ${linha.cidade},
          "estado" = ${linha.estado},
          "responsavelContato" = ${linha.responsavelContato},
          "email" = ${linha.email},
          "emailsAdicionais" = ${emailsAdicionaisSqlArray(linha.emailsAdicionais)},
          "telefone" = ${linha.telefone ?? null},
          "origemPlanilhaLinhaId" = ${linha.linhaId},
          "origemPlanilhaFonte" = ${fonteOrigem},
          "origemPlanilhaAtualizadoEm" = ${agora},
          "updatedAt" = ${agora}
        WHERE "id" = ${idExistentePorCnpj}
      `;
      afetadas += 1;
      if (linha.cnpj) cnpjsJaVistosNoLote.add(linha.cnpj);
      continue;
    }

    if (duplicadoDentroDoLote) {
      // Mesmo CNPJ já processado nesta mesma leitura da planilha — mantém só a
      // primeira ocorrência; a linha atual seria rejeitada pela constraint.
      continue;
    }

    if (linha.cnpj) cnpjsJaVistosNoLote.add(linha.cnpj);
    paraInserir.push(linha);
  }

  if (paraInserir.length > 0) {
    const valores = paraInserir.map(
      (l) =>
        Prisma.sql`(gen_random_uuid(), ${l.cnpj}, ${l.razaoSocial}, ${categoriaSqlArray(l.categoria)}, ${l.cidade}, ${l.estado}, ${l.responsavelContato}, ${l.email}, ${emailsAdicionaisSqlArray(l.emailsAdicionais)}, ${l.telefone ?? null}, ${l.linhaId}, ${fonteOrigem}, ${agora}, ${agora}, ${agora})`,
    );

    afetadas += await db.$executeRaw`
      INSERT INTO "fornecedores"
        ("id", "cnpj", "razaoSocial", "categoria", "cidade", "estado", "responsavelContato",
         "email", "emailsAdicionais", "telefone", "origemPlanilhaLinhaId", "origemPlanilhaFonte",
         "origemPlanilhaAtualizadoEm", "createdAt", "updatedAt")
      VALUES ${Prisma.join(valores)}
      ON CONFLICT ("origemPlanilhaLinhaId") DO UPDATE SET
        "cnpj" = EXCLUDED."cnpj",
        "razaoSocial" = EXCLUDED."razaoSocial",
        "categoria" = EXCLUDED."categoria",
        "cidade" = EXCLUDED."cidade",
        "estado" = EXCLUDED."estado",
        "responsavelContato" = EXCLUDED."responsavelContato",
        "email" = EXCLUDED."email",
        "emailsAdicionais" = EXCLUDED."emailsAdicionais",
        "telefone" = EXCLUDED."telefone",
        "origemPlanilhaFonte" = EXCLUDED."origemPlanilhaFonte",
        "origemPlanilhaAtualizadoEm" = EXCLUDED."origemPlanilhaAtualizadoEm",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  return { afetadas };
}

/** Marca `inativo` fornecedores sincronizados antes cujo `linhaId` sumiu desta leitura. */
async function desativarAusentes(linhaIdsPresentes: Set<string>): Promise<number> {
  const sincronizadosAntes = await db.fornecedor.findMany({
    where: { origemPlanilhaLinhaId: { not: null }, status: "ativo" },
    select: { id: true, origemPlanilhaLinhaId: true },
  });

  const idsParaDesativar = sincronizadosAntes
    .filter((f) => f.origemPlanilhaLinhaId && !linhaIdsPresentes.has(f.origemPlanilhaLinhaId))
    .map((f) => f.id);

  if (idsParaDesativar.length === 0) return 0;

  await db.$executeRaw`
    UPDATE "fornecedores" SET "status" = 'inativo', "updatedAt" = now()
    WHERE "id" IN (${Prisma.join(idsParaDesativar)})
  `;

  return idsParaDesativar.length;
}

export async function sincronizarFornecedores(opcoes: {
  csv: string;
  origem: OrigemSincronizacao;
}): Promise<ResultadoSincronizacaoFornecedores> {
  const sync = await db.sincronizacaoFornecedores.create({
    data: { origem: opcoes.origem },
  });

  try {
    const rows = parseCsv(opcoes.csv);
    const { linhas, rejeitadas } = parseFornecedoresPlanilha(rows);

    // Upsert em lotes de 500 linhas: uma única query com ~5.600 linhas (VALUES)
    // arrisca estourar o limite de parâmetros do driver; medido no M23 que o
    // gargalo real é rede/round-trip, não tamanho de lote — 500 é generoso.
    const TAMANHO_LOTE = 500;
    let totalAfetadas = 0;
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE);
      const { afetadas } = await upsertLote(lote, opcoes.origem);
      totalAfetadas += afetadas;
    }

    const linhaIdsPresentes = new Set(linhas.map((l) => l.linhaId));
    const linhasDesativadas = await desativarAusentes(linhaIdsPresentes);

    const resultado: ResultadoSincronizacaoFornecedores = {
      sincronizacaoId: sync.id,
      linhasLidas: rows.length,
      // Postgres não distingue INSERT de UPDATE no total de $executeRaw de um
      // ON CONFLICT DO UPDATE — sem essa distinção real, todo upsert conta
      // como "atualizada"; criada vs. atualizada exigiria uma query extra por
      // lote só para o dado informativo, não vale o custo aqui.
      linhasCriadas: 0,
      linhasAtualizadas: totalAfetadas,
      linhasDesativadas,
      linhasRejeitadas: rejeitadas.length,
    };

    await db.sincronizacaoFornecedores.update({
      where: { id: sync.id },
      data: {
        concluidoEm: new Date(),
        linhasLidas: resultado.linhasLidas,
        linhasCriadas: resultado.linhasCriadas,
        linhasAtualizadas: resultado.linhasAtualizadas,
        linhasDesativadas: resultado.linhasDesativadas,
        linhasRejeitadas: resultado.linhasRejeitadas,
        detalhes:
          rejeitadas.length > 0
            ? ({
                rejeitadas: rejeitadas
                  .slice(0, 100)
                  .map((r) => ({ linha: r.linha, motivo: r.motivo })),
              } satisfies Prisma.InputJsonObject)
            : undefined,
      },
    });

    return resultado;
  } catch (erro) {
    await db.sincronizacaoFornecedores.update({
      where: { id: sync.id },
      data: {
        concluidoEm: new Date(),
        erro: erro instanceof Error ? erro.message : String(erro),
      },
    });
    throw erro;
  }
}
