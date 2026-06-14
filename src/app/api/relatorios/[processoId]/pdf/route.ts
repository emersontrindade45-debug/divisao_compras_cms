import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { MemoriaCalculoPdfDocument } from "@/lib/relatorios/memoriaCalculoPdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ processoId: string }> },
) {
  await requireAuth();

  const { processoId } = await params;

  const processo = await db.processo.findUnique({
    where: { id: processoId },
    include: {
      itens: {
        include: {
          seriePrecos: {
            include: { precos: { orderBy: { dataReferencia: "asc" } } },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
        take: 1,
      },
    },
  });

  if (!processo) {
    return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });
  }

  const item = processo.itens[0];
  const serie = item?.seriePrecos[0];

  if (!item || !serie) {
    return NextResponse.json(
      { error: "Série de preços não encontrada para este processo" },
      { status: 404 },
    );
  }

  const data = {
    processo: {
      numero: processo.numero,
      objeto: processo.objeto,
      responsavel: processo.responsavel,
      quantidade: processo.quantidade,
      unidade: processo.unidade,
    },
    serie: {
      metodo: serie.metodo,
      valorEstimado: Number(serie.valorEstimado),
      media: Number(serie.media),
      mediana: Number(serie.mediana),
      menorValor: Number(serie.menorValor),
      coeficienteVariacao: Number(serie.coeficienteVariacao),
      totalPrecos: serie.totalPrecos,
      precosIncluidos: serie.precosIncluidos,
      precos: serie.precos.map((p) => ({
        id: p.id,
        fonte: p.fonte,
        descricaoFonte: p.descricaoFonte,
        fornecedorOuOrgao: p.fornecedorOuOrgao,
        dataReferencia: p.dataReferencia,
        valorUnitario: Number(p.valorUnitario),
        status: p.status,
        motivoExclusao: p.motivoExclusao,
      })),
    },
    geradoEm: new Date(),
  };

  const element = createElement(MemoriaCalculoPdfDocument, { data }) as ReactElement<DocumentProps>;
  const buffer: Buffer = await renderToBuffer(element);

  const filename = `memoria-calculo-${processo.numero.replace(/\//g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
