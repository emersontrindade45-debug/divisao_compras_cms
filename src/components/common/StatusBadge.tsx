import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, type StatusDominio, type StatusVariant } from "@/lib/domain/status";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-success text-success-foreground border-transparent",
  warning: "bg-warning text-warning-foreground border-transparent",
  danger: "bg-danger text-danger-foreground border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({ status, className }: { status: StatusDominio; className?: string }) {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge className={cn(VARIANT_CLASSES[variant], className)}>{label}</Badge>;
}
