import "server-only";
import { google } from "googleapis";

let authClient: InstanceType<typeof google.auth.JWT> | null = null;

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY não configurada.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (erro) {
    throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY não é um JSON válido.", { cause: erro });
  }

  const { client_email, private_key } = parsed as { client_email?: string; private_key?: string };
  if (!client_email || !private_key) {
    throw new Error(
      "GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY não contém client_email/private_key esperados.",
    );
  }

  return { client_email, private_key };
}

export function getGoogleAuthClient(): InstanceType<typeof google.auth.JWT> {
  if (!authClient) {
    const { client_email, private_key } = getServiceAccountCredentials();
    authClient = new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });
  }
  return authClient;
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuthClient() });
}

/**
 * Lê uma aba inteira via API autenticada (`values.get`), devolvendo `string[][]`
 * no mesmo formato de `parseCsv` — usar no lugar do endpoint público
 * `gviz/tq?tqx=out:csv` quando o caller já tem (ou vai precisar de) um cliente
 * autenticado: o `gviz` depende de cache do lado do Google que pode servir
 * conteúdo obsoleto/corrompido por tempo indeterminado mesmo com a planilha
 * pública e correta (medido em produção 2026-08-21 — API autenticada e `gviz`
 * discordavam sobre o mesmo range, planilha confirmada correta pelo dono).
 * Célula ausente vira `""`, nunca `undefined` — mesma garantia do parser CSV.
 */
export async function lerAbaAutenticado(
  spreadsheetId: string,
  abaTitulo: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${abaTitulo}'`,
  });
  const linhas = res.data.values ?? [];
  const largura = linhas.reduce((max, linha) => Math.max(max, linha.length), 0);
  return linhas.map((linha) =>
    Array.from({ length: largura }, (_, i) => String(linha[i] ?? "")),
  );
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuthClient() });
}
