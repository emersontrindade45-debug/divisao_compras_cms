"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SELECT_CLASS } from "@/components/common/selectClass";
import { cn } from "@/lib/utils";
import { atribuirResponsavel } from "@/lib/actions/processos";

export interface UsuarioOpcao {
  id: string;
  name: string;
}

/** Seletor nativo para dar dono a um processo direto do dashboard (M30.a). */
export function AtribuirResponsavelSelect({
  processoId,
  numero,
  usuarios,
}: {
  processoId: string;
  numero: string;
  usuarios: UsuarioOpcao[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(responsavelId: string) {
    if (!responsavelId) return;
    startTransition(async () => {
      const res = await atribuirResponsavel(processoId, responsavelId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Responsável do processo ${numero} atribuído.`);
      router.refresh();
    });
  }

  return (
    <select
      aria-label={`Atribuir responsável ao processo ${numero}`}
      className={cn(SELECT_CLASS, "w-40 text-xs")}
      defaultValue=""
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="" disabled>
        {pending ? "Salvando…" : "Atribuir a…"}
      </option>
      {usuarios.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
