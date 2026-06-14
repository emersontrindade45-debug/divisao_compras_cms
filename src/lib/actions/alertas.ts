"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { gerarAlertas, type Alerta } from "@/lib/domain/alertas";

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
        include: {
          fornecedor: { select: { razaoSocial: true } },
          processo: { select: { numero: true } },
        },
      }),

      // Processos sem nenhuma fonte do tipo contratacao_publica
      db.processo.findMany({
        where: { status: { in: ["pendente", "parcial"] } },
        include: {
          itens: {
            include: {
              fontes: { where: { tipo: "contratacao_publica" }, take: 1 },
            },
          },
        },
      }),

      // Propostas com status "com_ressalva" ou "invalida"
      db.proposta.findMany({
        where: { statusGeral: { in: ["com_ressalva", "invalida"] } },
        include: {
          cotacao: {
            include: {
              fornecedor: { select: { razaoSocial: true } },
              processo: { select: { numero: true, id: true } },
            },
          },
        },
      }),

      // Séries com dispersão alta (CV >= 25%)
      db.seriePreco.findMany({
        where: { coeficienteVariacao: { gte: 25 } },
        include: {
          item: {
            select: {
              descricao: true,
              processo: { select: { id: true, numero: true } },
            },
          },
        },
      }),
    ]);

  // Processos sem fonte pública em nenhum item
  const processosSemFontePublica = processos.filter((p) =>
    p.itens.every((i) => i.fontes.length === 0),
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
      processoId: s.item.processo.id,
      processoNumero: s.item.processo.numero,
      itemDescricao: s.item.descricao,
      coeficienteVariacao: Number(s.coeficienteVariacao),
    })),
  });

  return alertas;
}
