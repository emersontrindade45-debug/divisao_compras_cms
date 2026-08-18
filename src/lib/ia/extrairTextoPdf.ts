import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extrai o texto integral de um PDF sem passar por IA. Usado para o Termo de
 * Referência (`Processo.trContexto`): extração via prompt de IA em campos fixos
 * (tabela de itens / modelo de execução / materiais) falhava silenciosamente em
 * TRs de serviço contínuo (ex.: processo 908/2022), cuja estrutura de seções não
 * bate com a nomenclatura esperada — a IA retornava string vazia exatamente como
 * instruído para "seção não encontrada". Texto bruto elimina essa classe de erro:
 * nada é descartado por não casar com um título de seção esperado.
 *
 * `unpdf` (não `pdf-parse`) é deliberado: `pdf-parse` importa o build `legacy`
 * de `pdfjs-dist`, que arrasta um renderer de canvas inteiro e referencia
 * `DOMMatrix` na avaliação do módulo — quebra com `ReferenceError: DOMMatrix
 * is not defined` em runtime Node serverless (sem DOM), mesmo só usando
 * extração de texto. `unpdf` é feito para rodar em runtimes serverless
 * (Vercel/Workers) e só carrega dependência de canvas (`@napi-rs/canvas`,
 * peer opcional) se as funções de imagem/renderização forem chamadas — não é
 * o caso aqui.
 */
export async function extrairTextoPdf(pdfBuffer: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text } = await extractText(documento, { mergePages: true });
  return text.trim();
}
