import "server-only";
import { dbCandidatos } from "@/lib/dbCandidatos";

/**
 * Dados da empresa dona de um e-mail, vindos da base de candidatos da Receita (banco do VPS,
 * somente leitura — CLAUDE.md §9.82). `cnpj`/`razaoSocial` ficam nulos quando o e-mail é
 * COMPARTILHADO por mais de uma empresa (escritório de contabilidade): escolher uma delas seria
 * atribuir a consulta à empresa errada.
 */
export interface CandidatoPorEmail {
  cnpj: string | null;
  razaoSocial: string | null;
  cnaeDescricao: string | null;
}

const LOTE = 2000;

interface LinhaCandidato {
  email: string;
  cnpj: string;
  razaoSocial: string;
  cnaeDescricao: string | null;
}

/**
 * Busca em lote por `lower(email)`, usando o índice parcial
 * `empresas_candidatas_fornecedor_email_lower_idx` (M30.d, criado no VPS).
 *
 * A forma `unnest + LATERAL ... LIMIT 2` NÃO é estilo: medido no VPS em 2026-11-17, a versão
 * `lower(email) = ANY($1)` fazia Seq Scan (planejador estimava 12 milhões de linhas por causa do
 * n_distinct subestimado) e levava 10 s para 2.000 e-mails; esta usa o índice e leva 82–531 ms.
 * O `LIMIT 2` basta para distinguir "um dono" de "vários" e impede que um e-mail de contador
 * (milhares de empresas) puxe milhares de linhas.
 *
 * O predicado `email IS NOT NULL AND email <> ''` precisa estar na consulta para o planejador
 * poder usar o índice parcial.
 */
export async function buscarCandidatosPorEmail(
  emails: string[],
): Promise<Map<string, CandidatoPorEmail>> {
  const unicos = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const porEmail = new Map<string, LinhaCandidato[]>();

  for (let i = 0; i < unicos.length; i += LOTE) {
    const lote = unicos.slice(i, i + LOTE);
    const linhas = await dbCandidatos.$queryRaw<LinhaCandidato[]>`
      SELECT e.email AS "email",
             c."cnpj" AS "cnpj",
             c."razaoSocial" AS "razaoSocial",
             c."cnaePrincipalDescricao" AS "cnaeDescricao"
      FROM unnest(${lote}::text[]) AS e(email)
      CROSS JOIN LATERAL (
        SELECT "cnpj", "razaoSocial", "cnaePrincipalDescricao"
        FROM "empresas_candidatas_fornecedor"
        WHERE lower("email") = e.email AND "email" IS NOT NULL AND "email" <> ''
        LIMIT 2
      ) c`;
    for (const l of linhas) porEmail.set(l.email, [...(porEmail.get(l.email) ?? []), l]);
  }

  const resultado = new Map<string, CandidatoPorEmail>();
  for (const [email, donos] of porEmail) {
    const unico = donos.length === 1 ? donos[0]! : null;
    resultado.set(email, {
      cnpj: unico?.cnpj ?? null,
      razaoSocial: unico?.razaoSocial ?? null,
      cnaeDescricao: unico?.cnaeDescricao ?? null,
    });
  }
  return resultado;
}
