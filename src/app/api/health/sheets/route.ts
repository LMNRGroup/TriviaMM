import { ok, fail } from "@/lib/api/http";
import { ensureAllSheetStructures, SHEET_RESOURCES } from "@/lib/sheets/bootstrap";
import { getActiveQuestions } from "@/lib/sheets/question-repo";
import { getSheetsConfig, hasSheetsConfig } from "@/lib/utils/env";

export async function GET() {
  const configured = hasSheetsConfig();

  if (!configured) {
    return ok({
      configured: false,
      connected: false,
      reason:
        "Missing Google Sheets env vars. Provide GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY plus GOOGLE_SHEETS_SPREADSHEET_ID or all split spreadsheet IDs.",
    });
  }

  try {
    const config = getSheetsConfig();
    await ensureAllSheetStructures();
    const questions = await getActiveQuestions();

    return ok({
      configured: true,
      connected: true,
      spreadsheetMode: config.spreadsheetId ? "single" : "split",
      resourcesChecked: SHEET_RESOURCES,
      activeQuestionCount: questions.length,
    });
  } catch (error) {
    console.error("sheets health error", error);
    return fail(
      "sheets_unavailable",
      500,
      error instanceof Error ? error.message : "Google Sheets could not be reached.",
    );
  }
}
