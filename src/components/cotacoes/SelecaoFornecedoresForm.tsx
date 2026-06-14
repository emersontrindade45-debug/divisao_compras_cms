"use client";

import { useState } from "react";
import { Send, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/fornecedores/ScoreBadge";
import { FORNECEDORES } from "@/lib/fixtures/fornecedores";
import { cn } from "@/lib/utils";

const TEMPLATE_EMAIL = `Prezado(a) {responsavel},

A Câmara Municipal de Santos está realizando pesquisa de preços para o processo {numero},
cujo objeto é: {objeto}.

Solicitamos gentilmente que V.Sa. nos envie proposta comercial contendo:
- Descrição completa do produto/serviço
- Valor unitário e total
- Prazo de validade da proposta
- CNPJ e dados do responsável

Prazo para retorno: {prazo}

Atenciosamente,
Divisão de Compras — Câmara Municipal de Santos`;

export function SelecaoFornecedoresForm() {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [previewAberto, setPreviewAberto] = useState(false);

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ativos = FORNECEDORES.filter((f) => f.status === "ativo");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Seleção de Fornecedores
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {selecionados.size} selecionados
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-6" />
                <TableHead>Fornecedor</TableHead>
                <TableHead>Categorias</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="tabular-nums">Taxa de resposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ativos.map((f) => {
                const checked = selecionados.has(f.id);
                return (
                  <TableRow
                    key={f.id}
                    className={cn("cursor-pointer", checked && "bg-primary/5")}
                    onClick={() => toggle(f.id)}
                  >
                    <TableCell className="pl-6">
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="accent-primary size-4 cursor-pointer"
                        aria-label={`Selecionar ${f.razaoSocial}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{f.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.cidade}/{f.estado} · {f.responsavelContato}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {f.categoria.slice(0, 2).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">
                            {c}
                          </Badge>
                        ))}
                        {f.categoria.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{f.categoria.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={f.score} />
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums text-sm">{f.taxaResposta.toFixed(1)}%</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selecionados.size > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              Prévia do e-mail de cotação
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewAberto((v) => !v)}
              className="h-7 text-xs"
            >
              {previewAberto ? "Ocultar" : "Expandir"}
            </Button>
          </CardHeader>
          {previewAberto && (
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {TEMPLATE_EMAIL}
              </pre>
            </CardContent>
          )}
          <CardContent className={cn("flex items-center justify-between", previewAberto && "pt-0")}>
            <p className="text-sm text-muted-foreground">
              {selecionados.size} e-mail{selecionados.size > 1 ? "s" : ""} será
              {selecionados.size > 1 ? "ão" : ""} disparado{selecionados.size > 1 ? "s" : ""} após
              confirmação.
            </p>
            <Button size="sm" className="gap-2">
              <Send className="size-3.5" />
              Disparar cotações
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
