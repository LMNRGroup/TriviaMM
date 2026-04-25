import { google, type sheets_v4 } from "googleapis";
import { getSheetsConfig } from "@/lib/utils/env";

export type SheetResourceKey =
  | "players"
  | "questions"
  | "matches"
  | "matchAnswers"
  | "leaderboard"
  | "leaderboardSnapshots";

let sheetsClient: sheets_v4.Sheets | null = null;
const worksheetTitleCache = new Map<string, string>();

export function getSpreadsheetId(resource: SheetResourceKey) {
  const config = getSheetsConfig();

  if (config.spreadsheetId) {
    return config.spreadsheetId;
  }

  const spreadsheetId = config.spreadsheetIds[resource];

  if (!spreadsheetId) {
    throw new Error(`Missing spreadsheet ID for resource: ${resource}`);
  }

  return spreadsheetId;
}

export function getSheetsClient() {
  if (!sheetsClient) {
    const config = getSheetsConfig();
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheetsClient = google.sheets({
      version: "v4",
      auth,
    });
  }

  return sheetsClient;
}

export async function getWorksheetTitle(resource: SheetResourceKey) {
  const spreadsheetId = getSpreadsheetId(resource);
  const cached = worksheetTitleCache.get(spreadsheetId);

  if (cached) {
    return cached;
  }

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const title = response.data.sheets?.[0]?.properties?.title;

  if (!title) {
    throw new Error(`No worksheet found for spreadsheet: ${spreadsheetId}`);
  }

  worksheetTitleCache.set(spreadsheetId, title);
  return title;
}

export async function getSheetRange(resource: SheetResourceKey, range: string) {
  const worksheetTitle = await getWorksheetTitle(resource);
  return `${worksheetTitle}!${range}`;
}
