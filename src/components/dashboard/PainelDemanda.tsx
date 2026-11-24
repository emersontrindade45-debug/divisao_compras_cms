import { PainelDemandaInterativo } from "@/components/dashboard/PainelDemandaInterativo";
import { BotaoImprimir } from "@/components/dashboard/BotaoImprimir";
import { FiltrosPainelDemanda } from "@/components/dashboard/FiltrosPainelDemanda";
import { dataBr, rotuloDaCategoria } from "@/lib/domain/indicadores/formatosPainel";
import type { CategoriaProcesso } from "@/lib/domain/indicadores/painelDemanda";
import type { ResultadoPainelDemanda } from "@/lib/indicadores/painelDemanda";
import type { ResultadoFornecedores } from "@/lib/indicadores/fornecedores";
import { resumirFornecedores } from "@/lib/domain/indicadores/fornecedoresLevantamento";
import type { FornecedoresNoPainel } from "@/components/dashboard/FornecedoresDemanda";

/** Traduz o que foi lido da planilha do Levantamento para o ano do painel. */
export function fornecedoresDoAno(f: ResultadoFornecedores, ano: number): FornecedoresNoPainel {
  if (f.estado !== "ok") return f;
  const resumo = resumirFornecedores(f.meses, ano);
  return resumo ? { estado: "ok", resumo, inconsistentes: f.inconsistentes } : { estado: "sem_dados", ano };
}

const numero = (n: number) => n.toLocaleString("pt-BR");

/**
 * Painel "Demanda da Divisão" (M30.e, redesenho): onde a Divisão perde tempo. Lê as remessas de todos os anos
 * (`carregarPainelDemanda`), então cada falha tem a sua frase — "não configurada", "indisponível" (com o motivo) —
 * e nenhuma mostra zero como se fosse fato. Quando a leitura cai na reserva (sem comparativo), a tela avisa.
 */
export function PainelDemandaDivisao({
  resultado,
  fornecedores = { estado: "nao_configurada" },
}: {
  resultado: ResultadoPainelDemanda;
  fornecedores?: ResultadoFornecedores;
}) {
  if (resultado.estado === "nao_configurada") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        A planilha de demanda ainda não foi configurada neste ambiente.
      </p>
    );
  }
  if (resultado.estado === "indisponivel") {
    return (
      <p
        role="status"
        className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
      >
        Não foi possível carregar a demanda da Divisão agora. {resultado.motivo}
      </p>
    );
  }

  const { painel, anos, aviso, descartadas, duplicadas, noSistema, fonte } = resultado;
  const categoria: CategoriaProcesso | null = painel.categoria;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {painel.parcial
            ? `De 1º de janeiro a ${dataBr(painel.hoje).slice(0, 5)}, comparado ao mesmo período de ${painel.ano - 1}.`
            : `Ano de ${painel.ano} inteiro, comparado a ${painel.ano - 1} inteiro.`}
          {categoria ? ` Só ${rotuloDaCategoria(categoria)}.` : ""}
        </p>
        <div className="flex items-center gap-2 print:hidden">
          <FiltrosPainelDemanda anos={anos} ano={painel.ano} categoria={categoria} />
          <BotaoImprimir />
        </div>
      </div>

      {aviso && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      {painel.atual.remessas === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma remessa em {painel.ano}
          {categoria ? ` para ${rotuloDaCategoria(categoria)}` : ""}.
        </p>
      ) : (
        <PainelDemandaInterativo
          painel={painel}
          noSistema={noSistema}
          fornecedores={fornecedoresDoAno(fornecedores, painel.ano)}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Última remessa em {dataBr(painel.hoje)}. Planilha atualizada de hora em hora; leitura{" "}
        {fonte === "api" ? "pela conta de serviço do Google" : "pelo link público (reserva)"},
        guardada por 1 hora.
        {descartadas > 0 &&
          ` ${numero(descartadas)} linha(s) ignorada(s) por formato não reconhecido.`}
        {duplicadas > 0 && ` ${numero(duplicadas)} remessa(s) repetida(s) contada(s) uma vez.`}
      </p>
    </div>
  );
}
