import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

function getScoreClassName(score: number): string {
  if (score >= 75) return "bg-success text-success-foreground border-transparent";
  if (score >= 50) return "bg-warning text-warning-foreground border-transparent";
  return "bg-danger text-danger-foreground border-transparent";
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  return (
    <Badge className={cn(getScoreClassName(score), className)}>
      {score} pontos
    </Badge>
  );
}
