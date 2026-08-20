import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PromoverCandidatoButton } from "./PromoverCandidatoButton";
import type { CandidatoFornecedorListItem } from "@/lib/actions/candidatosFornecedor";

export function CandidatosTable({
  candidatos,
  categoriasDisponiveis,
}: {
  candidatos: CandidatoFornecedorListItem[];
  categoriasDisponiveis: string[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>CNPJ</TableHead>
          <TableHead>Razão social</TableHead>
          <TableHead>Município</TableHead>
          <TableHead>CNAE</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidatos.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <span className="font-mono text-xs">{c.cnpjMascarado}</span>
            </TableCell>
            <TableCell>
              <span className="text-sm font-medium">{c.razaoSocial}</span>
              {c.nomeFantasia ? (
                <p className="text-xs text-muted-foreground">{c.nomeFantasia}</p>
              ) : null}
            </TableCell>
            <TableCell className="text-xs">
              {c.municipio}/{c.estado}
            </TableCell>
            <TableCell className="max-w-[220px] whitespace-normal text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{c.cnaePrincipalCodigo}</span>{" "}
              {c.cnaePrincipalDescricao}
            </TableCell>
            <TableCell>
              <div className="flex max-w-[180px] flex-wrap gap-1">
                {c.categoriaSugerida.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  c.categoriaSugerida.map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs font-normal">
                      {cat}
                    </Badge>
                  ))
                )}
              </div>
            </TableCell>
            <TableCell>
              <PromoverCandidatoButton
                candidatoId={c.id}
                razaoSocial={c.razaoSocial}
                categoriaSugerida={c.categoriaSugerida}
                categoriasDisponiveis={categoriasDisponiveis}
                jaCadastrado={c.jaCadastrado}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
