import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("../openaiClient", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }),
  OPENAI_MODEL: "gpt-4o-mini",
}));

import { sugerirCnaesParaObjeto, type ClasseCnae } from "../sugerirCnaesParaObjeto";

const CLASSES: ClasseCnae[] = [
  { classe: "4649408", descricao: "Comércio atacadista de produtos de higiene, limpeza e conservação" },
  { classe: "4789005", descricao: "Comércio varejista de produtos saneantes domissanitários" },
  { classe: "8121400", descricao: "Limpeza em prédios e em domicílios" },
  // Duas subclasses da MESMA classe 47610, com descrições diferentes: é o caso que motivou usar 7
  // dígitos em vez de 5 (agrupar por classe escondia a papelaria atrás de "livros").
  { classe: "4761001", descricao: "Comércio varejista de livros" },
  { classe: "4761003", descricao: "Comércio varejista de artigos de papelaria" },
];

function mockResposta(cnaes: unknown[]) {
  mocks.create.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ cnaes }) } }],
  });
}

describe("sugerirCnaesParaObjeto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna [] sem chamar a IA quando o objeto está vazio", async () => {
    expect(await sugerirCnaesParaObjeto("   ", CLASSES)).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retorna [] sem chamar a IA quando não há classes disponíveis", async () => {
    expect(await sugerirCnaesParaObjeto("material de limpeza", [])).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retorna as classes sugeridas que existem no catálogo", async () => {
    mockResposta(["4649408", "4789005"]);

    expect(await sugerirCnaesParaObjeto("material de limpeza", CLASSES)).toEqual(["4649408", "4789005"]);
  });

  it("descarta código inventado que não está no catálogo (anti-alucinação, §9.12)", async () => {
    mockResposta(["4649408", "9999999"]);

    expect(await sugerirCnaesParaObjeto("material de limpeza", CLASSES)).toEqual(["4649408"]);
  });

  it("normaliza código com pontuação para os 7 dígitos da subclasse", async () => {
    mockResposta(["46.49-4/08"]);

    expect(await sugerirCnaesParaObjeto("material de limpeza", CLASSES)).toEqual(["4649408"]);
  });

  it("deduplica quando o modelo repete a mesma subclasse em formatos diferentes", async () => {
    mockResposta(["4649408", "46.49-4/08"]);

    expect(await sugerirCnaesParaObjeto("material de limpeza", CLASSES)).toEqual(["4649408"]);
  });

  it("distingue subclasses da mesma classe (papelaria não vira livraria)", async () => {
    mockResposta(["4761003"]);

    expect(await sugerirCnaesParaObjeto("caneta esferográfica", CLASSES)).toEqual(["4761003"]);
  });

  it("envia o catálogo completo no prompt, para a IA só escolher entre códigos reais", async () => {
    mockResposta([]);
    await sugerirCnaesParaObjeto("material de limpeza", CLASSES);

    const prompt = mocks.create.mock.calls[0][0].messages[0].content as string;
    for (const c of CLASSES) {
      expect(prompt).toContain(c.classe);
      expect(prompt).toContain(c.descricao);
    }
    expect(prompt).toContain("material de limpeza");
  });

  it("usa temperature 0 para a mesma entrada render a mesma lista", async () => {
    mockResposta([]);
    await sugerirCnaesParaObjeto("material de limpeza", CLASSES);

    expect(mocks.create.mock.calls[0][0].temperature).toBe(0);
  });

  it("divide catálogo grande em lotes, uma chamada por lote", async () => {
    const grande: ClasseCnae[] = Array.from({ length: 450 }, (_, i) => ({
      classe: String(1000000 + i),
      descricao: `Atividade ${i}`,
    }));
    mocks.create.mockResolvedValue({ choices: [{ message: { content: '{"cnaes":[]}' } }] });

    await sugerirCnaesParaObjeto("objeto qualquer", grande);

    // 450 subclasses / 200 por lote = 3 lotes.
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });

  it("une os achados de lotes diferentes", async () => {
    const grande: ClasseCnae[] = Array.from({ length: 400 }, (_, i) => ({
      classe: String(1000000 + i),
      descricao: `Atividade ${i}`,
    }));
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cnaes":["1000001"]}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cnaes":["1000201"]}' } }] });

    expect(await sugerirCnaesParaObjeto("objeto", grande)).toEqual(["1000001", "1000201"]);
  });

  it("um lote que falha não derruba a sugestão inteira", async () => {
    const grande: ClasseCnae[] = Array.from({ length: 400 }, (_, i) => ({
      classe: String(1000000 + i),
      descricao: `Atividade ${i}`,
    }));
    mocks.create
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cnaes":["1000201"]}' } }] });

    expect(await sugerirCnaesParaObjeto("objeto", grande)).toEqual(["1000201"]);
  });

  it("descarta código de OUTRO lote que o modelo tenha citado", async () => {
    const grande: ClasseCnae[] = Array.from({ length: 400 }, (_, i) => ({
      classe: String(1000000 + i),
      descricao: `Atividade ${i}`,
    }));
    // O 1o lote (1000000-1000199) devolve um código que só existe no 2o: não pode ser aceito ali,
    // senão o filtro por lote deixaria passar escolha não fundamentada no que o modelo viu.
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cnaes":["1000300"]}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cnaes":[]}' } }] });

    expect(await sugerirCnaesParaObjeto("objeto", grande)).toEqual([]);
  });

  it("é determinística: a ordem do catálogo de entrada não muda a saída", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: '{"cnaes":["4761003","4649408"]}' } }],
    });

    const a = await sugerirCnaesParaObjeto("papelaria", CLASSES);
    const b = await sugerirCnaesParaObjeto("papelaria", [...CLASSES].reverse());

    expect(a).toEqual(b);
  });
});
