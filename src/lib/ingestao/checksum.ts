import { createHash } from "node:crypto";

/**
 * SHA-256 do conteúdo bruto baixado, em hexadecimal.
 *
 * Guardado em `LoteIngestao.checksum` para permitir conferir depois se dois
 * lotes da mesma competência vieram do mesmo arquivo (ou se a fonte publicou
 * uma revisão silenciosa) sem precisar re-baixar o original.
 */
export function calcularChecksumSha256(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}
