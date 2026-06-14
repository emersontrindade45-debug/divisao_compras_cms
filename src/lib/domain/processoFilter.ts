import type { ProcessoFixture } from "@/lib/fixtures/processos";
import type { StatusDominio } from "@/lib/domain/status";

export interface FiltrosProcesso {
  busca: string;
  status: StatusDominio | "todos";
  responsavel: string;
  dataInicio: string;
  dataFim: string;
}

export function filtrarProcessos(
  processos: ProcessoFixture[],
  filtros: FiltrosProcesso,
): ProcessoFixture[] {
  const busca = filtros.busca.trim().toLowerCase();

  return processos.filter((p) => {
    if (busca) {
      const alvo = `${p.objeto} ${p.numero}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    if (filtros.status !== "todos" && p.status !== filtros.status) return false;
    if (filtros.responsavel !== "todos" && p.responsavel !== filtros.responsavel) return false;
    if (filtros.dataInicio && p.dataAbertura < filtros.dataInicio) return false;
    if (filtros.dataFim && p.dataAbertura > filtros.dataFim) return false;
    return true;
  });
}
