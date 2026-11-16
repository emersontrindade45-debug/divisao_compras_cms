/**
 * Liga o remetente de uma resposta a um fornecedor consultado no envio (M30.d, decisão Q48).
 *
 * 1. Mesmo endereço a quem a solicitação foi enviada → ligação exata.
 * 2. Outro endereço do MESMO domínio, desde que um único destinatário do envio use esse domínio
 *    (joao@acme.com.br responde por vendas@acme.com.br).
 * 3. Qualquer outro caso vai para a fila "a confirmar" — domínio genérico (gmail, hotmail…)
 *    identifica provedor, não empresa; domínio com mais de um candidato é ambíguo.
 *
 * O remetente completo NUNCA sai daqui para o banco (Q28): só o domínio é guardado na fila.
 */

export const DOMINIOS_GENERICOS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "ymail.com",
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com",
  "r7.com", "zipmail.com.br", "oi.com.br", "icloud.com", "me.com", "protonmail.com", "proton.me",
]);

export type MotivoFila = "dominio_generico" | "dominio_ambiguo" | "remetente_desconhecido";

export type LigacaoRemetente =
  | { tipo: "exato"; email: string }
  | { tipo: "dominio"; email: string }
  | { tipo: "fila"; motivo: MotivoFila };

export function dominioDe(email: string): string {
  const i = email.lastIndexOf("@");
  return i === -1 ? "" : email.slice(i + 1).trim().toLowerCase();
}

export function ligarRemetente(remetente: string, destinatarios: string[]): LigacaoRemetente {
  const origem = remetente.trim().toLowerCase();
  const alvos = destinatarios.map((d) => d.trim().toLowerCase());

  if (alvos.includes(origem)) return { tipo: "exato", email: origem };

  const dominio = dominioDe(origem);
  if (!dominio) return { tipo: "fila", motivo: "remetente_desconhecido" };
  if (DOMINIOS_GENERICOS.has(dominio)) return { tipo: "fila", motivo: "dominio_generico" };

  const candidatos = [...new Set(alvos.filter((d) => dominioDe(d) === dominio))];
  if (candidatos.length === 1) return { tipo: "dominio", email: candidatos[0]! };
  return { tipo: "fila", motivo: candidatos.length > 1 ? "dominio_ambiguo" : "remetente_desconhecido" };
}
