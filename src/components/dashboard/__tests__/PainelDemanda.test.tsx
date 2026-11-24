import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Remessa } from "@/lib/domain/indicadores/demanda";
import {
  montarPainelDemanda,
  type CategoriaProcesso,
} from "@/lib/domain/indicadores/painelDemanda";
import { somarDias } from "@/lib/domain/indicadores/painelDemanda";
import type { ResultadoPainelDemanda } from "@/lib/indicadores/painelDemanda";
import { PainelDemandaDivisao } from "../PainelDemanda";
import { FiltrosPainelDemanda } from "../FiltrosPainelDemanda";

const push = vi.fn();
let parametros = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => parametros,
}));

let seq = 0;
function rem(data: string, n: string, tipo = "Geral"): Remessa {
  return {
    data,
    ano: Number(data.slice(0, 4)),
    mes: Number(data.slice(5, 7)),
    chave: n,
    rotulo: `${tipo} Nº ${n} - volume 1`,
    idEmail: `e${++seq}`,
  };
}
function passagens(n: string, k: number, inicio: string, passo = 1, tipo = "Geral"): Remessa[] {
  return Array.from({ length: k }, (_, i) => rem(somarDias(inicio, i * passo), n, tipo));
}

const HOJE = "2026-11-24";
const REMESSAS: Remessa[] = [
  ...passagens("1/2025", 5, "2025-03-01", 10), // 2025: 2 devoluções em 5 remessas
  ...passagens("2/2025", 2, "2025-04-01", 3),
  ...passagens("110/2026", 9, "2026-02-01", 3), // crítico (9 passagens)
  ...passagens("5/2026", 5, "2026-05-01", 4, "Aquisição de Bens"), // atenção
  ...passagens("7/2026", 2, "2026-09-01", 5, "Aquisição de Serviços"), // normal
  rem("2026-11-24", "9/2026", "Aquisição de Serviços"),
];

function ok(
  opcoes: Partial<Extract<ResultadoPainelDemanda, { estado: "ok" }>> & {
    ano?: number;
    categoria?: CategoriaProcesso | null;
  } = {},
): ResultadoPainelDemanda {
  const { ano = 2026, categoria = null, ...resto } = opcoes;
  return {
    estado: "ok",
    painel: montarPainelDemanda(REMESSAS, { ano, hoje: HOJE, categoria }),
    anos: [2026, 2025],
    fonte: "api",
    aviso: null,
    descartadas: 0,
    duplicadas: 0,
    noSistema: { "110/2026": { id: "p110", numero: "0110/2026" } },
    ...resto,
  };
}

const kpi = (nome: RegExp) => screen.getByRole("button", { name: nome });

describe("PainelDemandaDivisao: estados", () => {
  beforeEach(() => {
    push.mockClear();
    parametros = new URLSearchParams();
  });

  it("não configurada: frase própria, sem número", () => {
    render(<PainelDemandaDivisao resultado={{ estado: "nao_configurada" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("ainda não foi configurada");
  });

  it("indisponível: mostra o motivo e nenhum zero", () => {
    render(
      <PainelDemandaDivisao
        resultado={{
          estado: "indisponivel",
          motivo: "Aba 'Remessas 2024': Cabeçalho não reconhecido.",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível carregar a demanda");
    expect(screen.getByRole("status")).toHaveTextContent("Remessas 2024");
    expect(screen.queryByText(/Taxa de devolução/)).not.toBeInTheDocument();
  });

  it("reserva pelo CSV: avisa que não há comparativo e que a leitura é pelo link público", () => {
    render(
      <PainelDemandaDivisao
        resultado={ok({
          fonte: "csv",
          aviso:
            "Só o ano da aba configurada está disponível, sem comparativo com anos anteriores.",
        })}
      />,
    );
    expect(screen.getByText(/sem comparativo com anos anteriores/)).toBeInTheDocument();
    expect(screen.getByText(/pelo link público \(reserva\)/)).toBeInTheDocument();
  });

  it("filtro sem nenhuma remessa: frase explicativa, não painel de zeros", () => {
    render(<PainelDemandaDivisao resultado={ok({ categoria: "outros" })} />);
    expect(screen.getByText(/Nenhuma remessa em 2026 para Outros/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Taxa de devolução/ })).not.toBeInTheDocument();
  });

  it("rodapé: data da última remessa, origem da leitura e linhas ignoradas/repetidas", () => {
    render(<PainelDemandaDivisao resultado={ok({ descartadas: 3, duplicadas: 2 })} />);
    expect(screen.getByText(/Última remessa em 24\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 linha\(s\) ignorada\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 remessa\(s\) repetida\(s\)/)).toBeInTheDocument();
  });
});

describe("PainelDemandaDivisao: indicadores", () => {
  beforeEach(() => {
    push.mockClear();
    parametros = new URLSearchParams();
  });

  it("mostra os 4 indicadores com o valor e a nota que os explica", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    // 2026 até 24/11: 9+5+2+1 = 17 remessas; devoluções = 6 (110/2026) + 2 (5/2026) = 8
    const taxa = kpi(/Taxa de devolução/);
    expect(taxa).toHaveTextContent("47,1%");
    expect(taxa).toHaveTextContent("8 devoluções em 17 remessas");
    const devolvidos = kpi(/Processos devolvidos/);
    expect(devolvidos).toHaveTextContent("2 de 4");
    expect(kpi(/Passagens por processo/)).toHaveTextContent("4,3");
    expect(kpi(/Intervalo mediano/)).toHaveTextContent(/dias/);
  });

  it("compara com o MESMO período do ano anterior e diz isso", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    // 2025 até 24/11: 7 remessas, 2 devoluções = 28,6% ; 2026 = 47,1% → +18,5 p.p. (alta de devolução = ruim)
    const taxa = kpi(/Taxa de devolução/);
    expect(taxa).toHaveTextContent("+18,5 p.p.");
    expect(taxa).toHaveTextContent("vs. 2025 no mesmo período");
    expect(within(taxa).getByText("+18,5 p.p.")).toHaveClass("text-danger");
  });

  it("queda de devolução aparece em verde", () => {
    render(<PainelDemandaDivisao resultado={ok({ ano: 2025 })} />);
    // 2025 inteiro (fechado) contra 2024 (sem dados): sem comparativo
    expect(kpi(/Taxa de devolução/)).toHaveTextContent("sem comparativo");
  });

  it("clicar no indicador abre a lista dos processos que o explicam, e clicar no processo abre o detalhe", async () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    fireEvent.click(kpi(/Taxa de devolução/));
    const lista = await screen.findByRole("dialog");
    expect(within(lista).getByText("Onde estão as 8 devoluções")).toBeInTheDocument();
    // o que mais devolveu vem primeiro
    const botoes = within(lista)
      .getAllByRole("button")
      .filter((b) => /Nº/.test(b.textContent ?? ""));
    expect(botoes[0]).toHaveTextContent("Geral Nº 110/2026 - volume 1");

    fireEvent.click(botoes[0]!);
    expect(await screen.findByText(/Processo 110\/2026/)).toBeInTheDocument();
    const detalhe = screen.getByRole("dialog");
    expect(within(detalhe).getAllByText("devolução")).toHaveLength(6); // 9 passagens: da 4ª à 9ª
    expect(within(detalhe).getAllByText("obrigatória")).toHaveLength(3);
    expect(
      within(detalhe).getByRole("link", { name: /Abrir o processo 0110\/2026 no sistema/ }),
    ).toHaveAttribute("href", "/processos/p110");
    // volta para a lista de onde veio
    fireEvent.click(within(detalhe).getByRole("button", { name: /Voltar à lista/ }));
    expect(await screen.findByText("Onde estão as 8 devoluções")).toBeInTheDocument();
  });

  it("processo que não está cadastrado diz isso, sem link", async () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    fireEvent.click(kpi(/Processos devolvidos/));
    const lista = await screen.findByRole("dialog");
    fireEvent.click(within(lista).getByRole("button", { name: /Aquisição de Bens Nº 5\/2026/ }));
    expect(await screen.findByText(/ainda não está cadastrado no sistema/)).toBeInTheDocument();
  });
});

describe("PainelDemandaDivisao: o que mudou", () => {
  beforeEach(() => {
    parametros = new URLSearchParams();
  });

  it("mostra as frases do ano corrente com o número, e o processo da frase abre o detalhe", async () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: "O que mudou" });
    const frases = within(secao)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(
      frases.some((f) =>
        f.includes("Nos últimos 7 dias chegou 1 remessa (0 nos 7 dias anteriores)."),
      ),
    ).toBe(true);
    fireEvent.click(within(secao).getByRole("button", { name: "Geral Nº 110/2026 - volume 1" }));
    expect(await screen.findByText(/Processo 110\/2026/)).toBeInTheDocument();
  });

  it("o processo da frase também abre pelo teclado (Enter e espaço)", async () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: "O que mudou" });
    const acao = within(secao).getByRole("button", { name: "Geral Nº 110/2026 - volume 1" });
    expect(acao).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(acao, { key: "Enter" });
    expect(await screen.findByText(/Processo 110\/2026/)).toBeInTheDocument();
  });

  it("cada frase tem a leitura para quem usa leitor de tela (piorou/melhorou/informação)", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: "O que mudou" });
    expect(within(secao).getAllByText(/^(Piorou|Melhorou|Informação):/).length).toBeGreaterThan(0);
  });

  it("ano fechado: explica que a seção vale só para o ano corrente", () => {
    render(<PainelDemandaDivisao resultado={ok({ ano: 2025 })} />);
    expect(screen.getByText(/2025 é um ano fechado/)).toBeInTheDocument();
  });
});

describe("PainelDemandaDivisao: tabelas", () => {
  it("'Processos que mais voltaram' ordena por passagens e mostra o nível", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: /Processos que mais voltaram/ });
    const linhas = within(secao).getAllByRole("row").slice(1);
    expect(linhas[0]).toHaveTextContent("Geral Nº 110/2026 - volume 1");
    expect(linhas[0]).toHaveTextContent("Crítico");
    expect(linhas[1]).toHaveTextContent("Atenção");
    expect(linhas[2]).toHaveTextContent("Normal");
  });

  it("'Métricas por processo': a busca e o filtro de nível reduzem a lista, com contagem", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: "Métricas por processo" });
    expect(within(secao).getByRole("status")).toHaveTextContent("4 processos");
    fireEvent.change(within(secao).getByPlaceholderText("número, tipo ou volume"), {
      target: { value: "serviços" },
    });
    expect(within(secao).getByRole("status")).toHaveTextContent("2 processos");
    fireEvent.change(within(secao).getByLabelText("Nível"), { target: { value: "critico" } });
    expect(within(secao).getByRole("status")).toHaveTextContent("0 processo");
    expect(within(secao).getByText("Nenhum processo com esses filtros.")).toBeInTheDocument();
  });

  it("clicar no cabeçalho ordena, e clicar de novo inverte (aria-sort)", () => {
    render(<PainelDemandaDivisao resultado={ok()} />);
    const secao = screen.getByRole("region", { name: "Métricas por processo" });
    const primeiraLinha = () => within(secao).getAllByRole("row")[1]!;
    const cabecalho = within(secao).getByRole("columnheader", { name: /Passagens/ });
    expect(cabecalho).toHaveAttribute("aria-sort", "descending");
    expect(primeiraLinha()).toHaveTextContent("110/2026");
    fireEvent.click(within(cabecalho).getByRole("button"));
    expect(cabecalho).toHaveAttribute("aria-sort", "ascending");
    expect(primeiraLinha()).not.toHaveTextContent("110/2026");
  });

  it("'Sem nova há' só existe no ano corrente", () => {
    const { unmount } = render(<PainelDemandaDivisao resultado={ok()} />);
    expect(screen.getByRole("columnheader", { name: /Sem nova há/ })).toBeInTheDocument();
    unmount();
    render(<PainelDemandaDivisao resultado={ok({ ano: 2025 })} />);
    expect(screen.queryByRole("columnheader", { name: /Sem nova há/ })).not.toBeInTheDocument();
  });
});

describe("FiltrosPainelDemanda", () => {
  beforeEach(() => {
    push.mockClear();
    parametros = new URLSearchParams("escopo=meus&periodo=90d&fila=todas");
  });

  it("trocar o ano mantém os outros parâmetros do dashboard", async () => {
    render(<FiltrosPainelDemanda anos={[2026, 2025]} ano={2026} categoria={null} />);
    fireEvent.change(screen.getByLabelText("Ano"), { target: { value: "2025" } });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/dashboard");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      escopo: "meus",
      periodo: "90d",
      fila: "todas",
      ano: "2025",
    });
  });

  it("escolher categoria põe na URL, e 'Todas' tira", () => {
    const { unmount } = render(<FiltrosPainelDemanda anos={[2026]} ano={2026} categoria={null} />);
    fireEvent.change(screen.getByLabelText("Categoria do processo"), { target: { value: "bens" } });
    expect(
      new URL(push.mock.calls[0]![0] as string, "http://x").searchParams.get("categoria"),
    ).toBe("bens");
    unmount();
    parametros = new URLSearchParams("categoria=bens&escopo=meus");
    render(<FiltrosPainelDemanda anos={[2026]} ano={2026} categoria="bens" />);
    fireEvent.change(screen.getByLabelText("Categoria do processo"), { target: { value: "" } });
    const url = new URL(push.mock.calls[1]![0] as string, "http://x");
    expect(url.searchParams.has("categoria")).toBe(false);
    expect(url.searchParams.get("escopo")).toBe("meus");
  });

  it("lista só os anos que têm remessa e mostra o selecionado", () => {
    render(<FiltrosPainelDemanda anos={[2026, 2025, 2024]} ano={2025} categoria={null} />);
    const select = screen.getByLabelText("Ano") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["2026", "2025", "2024"]);
    expect(select.value).toBe("2025");
  });
});
