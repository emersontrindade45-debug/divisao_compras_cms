import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Funções REAIS do script (não cópias): o teste quebra se o script mudar. */
const fonte = readFileSync(join(__dirname, "..", "respostasCotacao.gs"), "utf-8");
function carregar<T>(nome: string): T {
  const trecho = new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)?.[0];
  if (!trecho) throw new Error(`${nome} não encontrada no script`);
  return new Function(`${trecho}; return ${nome};`)() as T;
}

const semCitacao = carregar<(c: string) => string>("semCitacao_");
// anonimizar_ depende de semCitacao_ (mesmo escopo do script): carrega as duas juntas.
const provavelRecusa = carregar<(t: string) => boolean>("provavelRecusa_");
const anonimizar = new Function(
  `${/function semCitacao_[\s\S]*?\n}\n/.exec(fonte)![0]}\n${/function anonimizar_[\s\S]*?\n}\n/.exec(fonte)![0]}; return anonimizar_;`,
)() as (c: string) => string;
// marcadoresDoTexto_ chama provavelRecusa_ (mesmo escopo do script): carrega as duas juntas.
const marcadores = new Function(
  `${/function provavelRecusa_[\s\S]*?\n}\n/.exec(fonte)![0]}\n${/function marcadoresDoTexto_[\s\S]*?\n}\n/.exec(fonte)![0]}; return marcadoresDoTexto_;`,
)() as (t: string) => Record<string, boolean>;

describe("semCitacao_", () => {
  it("corta no 'Em … escreveu:' do e-mail original", () => {
    const corpo = "Obrigado, vamos analisar.\n\nEm seg., 3 de nov. de 2026 10:00, Compras <compras@x.gov.br> escreveu:\nSolicitamos orçamento?";
    expect(semCitacao(corpo).trim()).toBe("Obrigado, vamos analisar.");
  });

  it("corta na primeira linha citada com '>'", () => {
    expect(semCitacao("Ok.\n> orçamento solicitado?\n> prazo")).toBe("Ok.");
  });

  it("sem citação, devolve o texto inteiro", () => {
    expect(semCitacao("Resposta direta.")).toBe("Resposta direta.");
  });
});

describe("marcadoresDoTexto_", () => {
  it("a pergunta do nosso próprio pedido (parte citada) não conta como pergunta do fornecedor", () => {
    const corpo = "Recebido.\n\nEm seg., 3 de nov. de 2026 10:00, Compras escreveu:\nPoderia enviar o orçamento?";
    expect(marcadores(semCitacao(corpo)).pergunta).toBe(false);
  });

  it("reconhece recusa por frase fora da lista fixa", () => {
    expect(marcadores("Infelizmente não trabalhamos com esse segmento.").provavelRecusa).toBe(true);
  });

  it("reconhece pedido de informação", () => {
    expect(marcadores("Poderia enviar o termo de referência?").pedeInformacao).toBe(true);
  });

  // Retirado: acendia por telefone, CEP e CNPJ da assinatura — 0 de 15 eram valor (2026-11-18).
  it("não tem mais o marcador numeroDecimal", () => {
    expect(marcadores("Telefone 13 3202.1234, CEP 11013-923")).not.toHaveProperty("numeroDecimal");
  });

  it("texto muito curto conta como vazio", () => {
    expect(marcadores("ok").vazio).toBe(true);
    expect(marcadores("Segue conforme solicitado, com os valores.").vazio).toBe(false);
  });

  it("texto neutro não acende nenhum marcador", () => {
    const m = marcadores("Bom dia, tudo bem com vocês nesta semana de trabalho");
    expect(Object.values(m).some(Boolean)).toBe(false);
  });
});

describe("sortear_", () => {
  const sortear = carregar<(e: { n: number; vistos: number; itens: string[] }, i: string) => void>("sortear_");

  it("guarda no máximo `n` itens e conta todos os vistos", () => {
    const estado = { n: 3, vistos: 0, itens: [] as string[] };
    for (let i = 0; i < 100; i++) sortear(estado, `m${i}`);
    expect(estado.itens).toHaveLength(3);
    expect(estado.vistos).toBe(100);
  });

  it("com menos itens que `n`, guarda todos", () => {
    const estado = { n: 15, vistos: 0, itens: [] as string[] };
    ["a", "b"].forEach((i) => sortear(estado, i));
    expect(estado.itens).toEqual(["a", "b"]);
  });

  it("não favorece o começo: com muitos itens, sobram itens vindos do fim também", () => {
    const estado = { n: 10, vistos: 0, itens: [] as string[] };
    for (let i = 0; i < 1000; i++) sortear(estado, `m${i}`);
    expect(estado.itens.some((id) => Number(id.slice(1)) >= 500)).toBe(true);
  });
});

describe("anonimizar_", () => {
  it("tira valores, e-mail, telefone, CNPJ, link e qualquer número", () => {
    const saida = anonimizar(
      "Segue o valor de R$ 1.250,00 por unidade. Contato: joao@empresa.com.br, (13) 99876-5432, CNPJ 12.345.678/0001-90, https://empresa.com.br/proposta/778, item 3.",
    );
    expect(saida).not.toMatch(/\d/);
    expect(saida).not.toMatch(/@|https?:|empresa\.com/);
    expect(saida).toContain("[valor]");
    expect(saida).toContain("[email]");
    expect(saida).toContain("[tel]");
    expect(saida).toContain("[doc]");
    expect(saida).toContain("[link]");
  });

  it("descarta a parte citada e a assinatura", () => {
    const corpo = "Não trabalhamos com esse segmento.\nAtenciosamente,\nMaria Souza\nGerente\n\nEm seg., 3 de nov. de 2026 10:00, Compras escreveu:\nPoderia enviar orçamento de R$ 500,00?";
    const saida = anonimizar(corpo);
    expect(saida).toBe("Não trabalhamos com esse segmento.");
    expect(saida).not.toContain("Maria");
    expect(saida).not.toContain("500");
  });

  it("mantém a frase do fornecedor, que é o que a classificação precisa", () => {
    expect(anonimizar("Infelizmente não temos interesse neste item.")).toBe("Infelizmente não temos interesse neste item.");
  });

  it("limita o tamanho a 400 caracteres", () => {
    expect(anonimizar("a".repeat(2000)).length).toBe(400);
  });
});

// Respostas reais rotuladas à mão em 2026-11-18 (nomes e empresas retirados do texto). A = recusa.
describe("provavelRecusa_ — amostra rotulada", () => {
  it.each([
    "Infelizmente não conseguimos atender licitação.",
    "Informo que não produzimos o produto solicitado.",
    "Infelizmente não temos condições de atender à solicitação do termo de referência.",
    "Infelizmente nós não conseguimos atender.",
    "Neste momento não estamos assumindo novos projetos.",
    "Infelizmente não conseguimos atender as especificações dos lotes.",
    "Nossa empresa não fornece esse sistema. Agradecemos pela oportunidade.",
    "Não temos esses itens.",
    "Eu não atendo Santos",
    "Infelizmente não conseguimos contribuir com esse projeto.",
    "Não conseguimos atender esse processo.",
    "Infelizmente não consigo atender essas prerrogativas.",
    "Informamos que o material não faz parte do escopo de nossa empresa. Estamos declinando a sua consulta.",
    "Agradecemos a consulta, mas infelizmente não temos como atender por ser um material fora do nosso perfil de produção.",
    "No momento não estamos fornecendo cotações para novas contratações.",
    "Obrigado pelo convite mas não estamos participando de licitações",
    "bom dia, não é o meu ramo, de qualquer forma obrigado.",
    "Infelizmente não podemos dar andamento em sua solicitação, pois atuamos apenas em São Paulo.",
    "Bom dia! Não participamos de processos licitatórios.",
    "boa tarde não estamos fazendo estimativas, alta demanda de orçamentos",
    "Não comercializamos contratos com prazo inferior a 12 meses.",
  ])("reconhece a recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  // Os dois falsos positivos da regra antiga: interesse + pedido de prazo.
  it.each([
    "Sim, temos interesse e já estamos providenciando o orçamento, mas não será possível concluir hoje.",
    "Sim, temos interesse e estamos providenciando a cotação, mas não será possível concluir até amanhã, existe a possibilidade de extensão do prazo?",
  ])("NÃO confunde pedido de prazo com recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });

  // Estes CASARIAM a lista de recusa ("não conseguimos", "não podemos"): só a exceção os segura.
  // Sem eles a exceção ficava sem teste (a mutação que a removia não derrubava nada).
  it.each([
    "Temos interesse, mas não conseguimos enviar hoje. Existe a possibilidade de extensão do prazo?",
    "Estamos providenciando a cotação, só que não podemos concluir até amanhã.",
    "Gostaria de saber mais: não conseguimos definir o valor sem a quantidade de entrevistas.",
  ])("a exceção segura quem demonstra interesse ou pede prazo: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });

  it.each([
    "Gostaria de validar dois pontos antes de enviar a proposta: será dispensa de licitação?",
    "Por nada, eu fico à disposição!",
    "Segue em anexo a nossa proposta com os valores.",
  ])("não marca como recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });
});

describe("semCitacao_ — cabeçalhos longos e quebrados (2026-11-18)", () => {
  it("corta o 'Em … escreveu:' com mais de 100 caracteres, no meio da linha", () => {
    const corpo = "Bom dia, não temos esses itens. Em quinta-feira, 5 de março de 2026 10:00:00 GMT-3 Divisão de Compras e Licitação <compras@camarasantos.sp.gov.br> escreveu: CÂMARA MUNICIPAL DE SANTOS CNPJ: 12.345.678/0001-90 PROCESSO Nº.: 382/2026 Solicitamos, por meio deste, a gentileza de nos enviar proposta de orçamento";
    expect(semCitacao(corpo)).toBe("Bom dia, não temos esses itens. ");
  });

  it("corta o cabeçalho em inglês que quebra de linha antes de 'wrote:'", () => {
    const corpo = "Boa tarde. Por nada!\nOn set 23 2026 at 3:41 pm, Divisão de Compras e Licitação <compras@camarasantos.sp.gov.br>\nwrote: Boa Tarde, Tá ok";
    expect(semCitacao(corpo)).toBe("Boa tarde. Por nada!\n");
  });

  it("corta no bloco 'CÂMARA MUNICIPAL DE SANTOS CNPJ' mesmo sem cabeçalho reconhecível", () => {
    expect(semCitacao("Não é o meu ramo. CÂMARA MUNICIPAL DE SANTOS CNPJ: 1 PROCESSO")).toBe("Não é o meu ramo. ");
  });
});

describe("anonimizar_ — saudação e assinatura (2026-11-18)", () => {
  it("tira a saudação com nome e o bloco de contato da assinatura", () => {
    const saida = anonimizar("Olá Ana, boa tarde. Infelizmente não conseguimos atender. Maria Souza Fone/fax: 13 3202-1234 WhatsApp 13 99876-5432 Site: www.x.com.br");
    expect(saida).toBe("Infelizmente não conseguimos atender. [nome]");
    expect(saida).not.toContain("Ana");
    expect(saida).not.toMatch(/\d/);
  });
});

describe("ehInterna_", () => {
  const ehInterna = carregar<(m: { getFrom: () => string }) => boolean>("ehInterna_");
  const de = (from: string) => ({ getFrom: () => from });

  it("resposta de quem é da Câmara não é de fornecedor", () => {
    expect(ehInterna(de("Felipe <felipe@camarasantos.sp.gov.br>"))).toBe(true);
  });
  it("fornecedor externo, e domínio parecido, não são internos", () => {
    expect(ehInterna(de("Ana <ana@empresa.com.br>"))).toBe(false);
    expect(ehInterna(de("x@camarasantos.sp.gov.br.fake.com"))).toBe(false);
  });
});

describe("grupoDuvida_", () => {
  const grupo = carregar<(m: Record<string, boolean>) => string | null>("grupoDuvida_");
  const base = { vazio: false, pergunta: false, pedeInformacao: false, provavelRecusa: false, mencionaProposta: false, recebido: false };

  it("pede informação → pedeInformacao; só '?' → soPergunta; só recebimento → soRecebido", () => {
    expect(grupo({ ...base, pedeInformacao: true })).toBe("pedeInformacao");
    expect(grupo({ ...base, pergunta: true })).toBe("soPergunta");
    expect(grupo({ ...base, recebido: true })).toBe("soRecebido");
  });

  it("recusa provável vence dúvida, e texto vazio não é candidata", () => {
    expect(grupo({ ...base, pedeInformacao: true, provavelRecusa: true })).toBeNull();
    expect(grupo({ ...base, pergunta: true, vazio: true })).toBeNull();
  });

  it("recebimento que menciona proposta não entra no controle; sem sinal nenhum → null", () => {
    expect(grupo({ ...base, recebido: true, mencionaProposta: true })).toBeNull();
    expect(grupo(base)).toBeNull();
  });
});

describe("provavelRecusa_ — famílias de frase da amostra de dúvida", () => {
  const recusas = [
    "Após análise do Termo de Referência, decidimos não participar do certame.",
    "Não desejamos participar do orçamento. Obrigada.",
    "Informamos que não realizamos esse tipo de serviço. Qualquer dúvida estamos à disposição.",
    "Agradecemos a solicitação, mas não imprimimos nesse tipo de material.",
    "Agradecemos, mas não disponibilizamos o item solicitado no momento.",
    "Não temos atendimento para o serviço solicitado no endereço do TR. Não será possível realizar o envio da proposta.",
    "Esse tipo de solução não faz parte do nosso portfólio.",
    "As funcionalidades do objeto não fazem parte integralmente do nosso portfólio.",
    "Agradecemos o contato, mas sua região ainda não está na nossa área de atuação.",
    "Nossas soluções não são compatíveis com sua solicitação.",
    "A empresa atua exclusivamente com telefonia em nuvem, e não conseguiremos atender.",
  ];
  it.each(recusas)("reconhece: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  const naoRecusas = [
    "Gostaria de tirar uma dúvida: a manutenção é preventiva ou corretiva com direito a peças?",
    "Consigo participar deste processo ainda? Fico no aguardo para enviar a proposta.",
    "Confirmo o recebimento e vamos participar dentro do escopo enviado.",
    "O e-mail foi direcionado ao departamento responsável para análise e em breve retornaremos.",
    "Temos interesse em participar! Podemos agendar uma call na próxima semana?",
    "Nossas medidas são um pouco diferentes do solicitado, segue foto. Só consigo atender se aprovar até amanhã.",
    "Temos interesse sim, mas não será possível realizar o envio hoje; poderiam estender o prazo?",
  ];
  it.each(naoRecusas)("não confunde com recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });
});

describe("provavelRecusa_ — 2ª rodada (cauda longa)", () => {
  const recusas = [
    "Iremos declinar da cotação, pois não faz parte do nosso portifólio.",
    "Teremos que declinar por indisponibilidade operacional.",
    "No momento não dispomos de uma solução que atenda integralmente ao objeto.",
    "A seguradora optou por não apresentar a cotação devido ao risco.",
    "No momento não é possível participar, o valor está muito alto.",
    "Agradecemos, porém a localização fica distante da nossa rede.",
    "Não estamos conseguindo repassar cotações no momento.",
    "Os itens não fazem parte do nosso catálogo.",
    "Neste momento não será possível apresentar proposta estimativa.",
  ];
  it.each(recusas)("reconhece: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  const naoRecusas = [
    "Não estamos conseguindo abrir o anexo, favor reenviar.",
    "Acuso o recebimento; nossa equipe está analisando o Termo de Referência e retornaremos.",
    "Compra direta ou abertura de licitação?",
    "Estaremos em férias coletivas, com retorno das atividades na próxima semana.",
    "Não sou mais responsável pela área de contratos; a colega dará seguimento.",
    "Podemos declinar parte dos itens? Temos interesse nos demais.",
  ];
  it.each(naoRecusas)("não confunde com recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });
});

describe("anonimizar_ — nomes próprios", () => {
  it("troca sequência de palavras capitalizadas por [nome], mas preserva o resto da frase", () => {
    const out = anonimizar("Prezados, informamos que Maria Souza Lima não participará deste orçamento.");
    expect(out).not.toMatch(/Maria|Souza|Lima/);
    expect(out).toContain("[nome]");
    expect(out).toContain("não participará deste orçamento");
  });
});
