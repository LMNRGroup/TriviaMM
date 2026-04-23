import { google, type sheets_v4 } from "googleapis";
import { getSheetsConfig } from "@/lib/utils/env";

let sheetsClient: sheets_v4.Sheets | null = null;
let spreadsheetId: string | null = null;

export function getSpreadsheetId() {
  if (!spreadsheetId) {
    spreadsheetId = getSheetsConfig().spreadsheetId;
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
