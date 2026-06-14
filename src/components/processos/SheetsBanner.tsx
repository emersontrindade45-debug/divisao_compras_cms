import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SheetsBanner({ sheetsUrl }: { sheetsUrl: string | undefined }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Os processos são sincronizados da planilha Google Sheets. Alterações devem ser feitas
          diretamente na planilha.
        </p>
      </div>
      {sheetsUrl ? (
        <Button
          render={<a href={sheetsUrl} target="_blank" rel="noopener noreferrer" />}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Ver planilha
        </Button>
      ) : null}
    </div>
  );
}
