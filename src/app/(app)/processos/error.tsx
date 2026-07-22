"use client";

import { SegmentError } from "@/components/common/SegmentError";

export default function ProcessosError({ reset }: { reset: () => void }) {
  return <SegmentError reset={reset} title="Erro ao carregar processos" />;
}
