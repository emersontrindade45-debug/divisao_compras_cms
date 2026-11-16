"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolverRespostaEmail, type DesfechoResposta } from "@/lib/actions/resolverRespostaEmail";
import { rotuloDoMotivo } from "@/lib/domain/cotacaoEmail/motivosFila";

export interface RespostaPendenteItem {
  id: string;
  dataResposta: string;
  motivo: string;
  /** Só o domínio — o endereço completo nunca é guardado (sigilo, Q28). */
  remetenteDominio: string;
  temAnexoOrcamento: boolean;
  contemRecusa: boolean;
  contemValor: boolean;
  processoNumero: string | null;
  numeroNoAssunto: string | null;
  sugestao: { email: string; razaoSocial: string | null } | null;
  linkGmail: string;
}

function Linha({ item }: { item: RespostaPendenteItem }) {
  const [pending, startTransition] = useTransition();
  const [emailConsulta, setEmailConsulta] = useState("");
  const router = useRouter();

  function resolver(desfecho: DesfechoResposta) {
    startTransition(async () => {
      const r = await resolverRespostaEmail({
        id: item.id,
        desfecho,
        emailConsulta: emailConsulta.trim() || undefined,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data?.consultaJaClassificada
          ? "Resolvida. O fornecedor já tinha classificação segura e foi mantido."
          : "Resposta resolvida.",
      );
      router.refresh();
    });
  }

  const precisaEmail = !item.sugestao;

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {item.processoNumero ??
            (item.numeroNoAssunto ? `Proc. ${item.numeroNoAssunto} (ainda não importado)` : "Processo não identificado")}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {new Date(item.dataResposta).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </span>
        <Badge variant="outline" className="text-xs">
          {rotuloDoMotivo(item.motivo)}
        </Badge>
        <span className="text-xs text-muted-foreground">de @{item.remetenteDominio}</span>
        {item.temAnexoOrcamento && <Badge variant="secondary" className="text-xs">anexo</Badge>}
        {item.contemRecusa && <Badge variant="secondary" className="text-xs">frase de recusa</Badge>}
        {item.contemValor && <Badge variant="secondary" className="text-xs">R$ no texto</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.sugestao ? (
          <p className="text-sm">
            Fornecedor provável:{" "}
            <strong>{item.sugestao.razaoSocial ?? item.sugestao.email}</strong>
            {item.sugestao.razaoSocial && (
              <span className="text-xs text-muted-foreground"> ({item.sugestao.email})</span>
            )}
          </p>
        ) : (
          <Input
            type="email"
            value={emailConsulta}
            onChange={(e) => setEmailConsulta(e.target.value)}
            placeholder="E-mail para o qual a solicitação foi enviada"
            aria-label="E-mail ao qual a solicitação foi enviada"
            disabled={pending}
            className="h-8 max-w-sm"
          />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending || (precisaEmail && !emailConsulta.trim())} onClick={() => resolver("orcamento")}>
            É orçamento
          </Button>
          <Button size="sm" variant="outline" disabled={pending || (precisaEmail && !emailConsulta.trim())} onClick={() => resolver("recusa")}>
            É recusa
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolver("nao_e_resposta")}>
            Não é resposta
          </Button>
          <a
            href={item.linkGmail}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Abrir no Gmail <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </li>
  );
}

/**
 * Fila das respostas que nenhuma regra decidiu com segurança (M30.d). Mostra fornecedor provável,
 * processo, data e o link para abrir o e-mail NO Gmail — nunca o corpo do e-mail, que não é
 * guardado. O valor do orçamento não entra aqui: a proposta segue pelo checklist de validade.
 */
export function RespostasAConfirmar({ itens }: { itens: RespostaPendenteItem[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma resposta aguardando confirmação. Use &quot;Verificar respostas&quot; para ler a caixa.
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Respostas a confirmar">
      {itens.map((i) => (
        <Linha key={i.id} item={i} />
      ))}
    </ul>
  );
}
