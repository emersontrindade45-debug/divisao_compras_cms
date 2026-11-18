import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Funções REAIS do script (não cópias): o teste quebra se o script mudar. */
const fonte = readFileSync(join(__dirname, "..", "respostasCotacao.gs"), "utf-8");
// normalizar_ é usada por várias funções do script (mesmo escopo): vai junto em todo carregamento.
const normalizarSrc =
  /function normalizar_[\s\S]*?\n}\n/.exec(fonte)![0] + "\n" + /function semAssinatura_[\s\S]*?\n}\n/.exec(fonte)![0];
function carregar<T>(nome: string): T {
  const trecho = new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)?.[0];
  if (!trecho) throw new Error(`${nome} não encontrada no script`);
  return new Function(`${normalizarSrc}\n${trecho}; return ${nome};`)() as T;
}

const semCitacao = carregar<(c: string) => string>("semCitacao_");
// anonimizar_ depende de semCitacao_ (mesmo escopo do script): carrega as duas juntas.
const provavelRecusa = carregar<(t: string) => boolean>("provavelRecusa_");
const anonimizar = new Function(
  `${/function semCitacao_[\s\S]*?\n}\n/.exec(fonte)![0]}\n${/function anonimizar_[\s\S]*?\n}\n/.exec(fonte)![0]}; return anonimizar_;`,
)() as (c: string) => string;
// marcadoresDoTexto_ chama provavelRecusa_ (mesmo escopo do script): carrega as duas juntas.
const marcadores = new Function(
  `${normalizarSrc}\n${/function provavelRecusa_[\s\S]*?\n}\n/.exec(fonte)![0]}\n${/function marcadoresDoTexto_[\s\S]*?\n}\n/.exec(fonte)![0]}; return marcadoresDoTexto_;`,
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

describe("provavelRecusa_ — 3ª rodada (fila inteira de 2026-11-18)", () => {
  const recusas = [
    "Infelizmente não vamos conseguir atender essa solicitação neste momento.",
    "Informamos que não poderemos participar deste processo.",
    "No momento não estamos mais trabalhando com licitação.",
    "Obrigado, não tenho interesse em participar.",
    "Não há interesse em participar. Obrigado.",
    "Agradecemos, mas não iremos prosseguir no processo.",
    "Não seguiremos com o atendimento dessa demanda.",
    "Neste momento não apresentaremos proposta para o escopo descrito.",
    "Boa tarde, não há tempo hábil para entrega.",
    "Não teremos condição de atender neste momento.",
    "Informamos a desistência em participar dessa licitação.",
    "Sobre a cotação, fica inviável o atendimento em outra cidade.",
    "Nossa empresa se restringe a trabalhar só na cidade de Guarujá.",
    "Trabalhamos apenas com locação de purificador.",
    "Só trabalho com impresso em papel.",
    "Não fazemos locação, apenas venda.",
    "Deixa de atender à solicitação porque o produto não está em seu escopo de fornecimento.",
    "Os itens não fazem parte do nosso catálogo.",
    "Agradecemos, mas a solicitação não se aplica ao meu ramo de atendimento.",
    "NÃO COTADO.",
    "Olá, negativa.",
    "Informamos nossa negativa.",
    "Não terei como enviar o orçamento.",
    "Não faço manutenção nesse equipamento e não vou enviar proposta.",
    "Infelizmente não vou conseguir fazer este tipo de trabalho.",
    "Optei por não apresentar proposta comercial nesta oportunidade.",
    "Não temos disponibilidade na data informada, conte conosco em outro momento.",
    "Não operamos com o modelo de reembolso estabelecido no termo.",
    "A gente não trabalha com orçamento, veja os preços no site.",
    "Vou avaliar para uma próxima oportunidade.",
    "No momento não temos viabilidade para atender o escopo do TR.",
  ];
  it.each(recusas)("reconhece: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  const naoRecusas = [
    "Não entendi nada. Do que se trata?",
    "Estamos tentando agendar a visita mas não estamos conseguindo falar com ninguém.",
    "Tentamos contato por telefone, mas não conseguimos falar com vocês. Seria só por e-mail?",
    "No edital não ficou claro o critério de amostragem. Esse entendimento está correto?",
    "Não recebi a quantidade das cadeiras giratórias e fixas do projeto.",
    "Certidão negativa de débitos precisa ser apresentada na habilitação?",
    "Gostaria de confirmar se já analisaram a proposta que encaminhamos.",
    "Temos interesse e estamos providenciando, mas não será possível concluir hoje: há extensão do prazo?",
    "Podemos trabalhar com o modelo MDP no lugar do MDF?",
    "Atendemos com visita técnica agendada e orçamento no mesmo dia.",
  ];
  it.each(naoRecusas)("não confunde com recusa: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(false);
  });

  it("'não temos interesse' é recusa, mesmo com a guarda de 'temos interesse'", () => {
    expect(provavelRecusa("Afirmo que não temos interesse em participar.")).toBe(true);
    expect(provavelRecusa("Temos interesse em participar, mas poderia enviar o TR?")).toBe(false);
  });

  it("acento decomposto (a + til) e espaço sem quebra não escondem a recusa", () => {
    const nfd = "Afirmo que não temos interesse em participar.";
    const nbsp = "Afirmo que não temos interesse em participar.";
    expect(nfd).not.toBe(nfd.normalize("NFC"));
    expect(provavelRecusa(nfd)).toBe(true);
    expect(provavelRecusa(nbsp)).toBe(true);
  });
});

describe("provavelRecusa_ — rodapé, espaços estranhos e frases da 4ª rodada", () => {
  const recusa = "Agradecemos o contato. Infelizmente não conseguiremos atender a esta solicitação neste momento.";
  const rodape = "Atenciosamente,\nFulano\nEsta mensagem é confidencial. Se houver possibilidade de erro, poderia nos avisar? Gostaria de saber mais? Visite o site.";

  it("rodapé com 'poderia'/'possibilidade de' não desliga a recusa do começo do texto", () => {
    expect(provavelRecusa(recusa)).toBe(true);
    expect(provavelRecusa(`${recusa}\n\n${rodape}`)).toBe(true);
  });

  it("a guarda continua valendo DENTRO da resposta (antes da assinatura)", () => {
    expect(provavelRecusa("Não será possível concluir hoje, mas poderia estender o prazo? Temos interesse.\n\nAtenciosamente,\nFulano")).toBe(false);
  });

  it.each([
    ["espaço fino", "não\u2009conseguiremos atender"],
    ["espaço ideográfico", "não\u3000conseguiremos atender"],
    ["zero-width joiner", "n\u200dão conseguiremos atender"],
    ["BOM no meio", "não\ufeff conseguiremos atender"],
    ["hífen suave", "não conse\u00adguiremos atender"],
  ])("%s não esconde a recusa", (_nome, texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  const recusas = [
    "Agradecemos o contato, mas não vamos conseguir atendê-los nessa proposta.",
    "No momento não conseguiremos seguir com a participação, por se tratar de licitação.",
    "Neste momento não conseguiremos assumir novos trabalhos.",
    "Agradecemos o contato, não conseguimos a demanda solicitada.",
    "No momento não estamos disponibilizando este serviço.",
    "Neste momento, nossa atuação não contempla a solução que você procura.",
    "Nossa empresa não é operadora, portanto não reunimos condições de realizar oferta.",
  ];
  it.each(recusas)("reconhece: %s", (texto) => {
    expect(provavelRecusa(texto)).toBe(true);
  });

  it("assinatura de rodapé não vira texto da resposta (limite de 800 caracteres)", () => {
    const longo = `Bom dia. ${"Segue o detalhamento solicitado. ".repeat(40)} Infelizmente não conseguiremos atender.`;
    expect(provavelRecusa(longo)).toBe(false);
  });
});

// ── Sugestões de orçamento e dúvida ────────────────────────────────────────────
const dependencias = ["provavelRecusa_", "marcadoresDoTexto_", "provavelOrcamento_", "perguntaSemDuvida_", "sugestoesDoTexto_"]
  .map((n) => new RegExp(`function ${n}[\\s\\S]*?\\n}\\n`).exec(fonte)![0])
  .join("\n");
const sugestoes = new Function(`${normalizarSrc}\n${dependencias}; return sugestoesDoTexto_;`)() as (
  texto: string,
  ehRecusa: boolean,
) => { provavelOrcamento: boolean; provavelDuvida: boolean };
const orcamento = (t: string) => sugestoes(t, false).provavelOrcamento;
const duvida = (t: string) => sugestoes(t, false).provavelDuvida;

describe("provavelOrcamento_", () => {
  it.each([
    "Segue orçamento. Qualquer dúvida pode me chamar.",
    "Olá, bom dia, segue cotação em anexo.",
    "Segue proposta em anexo.",
    "Segue em anexo o orçamento solicitado. Estamos à disposição.",
    "Segue a proposta anexa. Fico no aguardo do resultado.",
  ])("reconhece: %s", (texto) => {
    expect(orcamento(texto)).toBe(true);
  });

  it.each([
    "Segue em anexo foto exatamente como é, incluindo o estojo. Você já tem a arte pronta?",
    "Segue conforme solicitado o detalhamento do item do termo de referência.",
    "Segue para conhecimento.",
    "Gostaria de confirmar se você já analisou a proposta que encaminhamos.",
    "Encaminhei um orçamento e gostaria de verificar uma posição sobre o mesmo.",
    "Segue em anexo a nota fiscal solicitada.",
    // Definição do usuário (2026-11-18, caso Pirow): confirmar valor de proposta JÁ enviada é
    // conversa, não orçamento — só o corpo que diz "estou enviando" ou o PDF contam.
    "Valores mantidos.",
    "Sim, os valores estão corretos. A diferença se deve às marcas.",
    "Confirmamos que a proposta comercial apresentada a esse órgão em outubro. permanece válida nas mesmas condições.",
  ])("não confunde com orçamento: %s", (texto) => {
    expect(orcamento(texto)).toBe(false);
  });

  it("com recusa provável, nenhuma sugestão sai (recusa vence)", () => {
    const r = sugestoes("Segue proposta em anexo? não temos interesse", true);
    expect(r).toEqual({ provavelOrcamento: false, provavelDuvida: false });
  });
});

describe("provavelDuvida (via sugestoesDoTexto_)", () => {
  it.each([
    "Compra direta ou abertura de processo licitatório?",
    "Compra direta?",
    "Pregão eletrônico?",
    "O que seria o material a ser orçado?",
    "Tem alguma faixa de horário que irá operar?",
    "Poderiam esclarecer o item 3 do termo de referência, é para instalação completa?",
    "Esse orçamento seria para formar preço de licitação ou é uma compra direta?",
  ])("reconhece: %s", (texto) => {
    expect(duvida(texto)).toBe(true);
  });

  it.each([
    ["cobrança de retorno", "Boa tarde! Alguma posição sobre o orçamento?"],
    ["cobrança de retorno (previsão)", "Você teria uma previsão da resposta da licitação?"],
    ["cobrança de retorno (andamento)", "Pode me informar o andamento do processo?"],
    ["pesquisa de satisfação", "Compartilhe conosco sua experiência. Você está satisfeito com o atendimento?"],
    ["canal automático", "Este canal é exclusivo para suporte técnico. Quer falar de vendas?"],
    ["sem pergunta", "Obrigado, vamos analisar e retornamos."],
    ["só sublinhados", "________________________________?"],
    ["pergunta sem conteúdo", "ok ?"],
  ])("não é dúvida: %s", (_nome, texto) => {
    expect(duvida(texto)).toBe(false);
  });

  it("orçamento vence dúvida: quem entrega a proposta e pergunta algo continua sendo orçamento", () => {
    const r = sugestoes("Segue proposta em anexo. Qualquer ajuste, precisa de mais alguma coisa?", false);
    expect(r).toEqual({ provavelOrcamento: true, provavelDuvida: false });
  });

  it("com recusa provável, não é dúvida", () => {
    expect(sugestoes("Infelizmente não conseguimos atender. Posso ajudar em outra coisa?", true).provavelDuvida).toBe(false);
  });
});

describe("marcadoresDoTexto_.vazio", () => {
  it("só sublinhados, traços, asteriscos e pontos contam como vazio", () => {
    expect(marcadores("________________________________").vazio).toBe(true);
    expect(marcadores("-----  *****  .....  =====").vazio).toBe(true);
    expect(marcadores("Compra direta?").vazio).toBe(true); // < 20 caracteres úteis, como antes
    expect(marcadores("Qual é o prazo de entrega previsto?").vazio).toBe(false);
  });
});

// ── Anexo que conta como orçamento: só PDF (decisão do usuário, 2026-11-18) ────
const extensoesOrcamento = new Function(
  `${/var EXTENSOES_ORCAMENTO = [^;]+;/.exec(fonte)![0]}; return EXTENSOES_ORCAMENTO;`,
)() as RegExp;

describe("EXTENSOES_ORCAMENTO", () => {
  it.each(["Orcamento Pirow.pdf", "PROPOSTA.PDF"])("PDF conta como orçamento: %s", (nome) => {
    expect(extensoesOrcamento.test(nome)).toBe(true);
  });

  // O Word é o modelo que a Divisão envia para o fornecedor preencher; o orçamento volta em PDF.
  it.each(["modelo de orçamento.docx", "modelo.doc", "planilha.xlsx", "planilha.xls", "proposta.ods", "foto.jpg", "pdf.zip", "relatorio.pdf.exe"])(
    "não conta como orçamento: %s",
    (nome) => {
      expect(extensoesOrcamento.test(nome)).toBe(false);
    },
  );
});

// ── Texto para a IA: anonimização, conversa do fio e autor (2026-11-18) ────────
const trechoDe = (nome: string) => new RegExp(`function ${nome}[\\s\\S]*?\\n}\\n`).exec(fonte)![0];
const caixaSrc = /var CAIXA_ESPERADA = [^;]+;/.exec(fonte)![0];
const paraIa = new Function(
  `${trechoDe("semCitacao_")}\n${trechoDe("anonimizarParaIa_")}; return anonimizarParaIa_;`,
)() as (corpo: string, limite: number) => string;
const fioSrc = new Function(
  `${caixaSrc}\n${trechoDe("enderecos_")}\n${trechoDe("semCitacao_")}\n${trechoDe("anonimizarParaIa_")}\n${trechoDe("autorDoFio_")}\n${trechoDe("contextoDoFio_")}
   var LIMITE_CONTEXTO_IA = 600; return { autor: autorDoFio_, contexto: contextoDoFio_ };`,
)() as {
  autor: (m: { getFrom: () => string }) => string;
  contexto: (ms: Array<{ getFrom: () => string; getPlainBody: () => string }>) => Array<{ autor: string; texto: string }>;
};
const msg = (de: string, corpo: string) => ({ getFrom: () => de, getPlainBody: () => corpo });

describe("anonimizarParaIa_", () => {
  it("preserva o que a IA precisa para ler uma dúvida: modalidade, item, quantidade, data e marcas", () => {
    expect(paraIa("Compra Direta ou Pregão Eletrônico?", 1500)).toBe("Compra Direta ou Pregão Eletrônico?");
    expect(paraIa("Podem confirmar o Item 2, 250 unidades, entrega até 30/10, marca Samsung?", 1500)).toBe(
      "Podem confirmar o Item 2, 250 unidades, entrega até 30/10, marca Samsung?",
    );
  });

  it("mascara o que identifica ou vale dinheiro: e-mail, telefone, CNPJ, CPF, link e valor em R$", () => {
    const out = paraIa(
      "Fale com joao@acme.com.br ou (13) 99999-8888. CNPJ 12.345.678/0001-90, CPF 123.456.789-09, https://acme.com.br/p. Total R$ 1.234,56.",
      1500,
    );
    expect(out).toContain("[email]");
    expect(out).toContain("[tel]");
    expect(out).toContain("[link]");
    expect(out).toContain("[valor]");
    expect(out).not.toMatch(/joao@|99999|12\.345|123\.456|acme\.com|1\.234/);
  });

  it("corta a parte citada e a assinatura, e tira o nome da saudação", () => {
    const corpo = "Olá Ana, boa tarde.\n\nSim, os valores estão corretos.\n\nAtenciosamente,\nJoão Silva\n\nDe: Divisão de Compras\nAssunto: Re: Solicitação";
    expect(paraIa(corpo, 1500)).toBe("Sim, os valores estão corretos.");
  });

  it("respeita o limite de tamanho", () => {
    expect(paraIa("palavra ".repeat(500), 100).length).toBeLessThanOrEqual(100);
  });
});

describe("contextoDoFio_ e autorDoFio_", () => {
  it("classifica o autor: a caixa e qualquer @camarasantos são Câmara; o resto é fornecedor", () => {
    expect(fioSrc.autor(msg("Divisão <compras@camarasantos.sp.gov.br>", ""))).toBe("camara");
    expect(fioSrc.autor(msg("Douglas <douglas@camarasantos.sp.gov.br>", ""))).toBe("camara");
    expect(fioSrc.autor(msg("Contato <contato@pirow.com.br>", ""))).toBe("fornecedor");
  });

  it("devolve só as 3 últimas, da mais antiga à mais recente, com autor e texto anonimizado", () => {
    const fio = [
      msg("a@forn.com.br", "primeira"),
      msg("compras@camarasantos.sp.gov.br", "segunda, fale com x@y.com"),
      msg("a@forn.com.br", "terceira"),
      msg("compras@camarasantos.sp.gov.br", "quarta"),
    ];
    expect(fioSrc.contexto(fio)).toEqual([
      { autor: "camara", texto: "segunda, fale com [email]" },
      { autor: "fornecedor", texto: "terceira" },
      { autor: "camara", texto: "quarta" },
    ]);
  });

  it("pula mensagem sem texto e aceita fio sem anteriores", () => {
    expect(fioSrc.contexto([msg("a@forn.com.br", "   "), msg("compras@camarasantos.sp.gov.br", "pergunta")])).toEqual([
      { autor: "camara", texto: "pergunta" },
    ]);
    expect(fioSrc.contexto([])).toEqual([]);
    expect(fioSrc.contexto(undefined as never)).toEqual([]);
  });
});
