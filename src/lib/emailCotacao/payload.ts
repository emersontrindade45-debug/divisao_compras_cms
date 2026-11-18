import { z } from "zod";

/**
 * Contrato do que o script do Google (scripts/apps-script/respostasCotacao.gs) devolve ao
 * sistema (M30.d). Validado com Zod ANTES de qualquer uso (CLAUDE.md §9.12).
 *
 * Atualização 2026-11-18: o usuário liberou IA sobre o corpo das respostas (os e-mails não trazem
 * valor de proposta), por isso existe o campo `trecho` — único texto livre aceito, anonimizado.
 *
 * `.strict()` em todos os objetos é uma trava de SIGILO, não só de formato: se o script um dia
 * passar a devolver assunto, corpo ou qualquer campo fora da lista combinada, a leitura inteira
 * é rejeitada em vez de o dado entrar no sistema. Os tamanhos máximos servem ao mesmo fim — o
 * campo `processo`, por exemplo, só aceita dígitos, então não consegue carregar texto livre.
 */

const instante = z.string().datetime();
const idGmail = z.string().min(1).max(64);
const endereco = z.string().min(3).max(320);
const numeroProcesso = z.string().regex(/^\d{1,7}$/);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const envioSchema = z
  .object({
    id: idGmail,
    fio: idGmail,
    data: instante,
    destinatarios: z.array(endereco).max(5000),
    processo: numeroProcesso.nullable(),
    prazo: dataIso.nullable(),
    prazoOrigem: z.enum(["assunto", "corpo"]).nullable(),
  })
  .strict();

const respostaSchema = z
  .object({
    id: idGmail,
    fio: idGmail,
    envioId: idGmail.nullable(),
    data: instante,
    remetente: endereco,
    processo: numeroProcesso.nullable(),
    remetenteEraDestinatario: z.boolean(),
    devolucao: z.boolean(),
    enderecosDevolvidos: z.array(endereco).max(100),
    automatica: z.boolean(),
    temAnexoOrcamento: z.boolean(),
    contemRecusa: z.boolean(),
    contemValor: z.boolean(),
    /** Frase de recusa fora da lista fixa (script `corpo-3`). Opcional: o script antigo não manda. */
    provavelRecusa: z.boolean().optional(),
    /** "Segue orçamento/proposta em anexo" no corpo (script posterior ao `corpo-3`). Só SUGERE. */
    provavelOrcamento: z.boolean().optional(),
    /** Pergunta do fornecedor, sem ser recusa, cobrança de retorno nem orçamento. Só SUGERE. */
    provavelDuvida: z.boolean().optional(),
    /**
     * Texto da mensagem JÁ ANONIMIZADO pelo script (sem e-mail, telefone, CNPJ/CPF, links e valores
     * em R$; até 1500 caracteres), só para a IA classificar. Vive em memória durante a leitura: o
     * sistema nunca o grava (a `sincronizar` o descarta depois da chamada) e o Sentry ignora o módulo.
     */
    trecho: z.string().max(1600).optional(),
    /**
     * As mensagens ANTERIORES do mesmo fio (até 3, da mais antiga à mais recente), anonimizadas do
     * mesmo jeito. Sem elas a IA não distingue um orçamento novo de uma resposta a uma pergunta da
     * Câmara sobre um orçamento já enviado. Mesmo tratamento do `trecho`: só em memória.
     */
    contexto: z
      .array(z.object({ autor: z.enum(["camara", "fornecedor"]), texto: z.string().max(700) }).strict())
      .max(3)
      .optional(),
    /** Quantos anexos PDF e de outro tipo vieram. Só a contagem: nome e conteúdo nunca saem. */
    anexosPdf: z.number().int().min(0).max(50).optional(),
    anexosOutros: z.number().int().min(0).max(50).optional(),
  })
  .strict();

const diagnosticoSchema = z
  .object({
    versao: z.string().max(40),
    contaEfetiva: z.string().max(320),
    contaAtiva: z.string().max(320),
    fiosEncontrados: z.number().int().nonnegative(),
    /** Havia mais fios que o teto da leitura: a fatia precisa ser menor. */
    fiosTruncados: z.boolean().optional(),
  })
  .strict();

export const payloadScriptSchema = z
  .object({
    envios: z.array(envioSchema).max(1000),
    respostas: z.array(respostaSchema).max(10000),
    diagnostico: diagnosticoSchema.optional(),
  })
  .strict();

export type PayloadScript = z.infer<typeof payloadScriptSchema>;
export type EnvioScript = PayloadScript["envios"][number];
export type RespostaScript = PayloadScript["respostas"][number];
