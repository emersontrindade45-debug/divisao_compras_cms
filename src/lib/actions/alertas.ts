"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { gerarAlertas, type Alerta } from "@/lib/domain/alertas";
import { CV_PRE_ALERTA } from "@/lib/domain/priceStats";

export async function buscarAlertas(): Promise<Alerta[]> {
  await requireAuth();

  const now = new Date();
  const tresDiasAFrente = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [cotacoesPendentes, processos, propostasComRessalva, seriesComDispersao] =
    await Promise.all([
      // Cotações silenciosas com prazo nos próximos 3 dias ou vencidas
      db.cotacao.findMany({
        where: {
          status: "silenciosa",
          dataLimite: { lte: tresDiasAFrente },
        },
        select: {
          id: true,
          processoId: true,
          dataLimite: true,
          fornecedor: { select: { razaoSocial: true } },
          processo: { select: { numero: true } },
        },
      }),

      // Processos ativos sem preço público incluído. Mesma definição do card
      // "Sem fonte pública" do dashboard (M30.a): fonte canônica é o
      // PrecoConsolidado — `Fonte` não enxerga os preços que vêm da planilha.
      db.processo.findMany({
        where: { status: { not: "aderente" }, faseAndamento: { not: "concluido" } },
        select: {
          id: true,
          numero: true,
          objeto: true,
          status: true,
          dataAbertura: true,
          responsavel: true,
          itens: {
            select: {
              id: true,
              seriePrecos: {
                select: {
                  precos: {
                    where: { status: "incluido", fonte: "contratacao_publica" },
                    take: 1,
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      }),

      // Propostas com status "com_ressalva" ou "invalida"
      db.proposta.findMany({
        where: { statusGeral: { in: ["com_ressalva", "invalida"] } },
        select: {
          cotacaoId: true,
          cotacao: {
            select: {
              fornecedor: { select: { razaoSocial: true } },
              processo: { select: { numero: true, id: true } },
            },
          },
        },
      }),

      // Séries com dispersão alta (pré-alerta: ver comentário em priceStats.ts)
      db.seriePreco.findMany({
        where: { coeficienteVariacao: { gte: CV_PRE_ALERTA } },
        include: {
          item: {
            select: {
              id: true,
              descricao: true,
              processo: { select: { id: true, numero: true } },
            },
          },
        },
      }),
    ]);

  // Processos sem fonte pública em nenhum item
  const processosSemFontePublica = processos.filter((p) =>
    p.itens.every((i) => i.seriePrecos.every((sp) => sp.precos.length === 0)),
  );

  const alertas = gerarAlertas({
    cotacoesVencendo: cotacoesPendentes.map((c) => ({
      id: c.id,
      processoId: c.processoId,
      processoNumero: c.processo.numero,
      fornecedorNome: c.fornecedor.razaoSocial,
      diasRestantes: Math.ceil(
        (c.dataLimite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
    })),
    processosSemFontePublica: processosSemFontePublica.map((p) => ({
      id: p.id,
      numero: p.numero,
    })),
    cotacoesComPendenciaDocumental: propostasComRessalva.map((p) => ({
      id: p.cotacaoId,
      processoId: p.cotacao.processo.id,
      processoNumero: p.cotacao.processo.numero,
      fornecedorNome: p.cotacao.fornecedor.razaoSocial,
    })),
    itensComDispersao: seriesComDispersao.map((s) => ({
      seriePrecoId: s.id,
      itemId: s.item.id,
      processoId: s.item.processo.id,
      processoNumero: s.item.processo.numero,
      itemDescricao: s.item.descricao,
      coeficienteVariacao: Number(s.coeficienteVariacao),
    })),
  });

  return alertas;
}
