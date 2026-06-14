"use client";

import Link from "next/link";
import { AlertTriangle, X, Info, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { Alerta } from "@/lib/domain/alertas";

const SEVERIDADE_CONFIG = {
  critico: {
    containerClass: "border-danger/30 bg-danger/5",
    iconClass: "text-danger",
    icon: AlertCircle,
    badgeClass: "bg-danger/10 text-danger",
    label: "Crítico",
  },
  aviso: {
    containerClass: "border-warning/30 bg-warning/5",
    iconClass: "text-warning",
    icon: AlertTriangle,
    badgeClass: "bg-warning/10 text-warning",
    label: "Atenção",
  },
  info: {
    containerClass: "border-border bg-muted/30",
    iconClass: "text-muted-foreground",
    icon: Info,
    badgeClass: "bg-muted text-muted-foreground",
    label: "Info",
  },
} as const;

interface Props {
  alertas: Alerta[];
}

export function AlertasBanner({ alertas }: Props) {
  const [dispensados, setDispensados] = useState<Set<string>>(new Set());

  const visiveis = alertas.filter((a) => !dispensados.has(a.id));

  if (visiveis.length === 0) return null;

  const criticos = visiveis.filter((a) => a.severidade === "critico").length;
  const avisos = visiveis.filter((a) => a.severidade === "aviso").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {visiveis.length} alerta{visiveis.length !== 1 ? "s" : ""}
          {criticos > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger">
              {criticos} crítico{criticos !== 1 ? "s" : ""}
            </span>
          )}
          {avisos > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
              {avisos} atenção
            </span>
          )}
        </p>
        <button
          onClick={() => setDispensados(new Set(visiveis.map((a) => a.id)))}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Dispensar todos
        </button>
      </div>

      <div className="space-y-1.5">
        {visiveis.map((alerta) => {
          const config = SEVERIDADE_CONFIG[alerta.severidade];
          const Icon = config.icon;

          const conteudo = (
            <div
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${config.containerClass}`}
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${config.iconClass}`} />
              <p className="flex-1 text-sm text-foreground">{alerta.mensagem}</p>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDispensados((prev) => new Set([...prev, alerta.id]));
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dispensar alerta"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );

          if (alerta.href) {
            return (
              <Link key={alerta.id} href={alerta.href} className="block hover:opacity-90 transition-opacity">
                {conteudo}
              </Link>
            );
          }

          return <div key={alerta.id}>{conteudo}</div>;
        })}
      </div>
    </div>
  );
}
