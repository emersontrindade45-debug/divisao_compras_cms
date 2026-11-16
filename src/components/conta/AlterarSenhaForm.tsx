"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { alterarSenha, type AlterarSenhaState } from "@/lib/actions/conta";
import { SENHA_MIN_CARACTERES } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AlterarSenhaState = {};

const CAMPOS = [
  { name: "senhaAtual", label: "Senha atual", autoComplete: "current-password" },
  { name: "novaSenha", label: "Nova senha", autoComplete: "new-password" },
  { name: "confirmacao", label: "Repita a nova senha", autoComplete: "new-password" },
] as const;

export function AlterarSenhaForm() {
  const [state, formAction, pending] = useActionState(alterarSenha, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success("Senha alterada. Use a nova senha no próximo login.");
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="max-w-sm space-y-4">
      {CAMPOS.map((c) => (
        <div key={c.name} className="space-y-1">
          <label htmlFor={c.name} className="text-sm font-medium">
            {c.label}
          </label>
          <Input
            id={c.name}
            name={c.name}
            type="password"
            autoComplete={c.autoComplete}
            required
            minLength={c.name === "senhaAtual" ? undefined : SENHA_MIN_CARACTERES}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Mínimo de {SENHA_MIN_CARACTERES} caracteres.
      </p>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Senha alterada com sucesso.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
