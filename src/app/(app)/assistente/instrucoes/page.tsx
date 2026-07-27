import { PageHeader } from "@/components/common/PageHeader";
import { InstrucoesPesquisaForm } from "@/components/assistente/InstrucoesPesquisaForm";
import { listarInstrucoes } from "@/lib/actions/instrucoesPesquisa";
import { hasPermission, requireAuth } from "@/lib/auth/rbac";

export const metadata = {
  title: "Instruções de pesquisa",
};

/**
 * Painel das instruções que o assistente segue ao buscar e ao pontuar
 * similaridade.
 *
 * Os três níveis são cumulativos, do mais geral para o mais específico —
 * `montarInstrucoesPesquisa` os concatena nessa ordem, e o modelo dá mais peso
 * ao que lê por último. Instruções de processo são editadas no próprio processo;
 * aqui elas aparecem só para leitura, para o servidor enxergar o conjunto.
 */
export default async function InstrucoesPesquisaPage() {
  const user = await requireAuth();
  const instrucoes = await listarInstrucoes();
  const podeEditar = hasPermission(user.role, "revisao");

  const global = instrucoes.find((i) => i.escopo === "global");
  const porCategoria = instrucoes.filter((i) => i.escopo === "categoria");
  const porProcesso = instrucoes.filter((i) => i.escopo === "processo");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instruções de pesquisa"
        description="Regras que o assistente segue ao escolher termos de busca e ao avaliar similaridade. Valem do nível mais geral para o mais específico — em conflito, vence a regra mais próxima do caso."
      />

      <InstrucoesPesquisaForm
        escopo="global"
        titulo="Regras gerais"
        descricao="Valem para todos os objetos, em todos os processos."
        conteudoInicial={global?.conteudo ?? ""}
        versao={global?.versao}
        podeEditar={podeEditar}
      />

      {porCategoria.map((instrucao) => (
        <InstrucoesPesquisaForm
          key={instrucao.id}
          escopo="categoria"
          titulo={`Categoria: ${instrucao.categoria ?? "(sem nome)"}`}
          descricao="Aplicada quando a categoria aparece no objeto do processo, na descrição dos itens ou nas palavras-chave."
          categoriaInicial={instrucao.categoria ?? ""}
          conteudoInicial={instrucao.conteudo}
          versao={instrucao.versao}
          podeEditar={podeEditar}
        />
      ))}

      <InstrucoesPesquisaForm
        escopo="categoria"
        titulo="Nova regra de categoria"
        descricao="Crie uma regra para um tipo de objeto recorrente (mobiliário, informática, gêneros alimentícios)."
        podeEditar={podeEditar}
      />

      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-medium">Regras específicas de processo</h2>
        {porProcesso.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ainda. Elas são escritas dentro do processo, pelo assistente aberto ali.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {porProcesso.map((instrucao) => (
              <li key={instrucao.id} className="rounded-lg border px-3 py-2">
                <p className="font-medium tabular-nums">
                  {instrucao.processo?.numero ?? instrucao.processoId}
                  {!instrucao.ativo && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      desativada
                    </span>
                  )}
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">{instrucao.conteudo}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
