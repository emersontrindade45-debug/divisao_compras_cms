/**
 * Escrita de volta na planilha do Google Sheets (write-back).
 *
 * STUB — NÃO IMPLEMENTADO.
 *
 * `carregarPlanilha` (ver `./googleSheets.ts`) lê planilhas públicas via o
 * endpoint `gviz/tq?tqx=out:csv`, sem autenticação. Esse caminho é só leitura.
 * Para escrever de volta (preencher preços encontrados pela pesquisa de
 * similaridade diretamente na planilha de origem) é necessário autenticar
 * como Service Account e usar `sheets.spreadsheets.values.update` da
 * biblioteca `googleapis` (dependência já instalada via `pnpm add googleapis`
 * neste commit).
 *
 * Por que isso ainda não está implementado:
 * - O mapeamento exato de colunas (qual coluna recebe qual preço, como
 *   identificar a linha do item, como tratar células mescladas) depende da
 *   estrutura real da planilha em produção — a mesma estrutura que hoje é
 *   inferida heuristicamente na leitura (ver `parsePlanilha.ts`, que se
 *   ancora no cabeçalho "MATERIAL" por causa de células mescladas).
 *   Escrever de volta exige confirmar essa estrutura com quem mantém a
 *   planilha; não é seguro adivinhar.
 * - Não há, neste ambiente, uma planilha real nem a credencial
 *   `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` configurada para validar o caminho de
 *   escrita. Não existe forma segura de fazer TDD de uma chamada de escrita
 *   contra a API do Google Sheets sem credenciais e uma planilha de teste
 *   reais — uma implementação "no escuro" arriscaria sobrescrever dados
 *   reais de forma incorreta.
 *
 * Esta função existe apenas para documentar a assinatura/intenção e deixar a
 * dependência pronta. Ela NÃO deve ser chamada em produção: lança erro
 * explicando o que falta. Nada neste código-base importa esta função ainda.
 */

export interface AtualizacaoCelula {
  /** Número da linha na planilha (1-based, como exibido no Google Sheets). */
  linha: number;
  /** Número da coluna na planilha (1-based, como exibido no Google Sheets). */
  coluna: number;
  valor: string | number;
}

/**
 * Atualiza células da planilha de origem (write-back).
 *
 * @param spreadsheetId ID da planilha (ver `extrairSpreadsheetId` em `./googleSheets.ts`).
 * @param gid Identificador da aba (ver o conceito de `gid` em `carregarPlanilha`).
 * @param atualizacoes Lista de células a atualizar.
 *
 * @throws Always — não implementado. Ver comentário do arquivo.
 */
export async function atualizarPlanilha(
  spreadsheetId: string,
  gid: string,
  atualizacoes: AtualizacaoCelula[],
): Promise<void> {
  void spreadsheetId;
  void gid;
  void atualizacoes;

  throw new Error(
    "atualizarPlanilha() não está implementada. Escrita de volta no Google Sheets requer: " +
      "(1) a variável de ambiente GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY configurada com as " +
      "credenciais de uma Service Account com permissão de edição na planilha; e " +
      "(2) confirmar o mapeamento real de colunas/linhas com uma planilha de produção " +
      "antes de implementar a chamada a sheets.spreadsheets.values.update (googleapis). " +
      "Nenhuma dessas duas condições está disponível neste momento — ver comentário no " +
      "topo de src/lib/sheets/atualizarPlanilha.ts.",
  );
}
