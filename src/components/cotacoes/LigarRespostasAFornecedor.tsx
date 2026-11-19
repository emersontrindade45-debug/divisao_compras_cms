"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarFornecedoresDoEnvio, ligarRespostaAoFornecedor } from "@/lib/actions/ligarRespostaFornecedor";

export interface RespostaLigavelItem {
  gmailMensagemId: string;
  classe: "orcamento" | "recusa" | "duvida";
  justificativa: string;
  dominio: string;
  dominioGenerico: boolean;
  processoNumero: string | null;
  linkGmail: string;
}

interface Candidato {
  consultaId: string;
  email: string;
  razaoSocial: string | null;
  situacao: string;
}

const CLASSE: Record<RespostaLigavelItem["classe"], string> = {
  orcamento: "orçamento",
  recusa: "recusa",
  duvida: "dúvida",
};

const SITUACAO: Record<string, string> = {
  sem_resposta: "sem resposta",
  a_confirmar: "a confirmar",
  orcamento: "orçamento",
  recusa: "recusa",
  duvida: "dúvida",
  email_invalido: "e-mail inválido",
};

function Linha({ item }: { item: RespostaLigavelItem }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [buscando, startBusca] = useTransition();
  const [ligando, startLigacao] = useTransition();

  function buscar(t: string) {
    startBusca(async () => {
      const r = await buscarFornecedoresDoEnvio({ gmailMensagemId: item.gmailMensagemId, termo: t });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setCandidatos(r.data ?? []);
    });
  }

  function abrir() {
    const abrindo = !aberta;
    setAberta(abrindo);
    // A busca pelo domínio roda no clique (não em efeito): só quando abre pela primeira vez.
    if (abrindo && candidatos === null) buscar("");
  }

  function ligar(c: Candidato) {
    startLigacao(async () => {
      const r = await ligarRespostaAoFornecedor({ gmailMensagemId: item.gmailMensagemId, consultaId: c.consultaId });
      if (r.error) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      if (r.data?.aplicada) toast.success(`Resposta ligada: o fornecedor ficou como ${SITUACAO[r.data.situacao] ?? r.data.situacao}.`);
      else toast.warning(`Resposta ligada. O fornecedor já constava como ${SITUACAO[r.data?.situacao ?? ""] ?? "decidido"}; a situação foi mantida.`);
      router.refresh();
    });
  }

  const semCriterio = candidatos !== null && candidatos.length === 0;

  return (
    <li className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">{item.processoNumero ?? "Processo não identificado"}</span>
        <Badge variant="secondary" className="text-xs">
          IA: {CLASSE[item.classe]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {item.dominioGenerico ? `domínio genérico (${item.dominio})` : `domínio ${item.dominio}`}
        </span>
        <span className="text-muted-foreground">{item.justificativa}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={item.linkGmail}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Abrir no Gmail <ExternalLink className="size-3" aria-hidden />
          </a>
          <Button size="sm" variant={aberta ? "secondary" : "default"} onClick={abrir} aria-expanded={aberta}>
            {aberta ? "Fechar" : "Ligar a fornecedor"}
          </Button>
        </div>
      </div>

      {aberta && (
        <div className="space-y-2 border-t pt-2">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              buscar(termo);
            }}
          >
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="E-mail ou nome da empresa (mín. 3 letras)"
              aria-label="Buscar fornecedor deste envio"
              className="h-8 max-w-sm"
            />
            <Button size="sm" type="submit" variant="outline" disabled={buscando}>
              {buscando ? "Buscando…" : "Buscar"}
            </Button>
          </form>

          {candidatos !== null && candidatos.length > 0 && (
            <ul className="space-y-1" aria-label="Fornecedores deste envio">
              {candidatos.map((c) => (
                <li key={c.consultaId} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1">
                  <span className="font-medium">{c.razaoSocial ?? c.email}</span>
                  {c.razaoSocial && <span className="text-xs text-muted-foreground">{c.email}</span>}
                  <Badge variant="outline" className="text-xs">
                    {SITUACAO[c.situacao] ?? c.situacao}
                  </Badge>
                  <Button size="sm" className="ml-auto" disabled={ligando} onClick={() => ligar(c)}>
                    Ligar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {semCriterio && (
            <p className="text-xs text-muted-foreground">
              {termo.trim().length >= 3
                ? "Nenhum fornecedor deste envio combina com a busca."
                : item.dominioGenerico
                  ? "O domínio do remetente é genérico: digite o e-mail ou o nome da empresa (veja a assinatura no Gmail)."
                  : "Nenhum destinatário deste envio usa o domínio do remetente: digite o e-mail ou o nome da empresa."}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Respostas que a IA já classificou mas que o sistema não ligou a fornecedor (M30.d). O analista abre
 * a mensagem no Gmail, vê quem assina e liga ao fornecedor DAQUELE envio. A ligação passa a contar
 * para o fornecedor (taxa de resposta, histórico) e pode ser desfeita na aba "Aplicadas pela IA".
 * Nunca mostra o texto do e-mail.
 */
export function LigarRespostasAFornecedor({ itens }: { itens: RespostaLigavelItem[] }) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma resposta classificada está sem fornecedor.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Estas respostas já estão no dashboard (orçamento, recusa ou dúvida), mas não se sabe qual fornecedor as
        enviou. Abra no Gmail, veja a assinatura e ligue ao fornecedor do envio. {itens.length} restantes.
      </p>
      <ul className="space-y-2" aria-label="Respostas sem fornecedor">
        {itens.map((i) => (
          <Linha key={i.gmailMensagemId} item={i} />
        ))}
      </ul>
    </div>
  );
}
