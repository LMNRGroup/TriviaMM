import { readFileSync } from "node:fs";

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

function readServiceAccountCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (parsed.client_email && parsed.private_key) {
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      };
    }
  } catch {
    // treat as file path below
  }

  try {
    const file = readFileSync(raw, "utf8");
    const parsed = JSON.parse(file) as { client_email?: string; private_key?: string };

    if (parsed.client_email && parsed.private_key) {
      return {
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function getSheetsConfig() {
  const credentialFromJson = readServiceAccountCredentials();

  return {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null,
    spreadsheetIds: {
      players: process.env.GOOGLE_SHEETS_PLAYERS_SPREADSHEET_ID?.trim() || null,
      questions: process.env.GOOGLE_SHEETS_QUESTIONS_SPREADSHEET_ID?.trim() || null,
      matches: process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID?.trim() || null,
      matchAnswers: process.env.GOOGLE_SHEETS_MATCH_ANSWERS_SPREADSHEET_ID?.trim() || null,
      leaderboard: process.env.GOOGLE_SHEETS_LEADERBOARD_SPREADSHEET_ID?.trim() || null,
      leaderboardSnapshots: process.env.GOOGLE_SHEETS_LEADERBOARD_SNAPSHOTS_SPREADSHEET_ID?.trim() || null,
    },
    clientEmail: credentialFromJson?.clientEmail || requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: credentialFromJson?.privateKey || requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

export function hasSheetsConfig() {
  const hasCredentialJson = Boolean(readServiceAccountCredentials());
  const hasLegacyCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  const hasSingleSpreadsheet = Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim());
  const hasSplitSpreadsheets = Boolean(
    process.env.GOOGLE_SHEETS_PLAYERS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_QUESTIONS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_MATCH_ANSWERS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_LEADERBOARD_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_LEADERBOARD_SNAPSHOTS_SPREADSHEET_ID?.trim(),
  );

  return Boolean(
    (hasCredentialJson || hasLegacyCreds) &&
      (hasSingleSpreadsheet || hasSplitSpreadsheets),
  );
}
