import * as dotenv from "dotenv";

dotenv.config();

import { OpenAIProvider } from "../src/lib/ia/openaiProvider";
import { rankearCandidatos } from "../src/lib/similaridade/rankearCandidatos";
import type { CandidatoSimilaridade, ItemExtraidoTR } from "../src/lib/ia/types";

/**
 * Mede o custo real de `rankearCandidatos` no tamanho de lote que o assistente
 * usaria (25 candidatos), para decidir se ele cabe no `ORCAMENTO_TEMPO_TURNO_MS`
 * (35s) junto de uma busca que já leva 10–22s.
 *
 * CLAUDE.md §9.67: medir antes de propor. A hipótese "cabe em 2–4s" é plausível
 * e não vale nada até alguém cronometrar contra a API real.
 *
 *   npx tsx --conditions=react-server scripts/medir-ranking-ia.ts
 */

const itemTR: ItemExtraidoTR = {
  descricao:
    "Serviços de telecomunicações de 01 (um) link dedicado de acesso à internet com " +
    "velocidade mínima de 900 Mbps",
  especificacaoTecnica:
    "Link dedicado, full duplex, com SLA e disponibilidade mínima de 99%, em conformidade " +
    "com as concessões outorgadas pela ANATEL.",
  unidade: "unidade",
  quantidade: 12,
};

/** Mistura realista: aderentes, vizinhos de categoria e ruído — como a busca devolve. */
const DESCRICOES = [
  "Serviço de link de internet dedicado via fibra óptica – 900 Mbps SEINFRA",
  "Serviço de link de internet dedicado via fibra óptica – 300 Mbps GCM",
  "LINK DE INTERNET POR FIBRA ÓTICA DOW 900 MBPS UP 300 MBPS PARA ATENDER AS ESCOLAS",
  "ACESSO INTERNET - LINK DEDICADO 600 MBPS.",
  "LINK SIMÉTRICO FIBRA (FTTP) 200 MBPS DOWNLOAD/ 200 MBPS UPLOAD SEDE PREFEITURA",
  "Link Dedicado de Internet de Redundância com velocidade nominal de até 300 Mbps",
  "Prestação de serviços de fornecimento de link dedicado de internet via fibra",
  "CENTRO DE SAÚDE - Acesso à Internet com link dedicado de 300 Mbps",
  "SWITCH DE 24 PORTAS POE - COM SUPORTE A POE+ E PORTAS SFP+ PARA FIBRA ÓPTICA",
  "SWITCH DE 48 PORTAS POE - DEVE POSSUIR 48 PORTAS RJ45",
  "ROTEADOR ACCESS POINT INDOOR, COM TECNOLOGIA WAVE 2",
  "FUSAO FIBRA OPTICA",
  "IMPRESSORA LASER MONOCROMATICA",
  "Impressora Multifuncional Colorida com Tanque de Tinta, Wi-Fi e USB",
  "LICENÇA MICROSOFT WINDOWS 10 e 11 PRO 32 / 64 BITS ESD",
  "DOBRADIÇA SUPERIOR PARA PORTA DE VIDRO TEMPERADO",
  "CABO DE REDE UTP CAT6 CAIXA COM 305 METROS",
  "NOBREAK 1500VA BIVOLT COM BATERIA INTERNA",
  "SERVIÇO DE TELEFONIA MÓVEL PESSOAL - PLANO CORPORATIVO",
  "SERVIÇO DE INTERNET BANDA LARGA 500 MBPS RESIDENCIAL",
  "MANUTENÇÃO PREVENTIVA E CORRETIVA DE REDE LÓGICA",
  "PATCH PANEL 24 PORTAS CAT6",
  "RACK 19 POLEGADAS 44U PARA DATACENTER",
  "SERVIÇO DE LINK DEDICADO 1 GBPS COM IP FIXO",
  "TRANSCEIVER SFP+ 10GB MONOMODO",
];

function candidato(fonteDescricao: string, i: number): CandidatoSimilaridade {
  return {
    tipoCandidato: "contratacao_publica",
    fonteDescricao,
    fonteOrgaoOuId: `Órgão ${i}`,
    fonteUrl: `https://pncp.gov.br/app/editais/000/2025/${i}`,
    valorUnitario: 500 + i * 37,
    dataReferencia: new Date(),
    unidade: "MES",
    quantidade: 12,
  };
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY ausente no .env — sem ela não há o que medir.");
  }
  const provedor = new OpenAIProvider();
  const candidatos = DESCRICOES.map(candidato);

  // Custo por tamanho de lote: é o que decide se dá para caber no turno.
  for (const n of [5, 8, 12]) {
    const lote = candidatos.slice(0, n);
    const inicio = Date.now();
    try {
      const ranqueados = await rankearCandidatos(itemTR, lote, provedor, "servico_continuo");
      console.log(
        `${String(n).padStart(2)} candidatos -> ${Date.now() - inicio}ms | ${ranqueados.length} passaram`,
      );
    } catch (err) {
      console.log(
        `${String(n).padStart(2)} candidatos -> ${Date.now() - inicio}ms | FALHOU: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // Lotes pequenos EM PARALELO: se o custo é dominado pela geração de tokens de
  // saída (um objeto por candidato), dividir em N chamadas simultâneas deve
  // custar ~o tempo da maior, não a soma.
  const inicio = Date.now();
  const lotes = [candidatos.slice(0, 8), candidatos.slice(8, 16), candidatos.slice(16, 25)];
  const partes = await Promise.all(
    lotes.map((lote) => rankearCandidatos(itemTR, lote, provedor, "servico_continuo")),
  );
  const total = partes.flat().sort((a, b) => b.scoreFinal - a.scoreFinal);
  console.log(
    `\n25 candidatos em 3 lotes PARALELOS -> ${Date.now() - inicio}ms | ${total.length} passaram`,
  );
  for (const r of total.slice(0, 6)) {
    console.log(
      `     ${String(r.scoreFinal).padStart(5)}  ${r.candidato.fonteDescricao.slice(0, 62)}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
