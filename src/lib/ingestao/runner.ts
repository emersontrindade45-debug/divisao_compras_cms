import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { calcularChecksumSha256 } from "./checksum";

/**
 * Um registro de preço já normalizado, pronto para gravar em `PrecoReferencia`
 * (menos as colunas que o runner preenche: id, fonteReferenciaId,
 * loteIngestaoId e competencia).
 */
export interface PrecoReferenciaNormalizado {
  codigo: string;
  descricao: string;
  descricaoNormalizada: string;
  unidade: string;
  valorUnitario: number;
  dataReferencia: Date;
  /** "" = âmbito nacional — mesma convenção do model (ver prisma/schema.prisma). */
  uf?: string;
  urlEvidencia?: string;
  metadados?: Record<string, unknown>;
}

export type NormalizacaoLinha =
  | { ok: true; preco: PrecoReferenciaNormalizado }
  | { ok: false; motivo: string };

export interface ConfigIngestao<TLinhaBruta> {
  /** Chave de `FonteReferencia` — precisa existir e estar `ativa` (ver `executarIngestao`). */
  fonteChave: string;
  /** Competência do lote (ex.: "2026-08" para uma publicação mensal). */
  competencia: string;
  /**
   * Baixa o arquivo bruto da fonte. Nenhum cliente HTTP concreto mora aqui —
   * cada fonte real (SINAPI, CADTERC, ...) implementa o seu a partir de M16+;
   * o runner é o esqueleto reutilizável.
   */
  baixar: () => Promise<{ conteudo: Buffer; urlArquivo: string }>;
  /**
   * Confirma que o arquivo tem o formato esperado antes de gastar tempo
   * parseando. O runner falha visivelmente (grava `LoteIngestao.erro` e não
   * importa nenhuma linha) quando o cabeçalho não bate — nunca tenta adivinhar
   * um layout desconhecido (CLAUDE.md §9.10 é sobre planilha de cotação, não
   * sobre fonte de referência: aqui o formato errado é motivo de rejeição
   * total do lote, não de tolerância).
   */
  validarCabecalho: (conteudo: Buffer) => { valido: boolean; motivo?: string };
  /** Quebra o arquivo em linhas brutas (uma por registro candidato). */
  parsearLinhas: (conteudo: Buffer) => TLinhaBruta[];
  /** Normaliza uma linha bruta, ou explica por que ela é rejeitada. */
  normalizarLinha: (linhaBruta: TLinhaBruta) => NormalizacaoLinha;
}

export interface ResumoIngestao {
  loteId: string;
  sucesso: boolean;
  linhasLidas: number;
  linhasImportadas: number;
  linhasRejeitadas: number;
  motivosRejeicao: string[];
  erro?: string;
}

async function marcarLoteComErro(loteId: string, erro: string): Promise<ResumoIngestao> {
  await db.loteIngestao.update({
    where: { id: loteId },
    data: { concluidoEm: new Date(), erro },
  });
  return {
    loteId,
    sucesso: false,
    linhasLidas: 0,
    linhasImportadas: 0,
    linhasRejeitadas: 0,
    motivosRejeicao: [],
    erro,
  };
}

/**
 * Runner genérico de ingestão: baixa → valida cabeçalho → grava lote
 * (`LoteIngestao`) → reporta linhas rejeitadas (docs/ApiPlan.md §M15).
 *
 * Não processa nenhuma fonte real: `config` é o ponto de extensão que M16+
 * preenche por fonte (SINAPI, CADTERC, CATMAT, ...). Este módulo só garante
 * que toda ingestão, qualquer que seja a fonte, produz o mesmo rastro de
 * auditoria e a mesma forma de falhar.
 */
export async function executarIngestao<TLinhaBruta>(
  config: ConfigIngestao<TLinhaBruta>,
): Promise<ResumoIngestao> {
  const fonte = await db.fonteReferencia.findUnique({
    where: { chave: config.fonteChave },
    select: { id: true, ativa: true },
  });
  if (!fonte) {
    throw new Error(`Fonte de referência "${config.fonteChave}" não cadastrada.`);
  }
  if (!fonte.ativa) {
    throw new Error(`Fonte de referência "${config.fonteChave}" está inativa.`);
  }

  const { conteudo, urlArquivo } = await config.baixar();
  const checksum = calcularChecksumSha256(conteudo);

  const lote = await db.loteIngestao.create({
    data: {
      fonteReferenciaId: fonte.id,
      competencia: config.competencia,
      urlArquivo,
      checksum,
    },
    select: { id: true },
  });

  const cabecalho = config.validarCabecalho(conteudo);
  if (!cabecalho.valido) {
    return marcarLoteComErro(
      lote.id,
      cabecalho.motivo ?? "Cabeçalho do arquivo não corresponde ao formato esperado.",
    );
  }

  let linhasBrutas: TLinhaBruta[];
  try {
    linhasBrutas = config.parsearLinhas(conteudo);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : "Falha ao interpretar o arquivo.";
    return marcarLoteComErro(lote.id, motivo);
  }

  const validas: PrecoReferenciaNormalizado[] = [];
  const motivosRejeicao: string[] = [];

  for (const linhaBruta of linhasBrutas) {
    const normalizada = config.normalizarLinha(linhaBruta);
    if (normalizada.ok) {
      validas.push(normalizada.preco);
    } else {
      motivosRejeicao.push(normalizada.motivo);
    }
  }

  // `createMany` com `skipDuplicates` pode gravar MENOS linhas do que `validas.length`
  // quando a constraint `@@unique([fonteReferenciaId, codigo, competencia, uf])` colide
  // (ex.: reingerir a mesma competência depois de corrigir um arquivo). `linhasImportadas`
  // é a auditoria da rodada (docs/ApiPlan.md §3.2) — reportar `validas.length` aqui mentiria
  // sobre quantas linhas de fato entraram na tabela sempre que houvesse duplicata pulada.
  let linhasImportadas = 0;
  if (validas.length > 0) {
    const resultado = await db.precoReferencia.createMany({
      data: validas.map((preco) => ({
        fonteReferenciaId: fonte.id,
        loteIngestaoId: lote.id,
        competencia: config.competencia,
        codigo: preco.codigo,
        descricao: preco.descricao,
        descricaoNormalizada: preco.descricaoNormalizada,
        unidade: preco.unidade,
        valorUnitario: preco.valorUnitario,
        dataReferencia: preco.dataReferencia,
        uf: preco.uf ?? "",
        urlEvidencia: preco.urlEvidencia ?? null,
        metadados:
          preco.metadados !== undefined
            ? (preco.metadados as Prisma.InputJsonValue)
            : undefined,
      })),
      skipDuplicates: true,
    });
    linhasImportadas = resultado.count;
  }

  await db.loteIngestao.update({
    where: { id: lote.id },
    data: {
      linhasLidas: linhasBrutas.length,
      linhasImportadas,
      linhasRejeitadas: motivosRejeicao.length,
      concluidoEm: new Date(),
    },
  });

  return {
    loteId: lote.id,
    sucesso: true,
    linhasLidas: linhasBrutas.length,
    linhasImportadas,
    linhasRejeitadas: motivosRejeicao.length,
    motivosRejeicao,
  };
}
