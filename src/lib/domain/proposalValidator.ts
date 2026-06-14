import type { DomainResult, Violation } from "./types";

type ItemChecklist = {
  campo: string;
  status: "valido" | "ressalva" | "invalido";
  motivo?: string;
};

type ResultadoValidacao = {
  itens: ItemChecklist[];
  statusGeral: "valida" | "com_ressalva" | "invalida";
};

const VALIDADE_PROPOSTA_DIAS = 180;

export function validarProposta(
  proposta: {
    cnpj?: string;
    descricaoObjeto?: string;
    valorUnitario?: number;
    valorTotal?: number;
    dataEmissao?: Date;
    nomeResponsavel?: string;
  },
  dataReferenciaCalculo: Date,
): DomainResult<ResultadoValidacao> {
  const violations: Violation[] = [];
  const itens: ItemChecklist[] = [];

  function campoObrigatorio(campo: string, valor: unknown): ItemChecklist {
    if (valor == null || (typeof valor === "string" && valor.trim() === "")) {
      violations.push({
        code: "R-05",
        rule: `Campo obrigatório ausente na proposta: ${campo}`,
        severity: "block",
      });
      return { campo, status: "invalido", motivo: "Campo obrigatório ausente" };
    }
    return { campo, status: "valido" };
  }

  itens.push(campoObrigatorio("cnpj", proposta.cnpj));
  itens.push(campoObrigatorio("descricaoObjeto", proposta.descricaoObjeto));
  itens.push(campoObrigatorio("valorUnitario", proposta.valorUnitario));
  itens.push(campoObrigatorio("valorTotal", proposta.valorTotal));
  itens.push(campoObrigatorio("nomeResponsavel", proposta.nomeResponsavel));

  if (proposta.dataEmissao == null) {
    violations.push({
      code: "R-05",
      rule: "Campo obrigatório ausente na proposta: dataEmissao",
      severity: "block",
    });
    itens.push({ campo: "dataEmissao", status: "invalido", motivo: "Campo obrigatório ausente" });
  } else {
    const diffMs = dataReferenciaCalculo.getTime() - proposta.dataEmissao.getTime();
    const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diasDecorridos > VALIDADE_PROPOSTA_DIAS) {
      violations.push({
        code: "OP-SLA-03",
        rule: "Proposta com data de emissão superior a 180 dias — validade expirada",
        severity: "warn",
      });
      itens.push({
        campo: "dataEmissao",
        status: "ressalva",
        motivo: `Proposta emitida há ${diasDecorridos} dias (limite: ${VALIDADE_PROPOSTA_DIAS} dias)`,
      });
    } else {
      itens.push({ campo: "dataEmissao", status: "valido" });
    }
  }

  const temInvalido = itens.some((i) => i.status === "invalido");
  const temRessalva = itens.some((i) => i.status === "ressalva");
  const statusGeral: "valida" | "com_ressalva" | "invalida" = temInvalido
    ? "invalida"
    : temRessalva
      ? "com_ressalva"
      : "valida";

  return {
    value: { itens, statusGeral },
    valid: violations.every((v) => v.severity !== "block"),
    violations,
  };
}
