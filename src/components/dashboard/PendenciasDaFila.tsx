import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export interface PendenciasDaFilaProps {
  respostasAConfirmar: number;
  enviosSemProcesso: number;
  semResponsavel: number;
  vencidas: number;
}

const n = (x: number) => x.toLocaleString("pt-BR");

/** Ao lado de "O que mudou": o que está parado esperando a Divisão decidir ou atribuir. Todas vêm do banco. */
export function PendenciasDaFila(p: PendenciasDaFilaProps) {
  const itens: { id: string; total: number; texto: string; href?: string }[] = [
    {
      id: "respostas",
      total: p.respostasAConfirmar,
      texto: "mensagem(ns) de fornecedor a confirmar (todo o período)",
      href: "/cotacoes?aba=confirmar",
    },
    {
      id: "vencidas",
      total: p.vencidas,
      texto: "cotação(ões) com prazo vencido",
      href: "/cotacoes",
    },
    {
      id: "semResponsavel",
      total: p.semResponsavel,
      texto: "processo(s) ativo(s) sem responsável",
      href: "/processos",
    },
    {
      id: "semProcesso",
      total: p.enviosSemProcesso,
      texto: "envio(s) de cotação sem processo importado — importe a planilha para ligá-los",
    },
  ].filter((i) => i.total > 0);

  return (
    <section aria-labelledby="pendencias-fila" className="space-y-2">
      <h3
        id="pendencias-fila"
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Pendências da fila
      </h3>
      <Card>
        <CardContent className="pt-4">
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
          ) : (
            <ul className="space-y-2">
              {itens.map((i) => (
                <li key={i.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  {i.href ? (
                    <Link href={i.href} className="hover:underline">
                      <strong className="tabular-nums">{n(i.total)}</strong> {i.texto} →
                    </Link>
                  ) : (
                    <span>
                      <strong className="tabular-nums">{n(i.total)}</strong> {i.texto}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
