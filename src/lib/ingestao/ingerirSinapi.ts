import "server-only";
import { executarIngestao, type ResumoIngestao } from "./runner";
import { garantirFonteSinapi } from "./fontesSinapi";
import {
  detectarZeramentoEmMassa,
  normalizarLinhaSinapi,
  parsearLinhasSinapi,
  validarCabecalhoSinapi,
  type LinhaSinapiComposicaoSintetico,
  type RegimeSinapi,
} from "./sinapi";

/**
 * Orquestra a ingestão de um relatório de Composições Sintético do SINAPI já
 * em memória — liga `fontesSinapi.ts` (cadastro da fonte) + `sinapi.ts`
 * (parser e guardas) + `runner.ts` (auditoria/gravação genérica).
 *
 * **Upload manual, não download automático.** O WAF da Caixa
 * (`caixa.gov.br`) bloqueia requisição automatizada mesmo com headers de
 * navegador completos — confirmado nesta sessão, `429` persistente com
 * `curl` usando user-agent e cookies de sessão (docs/ApiPlan-M17-spike.md
 * §4, "risco residual"). Diferente do runner genérico, que assume
 * `baixar(): Promise<...>` fazendo `fetch` de uma URL — aqui o `conteudo` já
 * chega pronto (rota administrativa recebe o arquivo por upload, ver
 * `/api/admin/ingerir-sinapi/route.ts`), e `baixar()` só embrulha o Buffer
 * já recebido no formato que `executarIngestao` espera.
 *
 * A competência não é parâmetro de quem chama — é **extraída do próprio
 * arquivo** (cabeçalho de contexto, linha 3), porque é a fonte de verdade;
 * pedir para o operador digitar a competência manualmente arriscaria
 * divergência entre o nome do arquivo e o conteúdo. Extraída antes de montar
 * `ConfigIngestao` porque o runner genérico exige `competencia` como campo
 * fixo da config, não algo descoberto durante o parse.
 */

export interface OpcoesIngerirSinapi {
  conteudo: Buffer;
  regime: RegimeSinapi;
}

/** Só o necessário para descobrir a competência antes de montar a config do runner. */
function extrairCompetenciaOuNull(conteudo: Buffer): string | null {
  try {
    const linhas = parsearLinhasSinapi(conteudo);
    return linhas[0]?.competencia ?? null;
  } catch {
    return null;
  }
}

export async function ingerirSinapi(opcoes: OpcoesIngerirSinapi): Promise<ResumoIngestao> {
  await garantirFonteSinapi();

  // O cabeçalho pode estar corrompido a ponto de nem `parsearLinhasSinapi`
  // funcionar (ex.: cabeçalho de contexto sem "DATA DE PREÇO"). Nesse caso a
  // competência cai para "desconhecida" e é `validarCabecalhoSinapi` —
  // chamado pelo runner logo em seguida, antes de qualquer parse de linha —
  // quem rejeita o lote com o motivo real.
  const competencia = extrairCompetenciaOuNull(opcoes.conteudo) ?? "desconhecida";

  return executarIngestao<LinhaSinapiComposicaoSintetico>({
    fonteChave: "sinapi",
    competencia,
    baixar: async () => ({
      conteudo: opcoes.conteudo,
      urlArquivo: "upload-manual://sinapi-composicoes-sintetico",
    }),
    validarCabecalho: validarCabecalhoSinapi,
    parsearLinhas: parsearLinhasSinapi,
    validarLinhas: (linhas) => {
      const deteccao = detectarZeramentoEmMassa(linhas);
      if (deteccao.suspeito) {
        return {
          valido: false,
          motivo:
            `Lote suspeito de zeramento em massa: ${deteccao.linhasZeradas} de ` +
            `${deteccao.totalLinhas} linhas (${(deteccao.proporcao * 100).toFixed(0)}%) com ` +
            "custo total inválido ou não positivo. Precedente real: SINAPI out-nov/2025 " +
            "(Nota 12/2025 nº 01, falha de envio do IBGE). Confirmar com a Caixa antes de reingerir.",
        };
      }
      return { valido: true };
    },
    normalizarLinha: (linha) => normalizarLinhaSinapi(linha, opcoes.regime),
  });
}
