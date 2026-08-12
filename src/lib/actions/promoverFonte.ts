"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import {
  mapTipoCandidatoParaFonte,
  podePromoverCandidato,
} from "@/lib/domain/tipoFonteSimilaridade";
import { valorUnitarioEfetivo } from "@/lib/domain/ajusteValorCandidato";
import type { ActionResult } from "./processos";

const promoverSchema = z.object({
  resultadoId: z.string().cuid(),
});

/**
 * Sinaliza, de dentro da transação, que o candidato já foi promovido por uma
 * requisição concorrente. Serve para abortar (rollback) a transação sem tratar
 * a corrida como erro inesperado.
 */
class ResultadoJaPromovidoError extends Error {}

/**
 * Promove um candidato de contratação pública similar
 * (`ResultadoSimilaridade`) para uma Fonte oficial da estimativa.
 *
 * Conformidade IN 65/2021: um preço só entra na estimativa com
 * fonte + data + evidência. Por isso a `Fonte` e a `Evidencia` são criadas
 * ATOMICAMENTE numa única transação; sem a evidência, a regra R-02
 * (`validarEvidenciasFontes`) bloquearia a consolidação. Toda promoção é
 * auditada (CLAUDE.md §8).
 */
export async function promoverResultadoSimilaridade(
  resultadoId: string,
): Promise<ActionResult<{ fonteId: string }>> {
  const user = await requireRole("pesquisa");

  const parsed = promoverSchema.safeParse({ resultadoId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // `select` explícito, e não `include`: sem ele o Prisma pede TODAS as colunas
  // escalares do model, incluindo as que o M13 acrescentou (`origem`,
  // `conversaId`, `termoBuscaUsado`). Código e migration sobem em tempos
  // diferentes (CLAUDE.md §9.19) — entre o deploy e a aplicação da migration,
  // o SELECT referenciaria colunas inexistentes e esta ação quebraria em runtime
  // com "column does not exist". Listar o que se usa mantém a action compatível
  // com o banco antes e depois da migration.
  const resultado = await db.resultadoSimilaridade.findUnique({
    where: { id: parsed.data.resultadoId },
    select: {
      id: true,
      tipoCandidato: true,
      fonteDescricao: true,
      fonteOrgaoOuId: true,
      fonteUrl: true,
      valorUnitario: true,
      valorUnitarioAjustado: true,
      ajusteUnidadeMedida: true,
      dataReferencia: true,
      scoreFinal: true,
      justificativa: true,
      promovidoParaFonte: true,
      item: { select: { id: true, processoId: true } },
    },
  });

  if (!resultado) return { error: "Candidato não encontrado" };
  if (resultado.promovidoParaFonte) return { error: "Este candidato já foi promovido" };

  // Candidato achado na web aberta não pode virar Fonte por aqui: a evidência
  // seria criada com data/hora do instante da promoção, não do acesso real à
  // página (IN 65/2021). Ver `podePromoverCandidato`.
  const promocao = podePromoverCandidato(resultado.tipoCandidato);
  if (!promocao.permitido) return { error: promocao.motivo ?? "Candidato não promovível" };

  const itemId = resultado.item.id;
  const tipoFonte = mapTipoCandidatoParaFonte(resultado.tipoCandidato);
  const scoreFinal = Number(resultado.scoreFinal);

  // O preço que entra na estimativa é o ajustado pelo analista quando existe —
  // a fonte pública muitas vezes publica o valor cheio do contrato no lugar do
  // preço por unidade (ver domain/ajusteValorCandidato.ts). Promover o valor
  // cru nesse caso inflaria a série.
  const valorAjustado =
    resultado.valorUnitarioAjustado == null ? null : Number(resultado.valorUnitarioAjustado);
  const valorUnitario = valorUnitarioEfetivo({
    valorUnitario: Number(resultado.valorUnitario),
    valorUnitarioAjustado: valorAjustado,
  });
  const houveAjuste = valorAjustado !== null;

  let fonteId: string;
  try {
    fonteId = await db.$transaction(async (tx) => {
      // 1. Fonte — espelha os campos de fontes.ts:criarFonte.
      //    `resultadoSimilaridadeId` vincula a Fonte ao candidato de origem e é
      //    @unique no schema: defesa em profundidade contra promoção duplicada
      //    do mesmo candidato (backstop de banco além da guarda atômica abaixo).
      const fonte = await tx.fonte.create({
        data: {
          itemId,
          tipo: tipoFonte,
          descricao: resultado.fonteDescricao,
          orgaoOuFornecedor: resultado.fonteOrgaoOuId,
          dataReferencia: resultado.dataReferencia,
          valorUnitario,
          resultadoSimilaridadeId: resultado.id,
        },
      });

      // 2. Evidencia — obrigatória para satisfazer R-02 (fonte+data+evidência).
      await tx.evidencia.create({
        data: {
          fonteId: fonte.id,
          dataHoraAcesso: new Date(),
          url: resultado.fonteUrl ?? null,
          // O ajuste entra na descrição da evidência para o auditor ver, no
          // próprio documento comprobatório, que o preço promovido não é o
          // número cru publicado pela fonte.
          descricao:
            `Contratação pública similar (score ${scoreFinal.toFixed(0)}) — ${resultado.justificativa}` +
            (houveAjuste
              ? ` [valor ajustado pelo analista: R$ ${valorUnitario.toFixed(2)}` +
                `${resultado.ajusteUnidadeMedida ? ` por ${resultado.ajusteUnidadeMedida}` : ""}` +
                `, a partir de R$ ${Number(resultado.valorUnitario).toFixed(2)} publicados na fonte]`
              : ""),
        },
      });

      // 3. SeriePreco do item — reaproveita a existente ou cria zerada
      //    (mirror de precos.ts:criarSeriePreco).
      let serie = await tx.seriePreco.findFirst({ where: { itemId } });
      if (!serie) {
        serie = await tx.seriePreco.create({
          data: {
            itemId,
            metodo: "media",
            valorEstimado: 0,
            media: 0,
            mediana: 0,
            menorValor: 0,
            coeficienteVariacao: 0,
            totalPrecos: 0,
            precosIncluidos: 0,
          },
        });
      }

      // 4. PrecoConsolidado — espelha o create de precos.ts:adicionarPreco.
      await tx.precoConsolidado.create({
        data: {
          seriePrecoId: serie.id,
          fonte: tipoFonte,
          descricaoFonte: resultado.fonteDescricao,
          fornecedorOuOrgao: resultado.fonteOrgaoOuId,
          dataReferencia: resultado.dataReferencia,
          valorUnitario,
          // Vínculo com o candidato de origem: sem ele, corrigir o valor depois
          // da promoção não teria como alcançar esta linha da série.
          resultadoSimilaridadeId: resultado.id,
        },
      });

      // 5. Marca o candidato como promovido — guarda ATÔMICA contra corrida.
      //    O `updateMany` condicional (promovidoParaFonte: false) só afeta a
      //    linha se nenhuma outra transação a promoveu antes; count === 0
      //    significa promoção concorrente, e o throw reverte tudo (Fonte,
      //    Evidencia, PrecoConsolidado) via rollback — evitando o mesmo preço
      //    entrar duas vezes na série e distorcer a estimativa (IN 65/2021).
      const marcado = await tx.resultadoSimilaridade.updateMany({
        where: { id: resultado.id, promovidoParaFonte: false },
        data: { promovidoParaFonte: true },
      });
      if (marcado.count === 0) {
        throw new ResultadoJaPromovidoError();
      }

      return fonte.id;
    });
  } catch (erro) {
    // P2002 = violação da constraint @unique de `resultadoSimilaridadeId`:
    // backstop de banco quando duas transações concorrentes escapam da guarda
    // atômica. Tratado como a mesma corrida, não como erro inesperado.
    const violouUnicidade =
      erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
    if (erro instanceof ResultadoJaPromovidoError || violouUnicidade) {
      return { error: "Este candidato já foi promovido" };
    }
    throw erro;
  }

  // Auditoria roda fora da transação, seguindo o padrão do projeto
  // (fontes.ts / precos.ts registram a auditoria após o create).
  await registrarAuditoria({
    userId: user.id,
    processoId: resultado.item.processoId,
    acao: "promover_resultado_similaridade",
    detalhes: {
      resultadoId: resultado.id,
      fonteId,
      itemId,
      scoreFinal,
      valorUnitario,
      valorOriginalFonte: Number(resultado.valorUnitario),
      valorAjustadoPeloAnalista: houveAjuste,
    },
  });

  revalidatePath(`/processos/${resultado.item.processoId}`);

  return { data: { fonteId } };
}
