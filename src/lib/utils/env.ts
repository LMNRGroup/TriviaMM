function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "http://localhost:3000"
  );
}

export function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

export function getKvConfig() {
  return {
    url: requireEnv("KV_REST_API_URL"),
    token: requireEnv("KV_REST_API_TOKEN"),
  };
}

/** When true, never connects to Upstash (local dev). */
export function preferMemoryKv() {
  const v = process.env.KV_USE_MEMORY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getSheetsConfig() {
  return {
    spreadsheetId: requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID"),
    clientEmail: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

export function hasSheetsConfig() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
}
