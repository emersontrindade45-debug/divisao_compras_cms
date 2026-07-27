import * as React from "react";

import { cn } from "@/lib/utils";

// Escrito à mão, no molde de `input.tsx`.
//
// A Base UI (a lib de primitivos deste projeto) não expõe um primitivo de
// textarea — `@base-ui/react/input` é só para `<input>`. Gerar pelo CLI do
// shadcn instalaria a variante do Radix e mexeria no `package.json`, o que exige
// autorização (CLAUDE.md §8). O `<textarea>` nativo já é acessível; só faltam os
// tokens de estilo, copiados de `Input` para os dois campos ficarem idênticos.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
