import {
  MIN_FORNECEDORES_PESQUISA_DIRETA,
  validarFontePublica,
  validarMinFornecedores,
  validarRegistroNaoRespondentes,
  validarValidadeFontes,
} from "./in65Rules";
import { CV_ANALISE_CRITICA, CV_PRE_ALERTA, validarEvidenciasFontes } from "./priceStats";

/**
 * Agregador de conformidade IN 65/2021 por processo.
 *
 * Recebe um retrato plano do processo (sem tipos Prisma — domínio puro) e devolve:
 * - o estado das 4 etapas do fluxo (stepper do detalhe do processo);
 * - o checklist de conformidade (painel lateral);
 * - a etapa atual sugerida e se a suficiência da pesquisa foi atingida.
 *
 * Nunca reimplementa regra: delega a `in65Rules` e `priceStats` e traduz as
 * violações para itens de checklist.
 */

export type TipoFonteConformidade =
  | "contratacao_publica"
  | "site_eletronico"
  | "fornecedor_direto";

export interface ConformidadeInput {
  temItens: boolean;
  fontes: Array<{
    id: string;
    tipo: TipoFonteConformidade;
    status: "incluido" | "excluido";
    dataReferencia: Date;
    totalEvidencias: number;
  }>;
  /** Capturas de evidência de sites vinculadas ao processo. */
  capturas: number;
  /** Resultados de pesquisa por similaridade ainda não promovidos. */
  resultadosSimilaridade: number;
  cotacoes: Array<{
    id: string;
    status: "positiva" | "negativa" | "incompleta" | "silenciosa";
    temProposta: boolean;
    propostaStatus?: "valida" | "com_ressalva" | "invalida";
  }>;
  serie?: {
    precosIncluidos: number;
    valorEstimado: number;
    coeficienteVariacao: number;
  };
  /** Data de referência do cálculo de validade das fontes (default: agora). */
  dataReferencia?: Date;
}

export type EstadoEtapa =
  | "concluida"
  | "em_andamento"
  | "atencao"
  | "pendente"
  | "nao_aplicavel";

export type EtapaId = "estrategia" | "pesquisa" | "validacao" | "consolidacao";

export interface EtapaFluxo {
  id: EtapaId;
  numero: 1 | 2 | 3 | 4;
  titulo: string;
  estado: EstadoEtapa;
  resumo: string;
}

export type EstadoItemConformidade = "ok" | "atencao" | "bloqueio" | "nao_aplicavel";

export interface ItemConformidade {
  codigo: string;
  titulo: string;
  detalhe: string;
  estado: EstadoItemConformidade;
  etapaAlvo: EtapaId;
}

export interface ConformidadeProcesso {
  etapas: EtapaFluxo[];
  itens: ItemConformidade[];
  etapaAtual: EtapaId;
  suficienciaAtingida: boolean;
}

/** Suficiência da pesquisa (PRD): mínimo de fontes incluídas, com evidência, para avançar. */
export const MIN_FONTES_SUFICIENCIA = 3;

export function avaliarConformidade(input: ConformidadeInput): ConformidadeProcesso {
  const agora = input.dataReferencia ?? new Date();
  const fontesIncluidas = input.fontes.filter((f) => f.status === "incluido");
  const fontesComEvidencia = fontesIncluidas.filter((f) => f.totalEvidencias > 0);

  const temFontePublica = fontesIncluidas.some((f) => f.tipo === "contratacao_publica");
  const temPesquisaDireta =
    input.cotacoes.length > 0 ||
    fontesIncluidas.some((f) => f.tipo === "fornecedor_direto");

  const itens: ItemConformidade[] = [];

  // 1. Fonte pública prioritária (R-07 / OP-EXC-02)
  // Justificativa por processo ainda não é modelada — quando ausente, a violação R-07
  // aparece como "registrar justificativa", não como impedimento silencioso.
  const fontePublica = validarFontePublica(temFontePublica, undefined);
  itens.push({
    codigo: "R-07",
    titulo: "Fonte pública prioritária",
    detalhe: temFontePublica
      ? "Há contratação pública na série"
      : "Sem fonte pública — registrar justificativa nos autos",
    estado: fontePublica.valid ? "ok" : "atencao",
    etapaAlvo: "pesquisa",
  });

  // 2. Toda fonte com evidência (R-02)
  const evidencias = validarEvidenciasFontes(
    fontesIncluidas.map((f) => ({
      id: f.id,
      evidencias: Array.from({ length: f.totalEvidencias }, () => ({
        dataHoraAcesso: f.dataReferencia,
      })),
    })),
  );
  const semEvidencia = fontesIncluidas.length - fontesComEvidencia.length;
  itens.push({
    codigo: "R-02",
    titulo: "Fonte + data + evidência",
    detalhe:
      fontesIncluidas.length === 0
        ? "Nenhuma fonte registrada ainda"
        : evidencias.valid
          ? `${fontesComEvidencia.length} fonte(s) com evidência anexada`
          : `${semEvidencia} fonte(s) sem evidência anexada`,
    estado:
      fontesIncluidas.length === 0 ? "atencao" : evidencias.valid ? "ok" : "bloqueio",
    etapaAlvo: "pesquisa",
  });

  // 3. Validade temporal das fontes (OP-SLA-03/04/06)
  const validade = validarValidadeFontes(
    fontesIncluidas.map((f) => ({
      fonteId: f.id,
      tipo: f.tipo,
      dataReferencia: f.dataReferencia,
    })),
    agora,
  );
  const expiradas = validade.value.filter((v) => !v.valida).length;
  if (fontesIncluidas.length > 0) {
    itens.push({
      codigo: "OP-SLA",
      titulo: "Validade temporal das fontes",
      detalhe: validade.valid
        ? "Todas as fontes dentro da janela de validade"
        : `${expiradas} fonte(s) fora da janela de validade`,
      estado: validade.valid ? "ok" : "bloqueio",
      etapaAlvo: "pesquisa",
    });
  }

  // 4/5. Pesquisa direta: ≥3 fornecedores (R-03) + registro de não-respondentes (R-04)
  if (temPesquisaDireta) {
    const consultados = input.cotacoes.length;
    const minFornecedores = validarMinFornecedores(consultados, false);
    itens.push({
      codigo: "R-03",
      titulo: "Mínimo de 3 fornecedores consultados",
      detalhe: `${consultados} de ${MIN_FORNECEDORES_PESQUISA_DIRETA} fornecedores consultados`,
      estado: minFornecedores.valid ? "ok" : "atencao",
      etapaAlvo: "validacao",
    });

    const naoRespondentes = validarRegistroNaoRespondentes(
      input.cotacoes.map((c) => c.id),
      input.cotacoes.filter((c) => c.status !== "silenciosa").map((c) => c.id),
    );
    const silenciosas = naoRespondentes.value.naoResponderam.length;
    itens.push({
      codigo: "R-04",
      titulo: "Registro de não-respondentes",
      detalhe:
        silenciosas === 0
          ? "Todas as cotações têm resposta registrada"
          : `${silenciosas} fornecedor(es) sem resposta — manter registro formal`,
      estado: silenciosas === 0 ? "ok" : "atencao",
      etapaAlvo: "validacao",
    });
  } else {
    itens.push({
      codigo: "R-03",
      titulo: "Pesquisa direta com fornecedores",
      detalhe: "Não se aplica — sem pesquisa direta neste processo",
      estado: "nao_aplicavel",
      etapaAlvo: "validacao",
    });
  }

  // 6. Dispersão de preços (R-06, com pré-alerta)
  if (input.serie) {
    const cv = input.serie.coeficienteVariacao;
    const estadoCv: EstadoItemConformidade =
      cv > CV_ANALISE_CRITICA ? "atencao" : "ok";
    itens.push({
      codigo: "R-06",
      titulo: "Dispersão de preços (CV)",
      detalhe:
        cv > CV_ANALISE_CRITICA
          ? `CV de ${cv.toFixed(1)}% — análise crítica obrigatória`
          : cv > CV_PRE_ALERTA
            ? `CV de ${cv.toFixed(1)}% — próximo do limite de ${CV_ANALISE_CRITICA}%`
            : `CV de ${cv.toFixed(1)}% dentro do esperado`,
      estado: estadoCv,
      etapaAlvo: "consolidacao",
    });
  }

  // 7. Série consolidada com ≥3 preços (espelha OP-ADH-04)
  const serieConsolidada =
    input.serie !== undefined &&
    input.serie.precosIncluidos >= MIN_FONTES_SUFICIENCIA &&
    input.serie.valorEstimado > 0;
  itens.push({
    codigo: "OP-ADH-04",
    titulo: "Série de preços consolidada",
    detalhe: serieConsolidada
      ? `${input.serie!.precosIncluidos} preço(s) na série consolidada`
      : input.serie
        ? `Apenas ${input.serie.precosIncluidos} preço(s) — mínimo ${MIN_FONTES_SUFICIENCIA}`
        : "Série de preços ainda não consolidada",
    estado: serieConsolidada ? "ok" : "atencao",
    etapaAlvo: "consolidacao",
  });

  // ---- Etapas ----
  const suficienciaAtingida = fontesComEvidencia.length >= MIN_FONTES_SUFICIENCIA;
  const pesquisaIniciada =
    input.fontes.length > 0 || input.capturas > 0 || input.resultadosSimilaridade > 0;

  const estadoEstrategia: EstadoEtapa = input.temItens ? "concluida" : "pendente";

  const bloqueiosPesquisa = itens.some(
    (i) => i.etapaAlvo === "pesquisa" && i.estado === "bloqueio",
  );
  const estadoPesquisa: EstadoEtapa = !pesquisaIniciada
    ? "pendente"
    : bloqueiosPesquisa
      ? "atencao"
      : suficienciaAtingida
        ? "concluida"
        : "em_andamento";

  let estadoValidacao: EstadoEtapa;
  if (!temPesquisaDireta) {
    estadoValidacao = "nao_aplicavel";
  } else {
    const respondidas = input.cotacoes.filter((c) => c.status !== "silenciosa");
    const pendentes = respondidas.some(
      (c) => !c.temProposta || c.propostaStatus === "com_ressalva",
    );
    const todasAvaliadas =
      respondidas.length > 0 &&
      respondidas.every((c) => c.temProposta && c.propostaStatus !== undefined);
    estadoValidacao = pendentes
      ? "atencao"
      : todasAvaliadas
        ? "concluida"
        : "em_andamento";
  }

  const cvAlto =
    input.serie !== undefined && input.serie.coeficienteVariacao > CV_ANALISE_CRITICA;
  const estadoConsolidacao: EstadoEtapa = serieConsolidada
    ? cvAlto
      ? "atencao"
      : "concluida"
    : input.serie
      ? "em_andamento"
      : "pendente";

  const etapas: EtapaFluxo[] = [
    {
      id: "estrategia",
      numero: 1,
      titulo: "Estratégia",
      estado: estadoEstrategia,
      resumo: input.temItens ? "Objeto classificado" : "Cadastrar itens do objeto",
    },
    {
      id: "pesquisa",
      numero: 2,
      titulo: "Pesquisa de preços",
      estado: estadoPesquisa,
      resumo: suficienciaAtingida
        ? `Suficiência atingida (${fontesComEvidencia.length} fontes com evidência)`
        : `${fontesComEvidencia.length} de ${MIN_FONTES_SUFICIENCIA} fontes com evidência`,
    },
    {
      id: "validacao",
      numero: 3,
      titulo: "Validação",
      estado: estadoValidacao,
      resumo:
        estadoValidacao === "nao_aplicavel"
          ? "Sem pesquisa direta"
          : `${input.cotacoes.length} cotação(ões) registradas`,
    },
    {
      id: "consolidacao",
      numero: 4,
      titulo: "Consolidação",
      estado: estadoConsolidacao,
      resumo: serieConsolidada
        ? "Série consolidada"
        : "Consolidar série de preços",
    },
  ];

  // Etapa atual: primeira não concluída/não aplicável, na ordem do fluxo.
  const etapaAtual =
    etapas.find((e) => e.estado !== "concluida" && e.estado !== "nao_aplicavel")?.id ??
    "consolidacao";

  return { etapas, itens, etapaAtual, suficienciaAtingida };
}
