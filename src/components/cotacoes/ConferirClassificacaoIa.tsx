"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { conferirClassificacaoIa } from "@/lib/actions/conferirClassificacaoIa";
import { CLASSES, ROTULO_CLASSE, type Taxa } from "@/lib/domain/cotacaoEmail/conferenciaIa";
import type { ClasseResposta } from "@/lib/domain/cotacaoEmail/criterioIa";
import type { Escopo, PainelConferencia } from "@/lib/emailCotacao/conferenciaIa";

interface Props {
  painel: PainelConferencia;
  escopo: Escopo;
  classe?: ClasseResposta;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** "87% (de 75% a 94%) · 31 conferidas", ou "sem conferência" — nunca 0% sem dado. */
function TextoTaxa({ t }: { t: Taxa | undefined }) {
  if (!t || t.taxa === null || !t.intervalo) return <span className="text-muted-foreground">sem conferência</span>;
  return (
    <span className="tabular-nums">
      <strong>{pct(t.taxa)}</strong>{" "}
      <span className="text-xs text-muted-foreground">
        (de {pct(t.intervalo.de)} a {pct(t.intervalo.ate)}) · {t.conferidas} conferida{t.conferidas === 1 ? "" : "s"}
      </span>
    </span>
  );
}

function Linha({ item }: { item: Extract<PainelConferencia, { estado: "ok" }>["itens"][number] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function conferir(classeCorreta: ClasseResposta) {
    startTransition(async () => {
      const r = await conferirClassificacaoIa({ gmailMensagemId: item.gmailMensagemId, classeCorreta });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.data?.certa ? "Conferido: a IA acertou." : `Conferido: a IA errou (era ${ROTULO_CLASSE[classeCorreta]}).`);
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">{item.processoNumero ?? "Processo não identificado"}</span>
        <Badge variant="secondary" className="text-xs">
          IA: {ROTULO_CLASSE[item.classeIa]}
        </Badge>
        <span className="text-xs text-muted-foreground">confiança {item.confianca}</span>
        <Badge variant="outline" className="text-xs">
          {item.aplicada ? (item.desfeita ? "aplicada e desfeita" : "aplicada no dashboard") : "só sugestão"}
        </Badge>
        <a
          href={item.linkGmail}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir no Gmail <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <p className="text-muted-foreground">{item.justificativa}</p>
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button size="sm" disabled={pending} onClick={() => conferir(item.classeIa)}>
          <Check className="size-3.5" aria-hidden /> Certa
        </Button>
        <span className="text-xs text-muted-foreground">ou era:</span>
        {CLASSES.filter((c) => c !== item.classeIa).map((c) => (
          <Button key={c} size="sm" variant="outline" disabled={pending} onClick={() => conferir(c)}>
            {ROTULO_CLASSE[c]}
          </Button>
        ))}
      </div>
    </li>
  );
}

function href(escopo: Escopo, classe?: ClasseResposta): string {
  const q = new URLSearchParams({ aba: "conferir", escopo });
  if (classe) q.set("classe", classe);
  return `/cotacoes?${q.toString()}`;
}

/**
 * Conferência das classificações da IA (M30.d). O analista abre a resposta no Gmail, lê, e marca se
 * a IA acertou ou qual era a classe certa. A taxa de acerto sai das conferências — e diz se a IA já
 * merece decidir sozinha. Não altera consulta, fila nem dashboard; nunca mostra o texto do e-mail.
 */
export function ConferirClassificacaoIa({ painel, escopo, classe }: Props) {
  if (painel.estado === "indisponivel") {
    return (
      <p className="text-sm text-muted-foreground">
        A conferência ainda não está disponível neste ambiente (a tabela não existe ou não pôde ser lida). Isso
        não é &ldquo;nada a conferir&rdquo;: avise o time para aplicar a atualização do banco.
      </p>
    );
  }
  const { resumo, itens, restantes, conferidasTotal } = painel;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Abra cada resposta no Gmail, leia e diga se a IA acertou. A amostra vem numa ordem sorteada (não
        enviesada por data nem processo), então a taxa abaixo estima a precisão da IA de verdade. Nada aqui
        muda o dashboard.
      </p>

      <section aria-label="Taxa de acerto" className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Acerto geral</div>
          <TextoTaxa t={resumo.geral} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Acerto nas aplicadas no dashboard</div>
          <TextoTaxa t={resumo.aplicadas} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Por classe que a IA deu</div>
          {CLASSES.map((c) => (
            <div key={c} className="flex gap-2">
              <span className="w-28">{ROTULO_CLASSE[c]}</span>
              <TextoTaxa t={resumo.porClasse[c]} />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Por confiança declarada</div>
          {["alta", "media", "baixa"].map((c) => (
            <div key={c} className="flex gap-2">
              <span className="w-28">{c === "media" ? "média" : c}</span>
              <TextoTaxa t={resumo.porConfianca[c]} />
            </div>
          ))}
        </div>
        {resumo.confusoes.length > 0 && (
          <div className="sm:col-span-2">
            <div className="text-xs text-muted-foreground">Onde a IA mais erra</div>
            <ul className="space-y-0.5">
              {resumo.confusoes.slice(0, 5).map((e) => (
                <li key={`${e.classeIa}>${e.classeCorreta}`} className="tabular-nums">
                  IA disse <strong>{ROTULO_CLASSE[e.classeIa as ClasseResposta] ?? e.classeIa}</strong>, era{" "}
                  <strong>{ROTULO_CLASSE[e.classeCorreta as ClasseResposta] ?? e.classeCorreta}</strong>: {e.quantidade}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <nav aria-label="Filtros" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">Mostrar:</span>
        <Link href={href("aplicadas", classe)} aria-current={escopo === "aplicadas" ? "true" : undefined}>
          <Badge variant={escopo === "aplicadas" ? "default" : "outline"}>Aplicadas no dashboard</Badge>
        </Link>
        <Link href={href("sugeridas", classe)} aria-current={escopo === "sugeridas" ? "true" : undefined}>
          <Badge variant={escopo === "sugeridas" ? "default" : "outline"}>Só sugestão (na fila)</Badge>
        </Link>
        <span className="ml-2 text-xs text-muted-foreground">Classe:</span>
        <Link href={href(escopo)} aria-current={!classe ? "true" : undefined}>
          <Badge variant={!classe ? "default" : "outline"}>todas</Badge>
        </Link>
        {CLASSES.map((c) => (
          <Link key={c} href={href(escopo, c)} aria-current={classe === c ? "true" : undefined}>
            <Badge variant={classe === c ? "default" : "outline"}>{ROTULO_CLASSE[c]}</Badge>
          </Link>
        ))}
      </nav>

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {conferidasTotal === 0
            ? "Nenhuma classificação encontrada neste filtro."
            : "Tudo o que há neste filtro já foi conferido."}
        </p>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Classificações para conferir">
            {itens.map((i) => (
              <Linha key={i.gmailMensagemId} item={i} />
            ))}
          </ul>
          {restantes > 0 && (
            <p className="text-xs text-muted-foreground">
              Mais {restantes} neste filtro depois destas. Conferidas até agora: {conferidasTotal}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
