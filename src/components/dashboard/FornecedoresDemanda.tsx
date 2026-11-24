import { pct, proporcaoEmPct, MESES_CURTOS } from "@/lib/domain/indicadores/formatosPainel";
import type { ResumoFornecedores } from "@/lib/domain/indicadores/fornecedoresLevantamento";
import { Card, CardContent } from "@/components/ui/card";

/** O que o painel sabe dos fornecedores: resumo do ano, "sem dados" ou o motivo de não ter lido. */
export type FornecedoresNoPainel =
  | { estado: "nao_configurada" }
  | { estado: "indisponivel"; motivo: string }
  | { estado: "sem_dados"; ano: number }
  | { estado: "ok"; resumo: ResumoFornecedores; inconsistentes: string[] };

const n = (x: number) => x.toLocaleString("pt-BR");

/** Seção recolhível "Fornecedores e cotações por e-mail" (fonte: planilha do Levantamento, Gmail). */
export function FornecedoresDemanda({ dados }: { dados: FornecedoresNoPainel }) {
  return (
    <details className="group rounded-xl border bg-card print:hidden">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
        Fornecedores e cotações por e-mail{" "}
        <span className="ml-1 font-normal text-muted-foreground">
          fonte: Levantamento (Gmail) · orçamento em validação
        </span>
      </summary>
      <div className="space-y-3 border-t px-4 py-4">
        <Conteudo dados={dados} />
      </div>
    </details>
  );
}

function Conteudo({ dados }: { dados: FornecedoresNoPainel }) {
  if (dados.estado === "nao_configurada")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        A planilha do Levantamento ainda não foi configurada neste ambiente.
      </p>
    );
  if (dados.estado === "indisponivel")
    return (
      <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        Não foi possível carregar os fornecedores agora. {dados.motivo}
      </p>
    );
  if (dados.estado === "sem_dados")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        O Levantamento não tem dados de {dados.ano}.
      </p>
    );

  const { resumo: r, inconsistentes } = dados;
  const maximo = Math.max(
    0,
    ...r.meses.map((m) => (m.destinatarios > 0 ? (m.recusa + m.duvida + m.orcamento) / m.destinatarios : 0)),
  );
  return (
    <>
      {inconsistentes.length > 0 && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Em {inconsistentes.join(", ")} as classes não somam os destinatários da planilha; confira o
          Levantamento antes de confiar nesses meses.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <figure className="space-y-2">
          <figcaption className="text-sm font-medium">
            Retorno útil por mês (sobre destinatários contatados)
          </figcaption>
          <div className="flex h-36 items-end gap-1" role="img" aria-label="Retorno útil por mês. Valores na tabela abaixo.">
            {r.meses.map((m) => {
              const firme = m.destinatarios > 0 ? (m.recusa + m.duvida) / m.destinatarios : 0;
              const orc = m.destinatarios > 0 ? m.orcamento / m.destinatarios : 0;
              const mes = Number(m.mes.slice(5, 7));
              return (
                <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                  <div className="flex h-full flex-col justify-end">
                    <div
                      className="w-full bg-warning/70"
                      style={{ height: `${proporcaoEmPct(orc, maximo)}%` }}
                      title={`${MESES_CURTOS[mes - 1]}: orçamento (em validação) ${pct(orc)}`}
                    />
                    <div
                      className="w-full rounded-b-sm bg-primary"
                      style={{ height: `${proporcaoEmPct(firme, maximo)}%` }}
                      title={`${MESES_CURTOS[mes - 1]}: recusa + dúvida ${pct(firme)}`}
                    />
                  </div>
                  <span className="text-center text-[10px] text-muted-foreground">{MESES_CURTOS[mes - 1]}</span>
                </div>
              );
            })}
          </div>
          <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-primary" />Recusa + dúvida (firme)</span>
            <span><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-warning/70" />Orçamento (em validação)</span>
          </p>
          <table className="sr-only">
            <caption>Retorno útil por mês</caption>
            <thead><tr><th>Mês</th><th>Recusa + dúvida</th><th>Orçamento</th></tr></thead>
            <tbody>
              {r.meses.map((m) => (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td>{m.recusa + m.duvida}</td>
                  <td>{m.orcamento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium">Resumo {r.ano}</p>
            <table className="w-full text-sm">
              <tbody className="[&_td:last-child]:text-right [&_td:last-child]:tabular-nums">
                <tr><td>E-mails de solicitação</td><td><strong>{n(r.emails)}</strong></td></tr>
                <tr><td>Destinatários contatados</td><td><strong>{n(r.destinatarios)}</strong></td></tr>
                <tr><td>Recusa + dúvida</td><td><strong>{n(r.recusa + r.duvida)}</strong> ({r.retornoFirme === null ? "—" : pct(r.retornoFirme)})</td></tr>
                <tr><td>Orçamento (em validação)</td><td><strong>{n(r.orcamento)}</strong> ({r.retornoOrcamento === null ? "—" : pct(r.retornoOrcamento)})</td></tr>
                <tr><td>Só confirmaram recebimento</td><td>{n(r.outra)}</td></tr>
                <tr><td>Sem resposta</td><td>{n(r.semResposta)}</td></tr>
                <tr><td>Endereço errado</td><td><strong>{n(r.enderecoErrado)}</strong></td></tr>
                <tr><td>Devolvido por outro motivo</td><td>{n(r.devolvidoOutro)}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.picoEnderecoErrado &&
          `Maior pico de endereços errados: ${MESES_CURTOS[Number(r.picoEnderecoErrado.mes.slice(5, 7)) - 1]} (${n(r.picoEnderecoErrado.quantidade)}). `}
        A captura dos e-mails foi conferida por inteiro. Recusa, dúvida e causa da devolução acertaram 100% na amostra
        conferida; “orçamento” acertou 6 de 10 (os erros tinham PDF anexo), por isso aparece separado.
      </p>
    </>
  );
}
