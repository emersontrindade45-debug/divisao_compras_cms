import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, VARIANT_CLASSES, type StatusDominio } from "@/lib/domain/status";

function normalizeStatus(status: string): StatusDominio {
  // Prisma enum usa nao_aderente; domínio usa nao-aderente
  const normalized = status.replace(/_/g, "-") as StatusDominio;
  return normalized in STATUS_CONFIG ? normalized : "pendente";
}

export function StatusBadge({ status, className }: { status: StatusDominio | string; className?: string }) {
  const { label, variant } = STATUS_CONFIG[normalizeStatus(status)];
  return <Badge className={cn(VARIANT_CLASSES[variant], className)}>{label}</Badge>;
}
