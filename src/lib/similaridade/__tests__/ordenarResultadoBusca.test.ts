import { describe, it, expect } from "vitest";
import { ordenarResultadoBusca } from "../ordenarResultadoBusca";
import type { CandidatoSimilaridade } from "@/lib/ia/types";

function candidato(
  fonteDescricao: string,
  dataReferencia: Date = new Date(),
): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao,
    fonteOrgaoOuId: "Órgão Teste",
    valorUnitario: 100,
    dataReferencia,
    unidade: "unidade",
    quantidade: 1,
  };
}

function diasAtras(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

describe("ordenarResultadoBusca", () => {
  it("põe o candidato MAIS aderente à frente, mesmo chegando por último", () => {
    // Reproduz o defeito real medido em produção: a busca por link dedicado
    // devolvia switch/impressora nas primeiras posições porque o edital deles
    // chegou antes na relevância do PNCP.
    //
    // Todos os candidatos aqui casam ao menos um token do termo, de propósito:
    // sem isso o teste passaria pelo FILTRO de aderência e não provaria nada
    // sobre a ORDENAÇÃO — foi o que a mutação (remover o `.sort`) revelou.
    const candidatos = [
      candidato("SWITCH DE 24 PORTAS POE COM SUPORTE A FIBRA ÓPTICA — 900 W"),
      candidato("PATCH PANEL 24 PORTAS PARA FIBRA"),
      candidato("Serviço de link de internet dedicado via fibra óptica 900 Mbps"),
    ];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado fibra 900 mbps");

    expect(resultado.map((c) => c.fonteDescricao)).toEqual([
      "Serviço de link de internet dedicado via fibra óptica 900 Mbps",
      "SWITCH DE 24 PORTAS POE COM SUPORTE A FIBRA ÓPTICA — 900 W",
      "PATCH PANEL 24 PORTAS PARA FIBRA",
    ]);
  });

  it("descarta candidato que não casa nenhum token do termo", () => {
    const candidatos = [
      candidato("IMPRESSORA LASER MONOCROMÁTICA"),
      candidato("Link dedicado de internet 300 Mbps"),
    ];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado internet");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.fonteDescricao).toBe("Link dedicado de internet 300 Mbps");
  });

  it("mantém os não-aderentes quando não há aderentes suficientes para o corte", () => {
    // Sem esta salvaguarda, termo cujo vocabulário difere do da fonte
    // devolveria tela vazia — pior que devolver material fraco para o analista
    // julgar.
    const candidatos = [candidato("Grampeador de mesa"), candidato("Régua de 30 cm")];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado", {
      minimoExibido: 5,
    });

    expect(resultado).toHaveLength(2);
  });

  it("remove candidato fora da janela de recência antes de ordenar", () => {
    const candidatos = [
      candidato("Link dedicado de internet 900 Mbps", diasAtras(2000)),
      candidato("Link dedicado de internet 300 Mbps", diasAtras(30)),
    ];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado internet");

    expect(resultado).toHaveLength(1);
    expect(resultado[0]!.fonteDescricao).toBe("Link dedicado de internet 300 Mbps");
  });

  it("devolve os vencidos quando a recência zeraria o resultado", () => {
    const candidatos = [candidato("Link dedicado de internet", diasAtras(2000))];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado internet");

    expect(resultado).toHaveLength(1);
  });

  it("preserva a ordem de chegada entre candidatos de mesma aderência", () => {
    // A ordem de chegada é a relevância de edital do PNCP — o único sinal
    // disponível para desempatar.
    const candidatos = [
      candidato("Link dedicado A"),
      candidato("Link dedicado B"),
      candidato("Link dedicado C"),
    ];

    const resultado = ordenarResultadoBusca(candidatos, "link dedicado");

    expect(resultado.map((c) => c.fonteDescricao)).toEqual([
      "Link dedicado A",
      "Link dedicado B",
      "Link dedicado C",
    ]);
  });

  it("devolve o conjunto intacto quando o termo não tem token utilizável", () => {
    const candidatos = [candidato("Qualquer coisa"), candidato("Outra coisa")];

    const resultado = ordenarResultadoBusca(candidatos, "de a");

    expect(resultado).toEqual(candidatos);
  });

  it("devolve vazio para entrada vazia", () => {
    expect(ordenarResultadoBusca([], "link dedicado")).toEqual([]);
  });
});
