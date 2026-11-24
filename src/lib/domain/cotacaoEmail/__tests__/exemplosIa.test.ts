import { describe, expect, it } from "vitest";
import {
  classeDaSituacao,
  escolherExemplos,
  MAX_EXEMPLOS_POR_ITEM,
  MAX_TRECHO_EXEMPLO,
  palavrasDoTexto,
  parecerAnonimo,
  semelhanca,
  type ExemploGuardado,
} from "../exemplosIa";

const ex = (id: string, classe: ExemploGuardado["classe"], trecho: string): ExemploGuardado => ({ id, classe, trecho });

describe("parecerAnonimo", () => {
  it("aceita o texto que o script do Google entrega (com os marcadores)", () => {
    expect(parecerAnonimo("Segue em anexo o orçamento solicitado, [valor] por unidade. Contato [email] [tel].")).toEqual({ ok: true });
    expect(parecerAnonimo("Pode detalhar o item 3? São 250 unidades, entrega em 30/10?")).toEqual({ ok: true });
  });

  it.each([
    ["e-mail", "Responda para fulano@empresa.com.br por favor", "email"],
    ["link", "Veja em https://site.com.br/orcamento o material", "link"],
    ["link www", "Acesse www.empresa.com.br para ver", "link"],
    ["CNPJ formatado", "Nossa empresa 12.345.678/0001-90 não atende", "documento"],
    ["CPF formatado", "O responsável é o CPF 123.456.789-09 do sócio", "documento"],
    ["telefone", "Ligue para (13) 99876-5432 para falar", "telefone"],
    ["valor em reais", "O valor total fica R$ 1.250,00 com frete", "valor"],
    ["número longo (sem pontuação)", "Protocolo 123456789 registrado aqui", "numero_longo"],
    ["CNPJ sem pontuação", "Documento 12345678901234 informado aqui", "documento"],
  ])("recusa %s e nomeia a regra, sem devolver o texto", (_n, texto, regra) => {
    const r = parecerAnonimo(texto);
    expect(r).toEqual({ ok: false, motivo: regra });
    expect(JSON.stringify(r)).not.toContain(texto);
  });

  it("recusa vazio, curto demais e grande demais", () => {
    expect(parecerAnonimo("   ")).toEqual({ ok: false, motivo: "curto_demais" });
    expect(parecerAnonimo("sim ok")).toEqual({ ok: false, motivo: "curto_demais" });
    expect(parecerAnonimo("a".repeat(MAX_TRECHO_EXEMPLO + 1))).toEqual({ ok: false, motivo: "grande_demais" });
    expect(parecerAnonimo("a".repeat(MAX_TRECHO_EXEMPLO)).ok).toBe(true);
  });
});

describe("palavrasDoTexto e semelhança", () => {
  it("ignora acento, caixa, números, palavras curtas e as vazias", () => {
    expect([...palavrasDoTexto("Não trabalhamos com ESSE Item, 250 unidades [email]")].sort()).toEqual(["item", "trabalhamos", "unidades"]);
  });

  it("textos iguais = 1; sem nada em comum = 0; vazio = 0", () => {
    const a = palavrasDoTexto("compra direta ou licitação");
    expect(semelhanca(a, palavrasDoTexto("compra direta ou licitação"))).toBe(1);
    expect(semelhanca(a, palavrasDoTexto("fornecemos cadeiras"))).toBe(0);
    expect(semelhanca(a, new Set())).toBe(0);
  });
});

describe("escolherExemplos", () => {
  const base: ExemploGuardado[] = [
    ex("r1", "recusa", "não trabalhamos com esse tipo de item no momento"),
    ex("r2", "recusa", "não trabalhamos com esse item, fora do nosso ramo"),
    ex("o1", "orcamento", "segue em anexo o orçamento solicitado para o item"),
    ex("d1", "duvida", "pode detalhar a especificação do item e a quantidade"),
    ex("n1", "nao_e_resposta", "recebido, obrigado, vamos verificar o item"),
  ];

  it("garante um de cada classe antes de repetir classe, mesmo que uma classe seja mais parecida", () => {
    const r = escolherExemplos("não trabalhamos com esse item", base, { max: 3 });
    // As DUAS recusas empatam como as mais parecidas (0,5 cada) e só a 1ª fica: a 2ª perde a vaga para
    // outra classe. Sem a regra da diversidade o resultado seria r1, r2 + uma terceira classe.
    expect(r.filter((e) => e.classe === "recusa")).toHaveLength(1);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((e) => e.classe)).size).toBe(3);
  });

  it("completa com os mais parecidos quando já há uma de cada classe", () => {
    const r = escolherExemplos("não trabalhamos com esse item, orçamento, especificação e quantidade, recebido", base, { max: 5 });
    expect(r).toHaveLength(5);
  });

  it("nunca devolve mais que o teto", () => {
    expect(escolherExemplos("item orçamento recusa", base, { max: 2 }).length).toBeLessThanOrEqual(2);
    expect(MAX_EXEMPLOS_POR_ITEM).toBe(4);
    expect(escolherExemplos("não trabalhamos com esse item orçamento detalhar recebido", base)).toHaveLength(4);
  });

  it("o próprio caso NUNCA é exemplo de si mesmo (é o que torna a medição honesta)", () => {
    const r = escolherExemplos("não trabalhamos com esse tipo de item no momento", base, { excluirId: "r1" });
    expect(r.map((e) => e.id)).not.toContain("r1");
    expect(escolherExemplos("não trabalhamos com esse tipo de item no momento", base).map((e) => e.id)).toContain("r1");
  });

  it("nada parecido: lista vazia (a IA lê sem exemplo, em vez de receber ruído)", () => {
    expect(escolherExemplos("cadeira giratória ergonômica", base)).toEqual([]);
    expect(escolherExemplos("qualquer coisa", [])).toEqual([]);
  });

  it("resultado em ordem do mais para o menos parecido e determinístico", () => {
    const a = escolherExemplos("não trabalhamos com esse tipo de item no momento", base);
    const b = escolherExemplos("não trabalhamos com esse tipo de item no momento", [...base].reverse());
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a[0]!.id).toBe("r1"); // empata com r2 (0,5); o desempate por id é estável
  });
});

describe("classeDaSituacao", () => {
  it.each(["orcamento", "recusa", "duvida"])("%s vira exemplo", (s) => expect(classeDaSituacao(s)).toBe(s));
  it.each(["a_confirmar", "sem_resposta", "email_invalido", "outra"])("%s NÃO vira exemplo", (s) => expect(classeDaSituacao(s)).toBeNull());
});
