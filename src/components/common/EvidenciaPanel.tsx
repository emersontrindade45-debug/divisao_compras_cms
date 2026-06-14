import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface EvidenciaPanelProps {
  nomeArquivo: string;
  dataHoraAcesso: string;
  url?: string;
  observacoes?: string;
}

const formatDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

export function EvidenciaPanel({
  nomeArquivo,
  dataHoraAcesso,
  url,
  observacoes,
}: EvidenciaPanelProps) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-sm">{nomeArquivo}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-muted text-muted-foreground border-transparent">
            Data/hora registrada
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDataHora(dataHoraAcesso)}</span>
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline block truncate"
          >
            {url}
          </a>
        )}

        {observacoes && (
          <p className="text-xs text-muted-foreground">{observacoes}</p>
        )}
      </CardContent>
    </Card>
  );
}
