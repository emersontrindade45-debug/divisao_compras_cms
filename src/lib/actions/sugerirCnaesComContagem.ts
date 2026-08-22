"use server";

import { dbCandidatos } from "@/lib/dbCandidatos";
import { requireAuth } from "@/lib/auth/rbac";
import { sugerirCnaesParaObjeto, type ClasseCnae } from "@/lib/ia/sugerirCnaesParaObjeto";
import { CAMADAS_GEOGRAFICAS } from "@/lib/domain/camadaGeografica";
import type { CnaeSugerido, ResultadoCnaesSugeridos } from "@/lib/domain/candidatoSugerido";
import { obterCatalogoCnaes, ESTADO_IMPORTADO } from "./catalogoCnaes";

const CIDADES_BAIXADA =
  CAMADAS_GEOGRAFICAS.find((c) => c.nome === "baixada_santista")?.cidades ?? [];

/**
 * Propõe os CNAEs para um objeto **sem buscar empresas** — a etapa de aprovação que vem antes da
 * busca. O analista revisa, desmarca o que não serve e só então a lista vira consulta.
 *
 * Existe porque a IA acerta os CNAEs de serviço mas erra em produto e em objeto abreviado, e o erro
 * era invisível: "PM - Limpeza e Conservação Predial" trazia 7.200 lavanderias junto, sem nada na
 * tela indicando isso. Mostrar a contagem por CNAE transforma o palpite em decisão — o analista vê
 * "Lavanderias: 7.200" e julga na hora.
 *
 * A contagem depende do índice parcial `(cnaePrincipalCodigo, municipio) WHERE email IS NOT NULL`
 * (migration 20260822170000): sem ele são 2,72s de seq scan em vez de 0,10s, e o painel ficaria
 * lento demais para ser usado a cada busca.
 */
export async function sugerirCnaesComContagem(
  objeto: string,
  /** Contexto livre do analista ("prédio alto, precisa de rapel") — refina a proposta da IA. */
  refinamento?: string,
): Promise<ResultadoCnaesSugeridos> {
  await requireAuth();

  const objetoTrim = objeto.trim();
  if (!objetoTrim) return { cnaes: [] };

  const catalogo = await obterCatalogoCnaes();

  // O refinamento entra como contexto adicional do objeto, não como substituto: a IA continua
  // vendo o objeto original (que tem os termos técnicos do processo) mais o que o analista
  // acrescentou para desambiguar um título truncado.
  const entrada = refinamento?.trim()
    ? `${objetoTrim}\n\nContexto adicional informado pelo analista: ${refinamento.trim()}`
    : objetoTrim;

  const codigos = await sugerirCnaesParaObjeto(entrada, catalogo);
  if (codigos.length === 0) return { cnaes: [] };

  return { cnaes: await contarPorCnae(codigos, catalogo, true) };
}

/**
 * Contagem de empresas por CNAE. Uma única query agregada para todos os códigos — nunca uma por
 * código, que multiplicaria o round-trip até o VPS em Campinas por 15.
 */
export async function contarPorCnae(
  codigos: string[],
  catalogo: ClasseCnae[],
  daIa: boolean,
): Promise<CnaeSugerido[]> {
  if (codigos.length === 0) return [];

  const linhas = await dbCandidatos.$queryRaw<
    { codigo: string; empresas: bigint; locais: bigint }[]
  >`
    SELECT "cnaePrincipalCodigo" AS codigo,
           count(*) AS empresas,
           count(*) FILTER (WHERE municipio = ANY(${CIDADES_BAIXADA})) AS locais
      FROM "empresas_candidatas_fornecedor"
     WHERE estado = ${ESTADO_IMPORTADO}
       AND email IS NOT NULL AND email <> ''
       AND "cnaePrincipalCodigo" = ANY(${codigos})
     GROUP BY 1
  `;

  const porCodigo = new Map(linhas.map((l) => [l.codigo, l]));
  const descricoes = new Map(catalogo.map((c) => [c.classe, c.descricao]));

  return codigos
    .map((codigo) => ({
      codigo,
      descricao: descricoes.get(codigo) ?? codigo,
      empresas: Number(porCodigo.get(codigo)?.empresas ?? 0),
      locais: Number(porCodigo.get(codigo)?.locais ?? 0),
      daIa,
    }))
    // Maior volume primeiro: é a ordem em que o analista quer julgar — os CNAEs que mais pesam na
    // busca aparecem no topo, e um código irrelevante com 7 mil empresas salta à vista.
    .sort((a, b) => b.empresas - a.empresas);
}

/** Valida e conta um CNAE que o analista digitou à mão. */
export async function buscarCnaeManual(codigo: string): Promise<CnaeSugerido | null> {
  await requireAuth();

  const limpo = codigo.replace(/\D/g, "").slice(0, 7);
  if (limpo.length !== 7) return null;

  const catalogo = await obterCatalogoCnaes();
  if (!catalogo.some((c) => c.classe === limpo)) return null;

  const [resultado] = await contarPorCnae([limpo], catalogo, false);
  return resultado ?? null;
}
