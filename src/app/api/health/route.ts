import { ok } from "@/lib/api/http";
import { ensureAllSheetStructures } from "@/lib/sheets/bootstrap";
import { getSheetsConfig, hasKvConfig, hasSheetsConfig, preferMemoryKv } from "@/lib/utils/env";

export async function GET() {
  const sheets = getSheetsConfig();
  let sheetsBootstrapOk = false;

  if (hasSheetsConfig()) {
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
      sheets: hasSheetsConfig(),
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
