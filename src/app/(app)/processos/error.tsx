"use client";

import { SegmentError } from "@/components/common/SegmentError";

export default function ProcessosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError reset={reset} error={error} title="Erro ao carregar processos" />;
}
