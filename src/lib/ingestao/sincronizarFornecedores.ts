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
 * Remove duplicata de CNPJ na leitura inteira da planilha (antes de dividir em
 * lotes) — mantém só a última ocorrência de cada CNPJ (linha mais recente
 * vence). ~125 CNPJs da planilha real de fornecedores se repetem em linhas
 * distantes (ex.: linha 26 e linha 4433) — resolver por lote (500 linhas) não
 * bastava: a 2ª ocorrência caindo num lote posterior colidia com o registro
 * que a 1ª ocorrência já tinha criado, porque depois de inserida ela deixa de
 * aparecer como "sem origemPlanilhaLinhaId" na busca de colisão. Confirmado em
 * produção (2026-08-19): a primeira execução real falhou com
 * `duplicate key value violates unique constraint "fornecedores_cnpj_key"`
 * antes desta correção. Linhas sem CNPJ (`null`) nunca colidem entre si —
 * Postgres permite múltiplos `NULL` num índice único.
 */
function deduplicarPorCnpj(linhas: FornecedorPlanilhaRow[]): FornecedorPlanilhaRow[] {
  const porCnpj = new Map<string, FornecedorPlanilhaRow>();
  const semCnpj: FornecedorPlanilhaRow[] = [];

  for (const linha of linhas) {
    if (linha.cnpj === null) {
      semCnpj.push(linha);
      continue;
    }
    porCnpj.set(linha.cnpj, linha); // sobrescreve — última ocorrência vence
  }

  return [...porCnpj.values(), ...semCnpj];
}

/**
 * Upsert em lote, com resolução de colisão de CNPJ contra fornecedores
 * já existentes no banco.
 *
 * `cnpj` é `@unique` no schema, então `INSERT ... ON CONFLICT ("origemPlanilhaLinhaId")`
 * falha inteiro (Postgres não aceita duas cláusulas `ON CONFLICT` no mesmo
 * `INSERT` — confirmado empiricamente contra Postgres real) sempre que o CNPJ
 * de uma linha da planilha já pertence a outro `Fornecedor` — cadastro manual
 * pré-existente, ou fornecedor já sincronizado antes sob um `linhaId`
 * diferente do que a leitura atual escolheu (duplicata dentro da própria
 * planilha já foi eliminada por `deduplicarPorCnpj`, chamada antes de dividir
 * em lotes; mas o `linhaId` vencedor pode mudar entre execuções — ocorreu em
 * produção em 2026-08-19: um fornecedor já sincronizado sob `linhaId "26"`
 * tinha, na execução seguinte, o CNPJ dedupicado apontando para `linhaId
 * "4651"`, e a busca de colisão que filtrava por `origemPlanilhaLinhaId: null`
 * não via esse fornecedor por já ter um `linhaId` — só que outro). Resolvido
 * buscando, antes do INSERT, **qualquer** fornecedor com CNPJ deste lote,
 * tenha ou não `origemPlanilhaLinhaId` hoje: essas linhas são mescladas via
 * `UPDATE` direto por `id` (o registro herda o `origemPlanilhaLinhaId` da
 * leitura atual); o restante segue pelo `INSERT ... ON CONFLICT` normal.
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
  // Busca QUALQUER fornecedor com esse CNPJ — não só os sem `origemPlanilhaLinhaId`.
  // Uma execução anterior pode já ter gravado esse CNPJ sob um `linhaId` diferente do
  // que a leitura atual escolheu (deduplicarPorCnpj muda de ocorrência vencedora entre
  // execuções, se a planilha for editada, ou — como ocorreu em produção em 2026-08-19 —
  // se a execução anterior gravou uma ocorrência e esta execução, após a correção da
  // deduplicação, escolhe outra): `ON CONFLICT ("origemPlanilhaLinhaId")` não vê esse
  // caso, porque o `linhaId` novo não colide com nenhum já gravado — só o `cnpj` colide,
  // e filtrar por `origemPlanilhaLinhaId: null` escondia exatamente esse fornecedor da
  // busca de colisão.
  const colisoesCnpj =
    cnpjsDoLote.length > 0
      ? await db.fornecedor.findMany({
          where: { cnpj: { in: cnpjsDoLote } },
          select: { id: true, cnpj: true },
        })
      : [];
  const idPorCnpjColidido = new Map(colisoesCnpj.map((f) => [f.cnpj!, f.id]));

  let afetadas = 0;
  const paraInserir: FornecedorPlanilhaRow[] = [];

  for (const linha of linhas) {
    const idExistentePorCnpj = linha.cnpj ? idPorCnpjColidido.get(linha.cnpj) : undefined;

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
      continue;
    }

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
    const { linhas: linhasBrutas, rejeitadas } = parseFornecedoresPlanilha(rows);
    const linhas = deduplicarPorCnpj(linhasBrutas);
    const duplicatasCnpjRemovidas = linhasBrutas.length - linhas.length;

    // Upsert em lotes de 500 linhas: uma única query com ~5.600 linhas (VALUES)
    // arrisca estourar o limite de parâmetros do driver; medido no M23 que o
    // gargalo real é rede/round-trip, não tamanho de lote — 500 é generoso.
    //
    // O log é atualizado A CADA LOTE, não só ao fim: cada `$executeRaw` de
    // `upsertLote` já é persistido no banco assim que roda (sem transação
    // envolvendo todos os lotes), então uma falha no meio do laço (ex.: erro
    // de rede, ou o bug de colisão de CNPJ do M24) já deixa fornecedores
    // gravados de verdade. Calcular o resultado só depois do laço inteiro
    // terminar mentia sobre isso: em produção (2026-08-19), 3.500
    // fornecedores foram criados com sucesso antes do 8º lote falhar, e o
    // registro de `SincronizacaoFornecedores` ficou com todos os contadores
    // em zero e o erro anexado — dado real no banco, log dizendo que nada
    // aconteceu. Rastreabilidade (CLAUDE.md §1) exige o inverso: o log tem
    // que refletir o que de fato foi persistido, mesmo numa execução que
    // termina em erro no meio.
    const TAMANHO_LOTE = 500;
    let totalAfetadas = 0;
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE);
      const { afetadas } = await upsertLote(lote, opcoes.origem);
      totalAfetadas += afetadas;
      await db.sincronizacaoFornecedores.update({
        where: { id: sync.id },
        data: { linhasLidas: rows.length, linhasAtualizadas: totalAfetadas },
      });
    }

    // Linhas removidas por deduplicarPorCnpj (linhaId de uma ocorrência mais
    // antiga do mesmo CNPJ) não são "presentes" nesta leitura — só a última
    // ocorrência sincronizou; sem isso o Fornecedor da ocorrência descartada
    // ficaria com origemPlanilhaLinhaId de uma linha que "nunca mais aparece",
    // e desativarAusentes o marcaria inativo por engano na próxima rodada.
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
          rejeitadas.length > 0 || duplicatasCnpjRemovidas > 0
            ? ({
                rejeitadas: rejeitadas
                  .slice(0, 100)
                  .map((r) => ({ linha: r.linha, motivo: r.motivo })),
                duplicatasCnpjRemovidas,
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
