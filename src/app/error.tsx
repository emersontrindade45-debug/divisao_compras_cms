"use client";

import { SegmentError } from "@/components/common/SegmentError";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center p-6">
        <SegmentError reset={reset} title="Erro inesperado na aplicação" />
      </body>
    </html>
  );
}
