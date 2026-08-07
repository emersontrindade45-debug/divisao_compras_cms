import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";

export interface FonteReferenciaRow {
  id: string;
  chave: string;
  nome: string;
  esfera: string;
  periodicidade: string;
  ativa: boolean;
  urlOficial: string;
}

const ESFERA_LABEL: Record<string, string> = {
  federal: "Federal",
  estadual: "Estadual",
  municipal: "Municipal",
};

export function FontesReferenciaTable({ fontes }: { fontes: FonteReferenciaRow[] }) {
  if (fontes.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="Nenhuma fonte de referência cadastrada"
        description="O catálogo (`FonteReferencia`) está pronto (M15); SINAPI, CADTERC e CATMAT são cadastrados a partir do M16."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Esfera</TableHead>
          <TableHead>Periodicidade</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fontes.map((fonte) => (
          <TableRow key={fonte.id}>
            <TableCell className="font-medium">
              <a
                href={fonte.urlOficial}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {fonte.nome}
              </a>
            </TableCell>
            <TableCell>{ESFERA_LABEL[fonte.esfera] ?? fonte.esfera}</TableCell>
            <TableCell>{fonte.periodicidade}</TableCell>
            <TableCell>
              <Badge
                className={
                  fonte.ativa
                    ? "bg-success text-success-foreground border-transparent"
                    : "bg-muted text-muted-foreground border-transparent"
                }
              >
                {fonte.ativa ? "Ativa" : "Inativa"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
