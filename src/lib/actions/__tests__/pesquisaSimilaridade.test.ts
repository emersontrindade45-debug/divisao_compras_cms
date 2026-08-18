import { beforeEach, describe, expect, it, vi } from "vitest";

// Confirma que os metadados de fonte de tabela de referência oficial (SINAPI
// — competência/regime/localidade, ver `MetadadosPrecoReferencia` em
// src/lib/ia/types.ts) chegam ao `createMany` de `ResultadoSimilaridade`,
// não só ao `CandidatoSimilaridade` em memória. Sem isso, o dado existiria no
// provedor mas nunca alcançaria o banco (nem, por consequência, a UI).

const mocks = vi.hoisted(() => ({
  db: {
    item: { findMany: vi.fn() },
    processo: { update: vi.fn() },
    resultadoSimilaridade: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  registrarAuditoria: vi.fn(),
  getProvedorIA: vi.fn(),
  rankearCandidatos: vi.fn(),
  buscarCandidatosPublicos: vi.fn(),
  filtrarPorPalavrasChave: vi.fn(),
  resolverTermoBusca: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/rbac", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/auth/audit", () => ({ registrarAuditoria: mocks.registrarAuditoria }));
vi.mock("@/lib/ia", () => ({ getProvedorIA: mocks.getProvedorIA }));
vi.mock("@/lib/similaridade/rankearCandidatos", () => ({
  rankearCandidatos: mocks.rankearCandidatos,
}));
vi.mock("@/lib/similaridade/buscarCandidatosPublicos", () => ({
  buscarCandidatosPublicos: mocks.buscarCandidatosPublicos,
}));
vi.mock("@/lib/similaridade/filtroPalavrasChave", () => ({
  filtrarPorPalavrasChave: mocks.filtrarPorPalavrasChave,
}));
vi.mock("@/lib/similaridade/extrairTermoBusca", () => ({
  resolverTermoBusca: mocks.resolverTermoBusca,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { processarPesquisaSimilaridade } from "../pesquisaSimilaridade";

const USER = { id: "user-1", role: "pesquisa", email: "u@e.com" };

function trFile(): FormData {
  const fd = new FormData();
  fd.set("trPdf", new File([new Uint8Array([1, 2, 3])], "tr.pdf", { type: "application/pdf" }));
  return fd;
}

describe("processarPesquisaSimilaridade — metadados de preço de referência (SINAPI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.db.item.findMany.mockResolvedValue([
      { id: "item-1", descricao: "Assentamento de tubo", caracteristicasTecnicas: "", unidade: "M", quantidade: 10, natureza: null, palavrasChave: [], processoId: "proc-1" },
    ]);
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue(null);
    mocks.db.resultadoSimilaridade.deleteMany.mockResolvedValue({ count: 0 });
    mocks.db.resultadoSimilaridade.createMany.mockResolvedValue({ count: 1 });
    mocks.db.processo.update.mockResolvedValue({});
    mocks.getProvedorIA.mockReturnValue({
      extrairEspecificacaoTR: vi.fn().mockResolvedValue([]),
      extrairContextoTR: vi.fn().mockResolvedValue({ tabelaItens: "", modeloExecucao: "", materiaisEquipamentos: "" }),
      rankearSimilaridade: vi.fn(),
    });
    mocks.buscarCandidatosPublicos.mockResolvedValue([]);
    mocks.filtrarPorPalavrasChave.mockReturnValue([]);
    mocks.resolverTermoBusca.mockReturnValue("assentamento de tubo");
  });

  it("grava competenciaReferencia/regimeReferencia/localidadeReferencia quando o candidato os traz", async () => {
    mocks.rankearCandidatos.mockResolvedValue([
      {
        candidato: {
          tipoCandidato: "preco_referencia",
          fonteDescricao: "Composição SINAPI 97141",
          fonteOrgaoOuId: "SINAPI (Caixa Econômica Federal)",
          fonteUrl: "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
          valorUnitario: 5.4,
          dataReferencia: new Date("2024-12-01"),
          unidade: "M",
          quantidade: 1,
          metadadosPrecoReferencia: {
            competencia: "2024-12",
            regime: "nao_desonerado",
            localidade: "SAO PAULO",
          },
        },
        scoreFinal: 90,
        scoreDescricao: 90,
        scoreEspecificacao: 90,
        scoreUnidadeQuantidade: 90,
        adaptado: false,
        justificativa: "match direto",
      },
    ]);

    await processarPesquisaSimilaridade("proc-1", trFile());

    expect(mocks.db.resultadoSimilaridade.createMany).toHaveBeenCalledTimes(1);
    const gravado = mocks.db.resultadoSimilaridade.createMany.mock.calls[0]![0].data;
    expect(gravado).toHaveLength(1);
    expect(gravado[0]).toMatchObject({
      competenciaReferencia: "2024-12",
      regimeReferencia: "nao_desonerado",
      localidadeReferencia: "SAO PAULO",
    });
  });

  it("grava null nos três campos quando o candidato não é de preco_referencia (ex.: contratação pública)", async () => {
    mocks.rankearCandidatos.mockResolvedValue([
      {
        candidato: {
          tipoCandidato: "contratacao_publica",
          fonteDescricao: "Contrato X",
          fonteOrgaoOuId: "Órgão Y",
          fonteUrl: "https://pncp.gov.br/x",
          valorUnitario: 10,
          dataReferencia: new Date("2024-06-01"),
          unidade: "UN",
          quantidade: 1,
        },
        scoreFinal: 85,
        scoreDescricao: 85,
        scoreEspecificacao: 85,
        scoreUnidadeQuantidade: 85,
        adaptado: false,
        justificativa: "match direto",
      },
    ]);

    await processarPesquisaSimilaridade("proc-1", trFile());

    const gravado = mocks.db.resultadoSimilaridade.createMany.mock.calls[0]![0].data;
    expect(gravado[0]).toMatchObject({
      competenciaReferencia: null,
      regimeReferencia: null,
      localidadeReferencia: null,
    });
  });
});

// Orçamento de tempo do laço de itens (ORCAMENTO_TEMPO_ITENS_MS em
// pesquisaSimilaridade.ts) — sem ele, um processo com muitos itens/TR grande
// estourava o `maxDuration = 60` da rota e a Vercel matava a função sem
// resposta estruturada (504 no processo 908/2022, ver CLAUDE.md §9.64).
describe("processarPesquisaSimilaridade — orçamento de tempo do laço de itens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER);
    mocks.db.item.findMany.mockResolvedValue([
      { id: "item-1", descricao: "Item dentro do orçamento", caracteristicasTecnicas: "", unidade: "UN", quantidade: 1, natureza: null, palavrasChave: [], processoId: "proc-1" },
      { id: "item-2", descricao: "Item fora do orçamento", caracteristicasTecnicas: "", unidade: "UN", quantidade: 1, natureza: null, palavrasChave: [], processoId: "proc-1" },
    ]);
    mocks.db.resultadoSimilaridade.findFirst.mockResolvedValue(null);
    mocks.db.resultadoSimilaridade.deleteMany.mockResolvedValue({ count: 0 });
    mocks.db.resultadoSimilaridade.createMany.mockResolvedValue({ count: 1 });
    mocks.db.processo.update.mockResolvedValue({});
    mocks.getProvedorIA.mockReturnValue({
      extrairEspecificacaoTR: vi.fn().mockResolvedValue([]),
      extrairContextoTR: vi.fn().mockResolvedValue({ tabelaItens: "", modeloExecucao: "", materiaisEquipamentos: "" }),
      rankearSimilaridade: vi.fn(),
    });
    mocks.buscarCandidatosPublicos.mockResolvedValue([]);
    mocks.filtrarPorPalavrasChave.mockReturnValue([]);
    mocks.resolverTermoBusca.mockReturnValue("termo");
    mocks.rankearCandidatos.mockResolvedValue([]);
  });

  it("processa item dentro do orçamento e ignora, sem nenhuma chamada de rede/banco, o item que estourou o tempo", async () => {
    // Relógio determinístico: chamada 1 = início do laço (t=0); a checagem de
    // cada item roda de forma síncrona antes do primeiro `await` da tarefa
    // (`processarComConcorrencia` cria os workers em sequência), então a
    // ordem das chamadas segue a ordem dos itens.
    const tempos = [0, 5_000, 35_000];
    let chamada = 0;
    const agoraFake = () => tempos[Math.min(chamada++, tempos.length - 1)];

    const resultado = await processarPesquisaSimilaridade("proc-1", trFile(), { agora: agoraFake });

    const itens = resultado.data?.itensProcessados ?? [];
    const item1 = itens.find((i) => i.itemId === "item-1");
    const item2 = itens.find((i) => i.itemId === "item-2");

    expect(item1?.status).toBe("sucesso");
    expect(item2).toMatchObject({
      status: "ignorado",
      erro: "Tempo de processamento esgotado neste turno. Rode a pesquisa novamente para processar os itens restantes.",
    });

    // A prova de que o item fora do orçamento não fez NENHUM trabalho (não só
    // que foi rotulado como ignorado): se a checagem fosse removida, esta
    // asserção cairia porque findFirst seria chamado 2x, não 1x.
    expect(mocks.db.resultadoSimilaridade.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.buscarCandidatosPublicos).toHaveBeenCalledTimes(1);
    expect(mocks.rankearCandidatos).toHaveBeenCalledTimes(1);
  });
});
