import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistenteProvider, AssistenteToggle } from "../AssistenteDock";
import { listarConversas, obterConversa, obterConversaAtiva } from "@/lib/actions/assistente";

// Histórico de conversas no painel do assistente.
//
// O defeito que ele corrige: o painel só alcançava a ÚLTIMA conversa do escopo,
// então cada "Nova conversa" deixava a anterior gravada e inalcançável — e com
// ela iam embora os cartões de candidato, única porta para o picker de "outros
// itens desta licitação".

vi.mock("@/lib/actions/assistente", () => ({
  obterConversaAtiva: vi.fn(async () => null),
  obterConversa: vi.fn(async () => null),
  listarConversas: vi.fn(async () => []),
  listarItensDoProcesso: vi.fn(async () => []),
  adicionarCandidatoSugerido: vi.fn(async () => ({ ok: true, mensagem: "ok" })),
  completarLinksOrigemCandidatos: vi.fn(async () => ({ ok: true, urls: {} })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/processos/proc-1",
}));

const listarConversasMock = vi.mocked(listarConversas);
const obterConversaMock = vi.mocked(obterConversa);
const obterConversaAtivaMock = vi.mocked(obterConversaAtiva);

const CONVERSAS = [
  {
    id: "conv-longa",
    titulo: "preciso que encontre contratos similares",
    ultimaMensagemEm: "2026-09-18T12:21:00.000Z",
    totalMensagens: 60,
  },
  {
    id: "conv-curta",
    titulo: "preciso que procure contratos para o item 3",
    ultimaMensagemEm: "2026-09-18T12:24:00.000Z",
    totalMensagens: 3,
  },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  listarConversasMock.mockClear();
  obterConversaMock.mockClear();
  obterConversaAtivaMock.mockClear();
  listarConversasMock.mockResolvedValue(CONVERSAS);
  obterConversaMock.mockResolvedValue(null);
  obterConversaAtivaMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Abre o painel do assistente, que é onde o histórico vive. */
async function abrirPainel() {
  render(
    <AssistenteProvider>
      <AssistenteToggle />
    </AssistenteProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /assistente/i }));
  await screen.findByText("Assistente de pesquisa");
}

async function abrirHistorico() {
  fireEvent.click(screen.getByRole("button", { name: "Conversas anteriores" }));
  return screen.findByRole("list", { name: "Conversas anteriores" });
}

describe("histórico de conversas do assistente", () => {
  it("lista as conversas anteriores do processo com título e contagem", async () => {
    await abrirPainel();
    await abrirHistorico();

    expect(listarConversasMock).toHaveBeenCalledWith("proc-1");
    expect(await screen.findByText("preciso que encontre contratos similares")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
  });

  // O ponto da feature: a conversa escolhida é a que o chat carrega. Sem isto o
  // painel voltaria à última do escopo e o clique não faria nada (§9.40).
  it("abre no chat a conversa escolhida, não a última do escopo", async () => {
    await abrirPainel();
    await abrirHistorico();

    // A primeira montagem retoma a última conversa do escopo, e isso é o
    // correto — o que não pode acontecer é retomá-la DE NOVO depois da escolha,
    // que seria desfazer o clique.
    obterConversaAtivaMock.mockClear();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));

    await waitFor(() => {
      expect(obterConversaMock).toHaveBeenCalledWith({ conversaId: "conv-longa" });
    });
    expect(obterConversaAtivaMock).not.toHaveBeenCalled();
  });

  it("indica no cabeçalho que a conversa aberta veio do histórico", async () => {
    await abrirPainel();
    expect(screen.getByText("Conversa deste processo")).toBeTruthy();

    await abrirHistorico();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));

    expect(await screen.findByText("Conversa anterior")).toBeTruthy();
  });

  // Mutação que confirma: sem o `setConversaEscolhida(null)` em `novaConversa`,
  // o chat remonta NA conversa do histórico e o botão parece inerte (§9.40).
  it("Nova conversa depois de abrir uma do histórico começa do zero", async () => {
    await abrirPainel();
    await abrirHistorico();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));
    await screen.findByText("Conversa anterior");

    obterConversaMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));

    expect(await screen.findByText("Conversa deste processo")).toBeTruthy();
    await waitFor(() => {
      expect(obterConversaMock).not.toHaveBeenCalled();
    });
  });

  it("avisa quando não há conversa anterior em vez de mostrar lista vazia", async () => {
    listarConversasMock.mockResolvedValue([]);

    await abrirPainel();
    fireEvent.click(screen.getByRole("button", { name: "Conversas anteriores" }));

    expect(await screen.findByText(/Nenhuma conversa anterior/i)).toBeTruthy();
  });
});

// Conversa longa reabre mostrando só o fim. Os cartões de candidato de uma
// busca antiga ficam acima da janela — foi assim que a contratação de Ferraz de
// Vasconcelos (mensagens 6, 10 e 12 de 60) ficou inalcançável em produção.
describe("carregar mensagens anteriores", () => {
  const PAGINA_RECENTE = {
    conversaId: "conv-longa",
    temMais: true,
    mensagens: [
      { id: "m31", papel: "user" as const, conteudo: "mensagem recente", passos: [], citacoes: [] },
    ],
  };

  const PAGINA_ANTIGA = {
    conversaId: "conv-longa",
    temMais: false,
    mensagens: [
      { id: "m1", papel: "user" as const, conteudo: "mensagem do começo", passos: [], citacoes: [] },
    ],
  };

  it("oferece carregar anteriores e usa a mensagem do topo como cursor", async () => {
    obterConversaMock.mockResolvedValue(PAGINA_RECENTE);

    await abrirPainel();
    await abrirHistorico();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));
    await screen.findByText("mensagem recente");

    obterConversaMock.mockResolvedValue(PAGINA_ANTIGA);
    fireEvent.click(screen.getByRole("button", { name: /Carregar mensagens anteriores/i }));

    await waitFor(() => {
      expect(obterConversaMock).toHaveBeenLastCalledWith({
        conversaId: "conv-longa",
        antesDe: "m31",
      });
    });
    // A página antiga entra ACIMA da que já estava: a conversa continua legível
    // de cima para baixo.
    expect(await screen.findByText("mensagem do começo")).toBeTruthy();
    expect(screen.getByText("mensagem recente")).toBeTruthy();
  });

  // Prometer o botão quando não há página anterior é a §9.40: clique sem efeito.
  it("some com o botão quando a conversa já está inteira na tela", async () => {
    obterConversaMock.mockResolvedValue({ ...PAGINA_RECENTE, temMais: false });

    await abrirPainel();
    await abrirHistorico();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));
    await screen.findByText("mensagem recente");

    expect(screen.queryByRole("button", { name: /Carregar mensagens anteriores/i })).toBeNull();
  });

  it("some com o botão depois de chegar ao começo da conversa", async () => {
    obterConversaMock.mockResolvedValue(PAGINA_RECENTE);

    await abrirPainel();
    await abrirHistorico();
    fireEvent.click(await screen.findByText("preciso que encontre contratos similares"));
    await screen.findByText("mensagem recente");

    obterConversaMock.mockResolvedValue(PAGINA_ANTIGA);
    fireEvent.click(screen.getByRole("button", { name: /Carregar mensagens anteriores/i }));
    await screen.findByText("mensagem do começo");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Carregar mensagens anteriores/i })).toBeNull();
    });
  });
});
