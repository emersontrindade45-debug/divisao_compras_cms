import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { gerarSeriePrecoXlsx } from "@/lib/relatorios/seriePrecoXlsx";

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
        fonte: p.fonte,
        descricaoFonte: p.descricaoFonte,
        fornecedorOuOrgao: p.fornecedorOuOrgao,
        dataReferencia: p.dataReferencia,
        valorUnitario: Number(p.valorUnitario),
        status: p.status,
        motivoExclusao: p.motivoExclusao,
      })),
    },
  };

  const buffer = gerarSeriePrecoXlsx(data);
  const filename = `serie-precos-${processo.numero.replace(/\//g, "-")}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
