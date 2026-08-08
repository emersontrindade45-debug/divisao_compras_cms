import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingerirSinapi: vi.fn(),
}));

vi.mock("@/lib/ingestao/ingerirSinapi", () => ({
  ingerirSinapi: mocks.ingerirSinapi,
}));

import { POST } from "../route";

const RESUMO_PADRAO = {
  loteId: "lote-1",
  sucesso: true,
  linhasLidas: 7829,
  linhasImportadas: 7829,
  linhasRejeitadas: 0,
  motivosRejeicao: [],
};

/**
 * Constrói só o subconjunto de `Request` que a rota usa (`headers`,
 * `formData()`), sem passar pelo `Request`/`FormData` reais do jsdom.
 *
 * **Por quê:** `new Request(..., { body: new FormData() })` seguido de
 * `.formData()` no ambiente de teste (jsdom) serializa `File` como **string**
 * (o nome do arquivo), não como o objeto `File` — confirmado isolando o
 * roundtrip nesta sessão (`arquivo instanceof` falha, protótipo do valor
 * devolvido é `String.prototype`, não `File.prototype`). Isso não é bug da
 * rota: é uma limitação conhecida do polyfill de `fetch`/`FormData` do jsdom
 * com corpos multipart binários. Mockar `formData()` diretamente testa o
 * contrato real que a rota consome (`FormData.get("arquivo")` devolvendo algo
 * com `.arrayBuffer()`), sem depender da serialização binária que o teste
 * não precisa exercitar — o parsing de multipart em si é responsabilidade do
 * runtime do Next em produção, não código deste projeto.
 */
function requisicaoComArquivo(
  opcoes: {
    regime?: string;
    authorization?: string;
    semArquivo?: boolean;
    conteudoArquivo?: string;
  } = {},
): Request {
  const campos = new Map<string, unknown>();
  if (!opcoes.semArquivo) {
    const conteudo = opcoes.conteudoArquivo ?? "conteudo-fake-xlsx";
    campos.set("arquivo", {
      name: "SINAPI_Custo.xlsx",
      arrayBuffer: async () => new TextEncoder().encode(conteudo).buffer,
    });
  }
  if (opcoes.regime !== undefined) campos.set("regime", opcoes.regime);

  return {
    headers: new Headers(opcoes.authorization ? { authorization: opcoes.authorization } : {}),
    formData: async () => ({
      get: (chave: string) => campos.get(chave) ?? null,
    }),
  } as unknown as Request;
}

describe("POST /api/admin/ingerir-sinapi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.ingerirSinapi.mockResolvedValue(RESUMO_PADRAO);
  });

  it("nega acesso quando ADMIN_MIGRATE_SECRET não está configurado (fail-closed)", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "");

    const res = await POST(
      requisicaoComArquivo({ regime: "nao_desonerado", authorization: "Bearer qualquer" }),
    );

    expect(res.status).toBe(401);
    expect(mocks.ingerirSinapi).not.toHaveBeenCalled();
  });

  it("nega acesso com Bearer errado", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicaoComArquivo({ regime: "nao_desonerado", authorization: "Bearer errado" }),
    );

    expect(res.status).toBe(401);
    expect(mocks.ingerirSinapi).not.toHaveBeenCalled();
  });

  it("rejeita requisição sem arquivo", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicaoComArquivo({
        regime: "nao_desonerado",
        authorization: "Bearer segredo-correto",
        semArquivo: true,
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.ingerirSinapi).not.toHaveBeenCalled();
  });

  it("rejeita regime inválido (só desonerado/nao_desonerado são aceitos)", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicaoComArquivo({ regime: "invalido", authorization: "Bearer segredo-correto" }),
    );

    expect(res.status).toBe(400);
    expect(mocks.ingerirSinapi).not.toHaveBeenCalled();
  });

  it("chama ingerirSinapi com o conteúdo do arquivo e o regime, e devolve o resumo", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");

    const res = await POST(
      requisicaoComArquivo({
        regime: "desonerado",
        authorization: "Bearer segredo-correto",
        conteudoArquivo: "conteudo-do-xlsx",
      }),
    );
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.ingerirSinapi).toHaveBeenCalledWith({
      conteudo: expect.any(Buffer),
      regime: "desonerado",
    });
    const bufferRecebido = mocks.ingerirSinapi.mock.calls[0][0].conteudo as Buffer;
    expect(bufferRecebido.toString("utf-8")).toBe("conteudo-do-xlsx");
    expect(corpo.ok).toBe(true);
    expect(corpo.resumo).toMatchObject({ linhasLidas: 7829 });
  });

  it("devolve 500 com detalhe do erro quando a ingestão lança exceção, sem derrubar a rota", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    mocks.ingerirSinapi.mockRejectedValue(new Error("Fonte de referência não cadastrada"));

    const res = await POST(
      requisicaoComArquivo({ regime: "nao_desonerado", authorization: "Bearer segredo-correto" }),
    );
    const corpo = await res.json();

    expect(res.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toContain("não cadastrada");
  });

  it("resumo.sucesso=false do runner ainda devolve HTTP 200 (a chamada da rota funcionou; o lote é que falhou)", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "segredo-correto");
    mocks.ingerirSinapi.mockResolvedValue({
      ...RESUMO_PADRAO,
      sucesso: false,
      erro: "Layout inesperado",
    });

    const res = await POST(
      requisicaoComArquivo({ regime: "nao_desonerado", authorization: "Bearer segredo-correto" }),
    );
    const corpo = await res.json();

    expect(res.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.resumo.sucesso).toBe(false);
    expect(corpo.resumo.erro).toBe("Layout inesperado");
  });
});
