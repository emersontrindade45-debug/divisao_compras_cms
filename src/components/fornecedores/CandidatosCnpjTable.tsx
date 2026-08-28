import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { mascararCnpj } from "@/lib/domain/cnpj";
import { VARIANT_CLASSES } from "@/lib/domain/status";
import { AdicionarCandidatoButton } from "./AdicionarCandidatoButton";
import type { CandidatoCnpjResultado } from "@/lib/actions/candidatosCnpj";

/**
 * Server Component (não o `DataTable` genérico de `components/data-table/` —
 * este assume o array inteiro em memória, incompatível com paginação por
 * cursor vinda do servidor; ver decisão em docs/PLAN.md M27 etapa 6).
 */
export function CandidatosCnpjTable({ candidatos }: { candidatos: CandidatoCnpjResultado[] }) {
  if (candidatos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhum candidato encontrado para este filtro.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Razão social</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Município/UF</TableHead>
            <TableHead>CNAE</TableHead>
            <TableHead>Categoria sugerida</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidatos.map((candidato) => (
            <TableRow key={candidato.id}>
              <TableCell className="max-w-64 font-medium whitespace-normal">
                <div className="flex items-center gap-1.5">
                  {candidato.razaoSocial}
                  {candidato.sicafHabilitado && (
                    <Badge className={VARIANT_CLASSES.success} title="Cadastrado e habilitado a licitar no SICAF (compras.gov.br)">
                      SICAF
                    </Badge>
                  )}
                </div>
                {candidato.nomeFantasia ? (
                  <span className="block text-xs text-muted-foreground">
                    {candidato.nomeFantasia}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="tabular-nums">{mascararCnpj(candidato.cnpj)}</TableCell>
              <TableCell>
                {candidato.municipio}/{candidato.estado}
              </TableCell>
              <TableCell className="max-w-72 whitespace-normal">
                <span className="block tabular-nums">{candidato.cnaePrincipalCodigo}</span>
                <span className="block text-xs text-muted-foreground">
                  {candidato.cnaePrincipalDescricao}
                </span>
              </TableCell>
              <TableCell className="max-w-48 whitespace-normal">
                {candidato.categoriaSugerida.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {candidato.categoriaSugerida.map((cat) => (
                      <Badge key={cat} variant="outline">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <AdicionarCandidatoButton
                  candidatoId={candidato.id}
                  jaEhFornecedor={candidato.jaEhFornecedor}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
