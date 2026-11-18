import { describe, expect, it } from "vitest";
import { avaliarCriterioIa, type EntradaCriterio } from "../criterioIa";

/** Entrada que passa em tudo; cada teste estraga UMA coisa para provar que ela sozinha reprova. */
function base(over: Partial<EntradaCriterio> = {}): EntradaCriterio {
  return {
    primeira: { classe: "recusa", confianca: "alta", evidenciaOk: true },
    segunda: { classe: "recusa", evidenciaOk: true },
    anexosPdf: 0,
    evidenciaDizEnvio: false,
    motivoFila: "sinais_ambiguos",
    contemRecusa: false,
    ...over,
  };
}

describe("avaliarCriterioIa", () => {
  it("aprova quando as duas leituras concordam, citam trecho real e nada contradiz", () => {
    expect(avaliarCriterioIa(base())).toEqual({ ok: true, razao: "ok" });
  });

  it("sem segunda leitura (prazo, falha de rede) não aprova", () => {
    expect(avaliarCriterioIa(base({ segunda: undefined }))).toEqual({ ok: false, razao: "sem_revisao" });
  });

  it("revisor com outra classe não aprova", () => {
    const r = avaliarCriterioIa(base({ segunda: { classe: "duvida", evidenciaOk: true } }));
    expect(r).toEqual({ ok: false, razao: "revisor_discorda" });
  });

  it("confiança baixa não aprova, mesmo com tudo o mais em ordem", () => {
    const r = avaliarCriterioIa(base({ primeira: { classe: "recusa", confianca: "baixa", evidenciaOk: true } }));
    expect(r).toEqual({ ok: false, razao: "baixa_confianca" });
  });

  it("a confiança ALTA sozinha não aprova: sem a segunda leitura, nada passa", () => {
    const r = avaliarCriterioIa(base({ segunda: undefined, primeira: { classe: "recusa", confianca: "alta", evidenciaOk: true } }));
    expect(r.ok).toBe(false);
  });

  it.each([
    ["a primeira leitura", { primeira: { classe: "recusa", confianca: "alta", evidenciaOk: false } }],
    ["a segunda leitura", { segunda: { classe: "recusa", evidenciaOk: false } }],
  ] as const)("trecho citado que não existe no texto (%s) não aprova", (_n, over) => {
    expect(avaliarCriterioIa(base(over as Partial<EntradaCriterio>))).toEqual({ ok: false, razao: "sem_evidencia" });
  });

  it.each([
    ["provavel_recusa", "duvida"],
    ["provavel_recusa", "nao_e_resposta"], // o caso 8 do analista: a regra estava certa
    ["provavel_duvida", "recusa"],
    ["provavel_orcamento", "nao_e_resposta"],
  ] as const)("regra %s e IA %s divergem: vai ao analista", (motivoFila, classe) => {
    const r = avaliarCriterioIa(
      base({
        motivoFila,
        primeira: { classe, confianca: "alta", evidenciaOk: true },
        segunda: { classe, evidenciaOk: true },
        anexosPdf: 1,
      }),
    );
    expect(r).toEqual({ ok: false, razao: "regra_discorda" });
  });

  it.each([
    ["provavel_recusa", "recusa"],
    ["provavel_duvida", "duvida"],
  ] as const)("regra %s e IA %s concordam: aprova", (motivoFila, classe) => {
    const r = avaliarCriterioIa(
      base({ motivoFila, primeira: { classe, confianca: "alta", evidenciaOk: true }, segunda: { classe, evidenciaOk: true } }),
    );
    expect(r.ok).toBe(true);
  });

  it("motivo sem sugestão da regra (sinais ambíguos, remetente desconhecido) não restringe a IA", () => {
    for (const motivoFila of ["sinais_ambiguos", "remetente_desconhecido", "dominio_generico"]) {
      expect(avaliarCriterioIa(base({ motivoFila, primeira: { classe: "duvida", confianca: "alta", evidenciaOk: true }, segunda: { classe: "duvida", evidenciaOk: true } })).ok).toBe(true);
    }
  });

  it("frase fixa de recusa no texto e IA dizendo outra coisa: vai ao analista", () => {
    const r = avaliarCriterioIa(
      base({ contemRecusa: true, primeira: { classe: "duvida", confianca: "alta", evidenciaOk: true }, segunda: { classe: "duvida", evidenciaOk: true } }),
    );
    expect(r).toEqual({ ok: false, razao: "frase_de_recusa_conflita" });
  });

  describe("orçamento (definição do usuário: texto que ENVIA ou anexo em PDF)", () => {
    const orc = { primeira: { classe: "orcamento", confianca: "alta", evidenciaOk: true }, segunda: { classe: "orcamento", evidenciaOk: true } } as const;

    it("sem PDF e sem o texto dizer que envia: não aprova", () => {
      expect(avaliarCriterioIa(base({ ...orc }))).toEqual({ ok: false, razao: "orcamento_sem_prova" });
    });
    it("com PDF anexado: aprova", () => {
      expect(avaliarCriterioIa(base({ ...orc, anexosPdf: 1 })).ok).toBe(true);
    });
    it("sem PDF, mas o trecho citado diz que está enviando: aprova", () => {
      expect(avaliarCriterioIa(base({ ...orc, evidenciaDizEnvio: true })).ok).toBe(true);
    });
  });

  it("não é resposta também precisa do critério completo (dispensar da fila é decisão)", () => {
    const nr = { primeira: { classe: "nao_e_resposta", confianca: "alta", evidenciaOk: true }, segunda: { classe: "nao_e_resposta", evidenciaOk: true } } as const;
    expect(avaliarCriterioIa(base({ ...nr })).ok).toBe(true);
    expect(avaliarCriterioIa(base({ ...nr, segunda: undefined })).ok).toBe(false);
  });
});
