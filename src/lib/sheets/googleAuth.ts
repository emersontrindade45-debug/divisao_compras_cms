// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): o script
// `scripts/escrever-fornecedores-planilha.ts` autentica a service account fora
// do bundler do Next, onde `server-only` sempre lança. Não é alcançável a
// partir de `components/` — só por `preencherPrecosPublicos` (que mantém o
// marcador) e pelo script administrativo.
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

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuthClient() });
}
