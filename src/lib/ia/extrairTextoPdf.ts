import "server-only";
import { PDFParse } from "pdf-parse";

/**
 * Extrai o texto integral de um PDF sem passar por IA. Usado para o Termo de
 * Referência (`Processo.trContexto`): extração via prompt de IA em campos fixos
 * (tabela de itens / modelo de execução / materiais) falhava silenciosamente em
 * TRs de serviço contínuo (ex.: processo 908/2022), cuja estrutura de seções não
 * bate com a nomenclatura esperada — a IA retornava string vazia exatamente como
 * instruído para "seção não encontrada". Texto bruto elimina essa classe de erro:
 * nada é descartado por não casar com um título de seção esperado.
 */
export async function extrairTextoPdf(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    // pageJoiner vazio remove o marcador "-- N of M --" que a lib insere por padrão
    // entre páginas — ruído para o assistente, que não precisa de paginação do PDF.
    const resultado = await parser.getText({ pageJoiner: "" });
    return resultado.text.trim();
  } finally {
    await parser.destroy();
  }
}
