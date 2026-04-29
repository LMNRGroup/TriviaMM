import { ok } from "@/lib/api/http";
import { getKvRuntimeMode } from "@/lib/kv/client";
import { ensureAllSheetStructures } from "@/lib/sheets/bootstrap";
import {
  allowMemoryKvFallback,
  getSheetsConfig,
  isBattleModeEnabled,
  hasKvConfig,
  hasSheetsConfig,
  isMultiplayerEnabled,
  isProductionRuntime,
  preferMemoryKv,
} from "@/lib/utils/env";

export async function GET() {
  const kvConfigured = hasKvConfig();
  const kvRuntimeMode = getKvRuntimeMode();
  const productionRuntime = isProductionRuntime();
  const kvConsistent = kvRuntimeMode === "remote";
  const battleModeEnabled = isBattleModeEnabled();
  const gameplaySafe = kvConsistent || !productionRuntime;
  let gameplayUnsafeReason: string | null = null;

  if (productionRuntime && !kvConfigured) {
    gameplayUnsafeReason = "Remote KV is not configured in production.";
  } else if (productionRuntime && !kvConsistent) {
    gameplayUnsafeReason = "Remote KV unavailable; memory fallback is not safe for production gameplay.";
  }

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
      kv: kvConfigured,
      kvUseMemory: preferMemoryKv(),
      kvAllowMemoryFallback: allowMemoryKvFallback(),
      kvRuntimeMode,
      kvConsistent,
      gameplaySafe,
      gameplayUnsafeReason,
      productionRuntime,
      multiplayerEnabled: isMultiplayerEnabled(),
      battleModeEnabled,
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
