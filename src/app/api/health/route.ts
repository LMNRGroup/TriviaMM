import { ok } from "@/lib/api/http";
import { getKvRuntimeMode } from "@/lib/kv/client";
import { ensureAllSheetStructures } from "@/lib/sheets/bootstrap";
import {
  allowMemoryKvFallback,
  getSheetsConfig,
  hasKvConfig,
  hasSheetsConfig,
  isMultiplayerEnabled,
  preferMemoryKv,
} from "@/lib/utils/env";

export async function GET() {
  const sheetsEnabled = hasSheetsConfig();
  const sheets = sheetsEnabled
    ? getSheetsConfig()
    : {
        spreadsheetId: null,
        spreadsheetIds: {
          players: null,
          questions: null,
          matches: null,
          matchAnswers: null,
          leaderboard: null,
          leaderboardSnapshots: null,
        },
      };
  let sheetsBootstrapOk = false;

  if (sheetsEnabled) {
    try {
      await ensureAllSheetStructures();
      sheetsBootstrapOk = true;
    } catch (error) {
      console.error("health sheet bootstrap error", error);
    }
  }

  return ok({
    status: "ok",
    ready: {
      appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
      kv: hasKvConfig(),
      kvUseMemory: preferMemoryKv(),
      kvAllowMemoryFallback: allowMemoryKvFallback(),
      kvRuntimeMode: getKvRuntimeMode(),
      multiplayerEnabled: isMultiplayerEnabled(),
      sheets: sheetsEnabled,
      sheetsSingleSpreadsheet: Boolean(sheets.spreadsheetId),
      sheetsSplitSpreadsheets: Object.values(sheets.spreadsheetIds).every(Boolean),
      sheetsBootstrapOk,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    checkedAt: new Date().toISOString(),
  });
}
