import { getSheetRange, getSheetsClient, getSpreadsheetId, type SheetResourceKey } from "@/lib/sheets/client";

const sheetHeaders: Record<SheetResourceKey, string[]> = {
  players: [
    "player_id",
    "name",
    "city",
    "age",
    "email",
    "accepted_terms_at",
    "newsletter_opt_in",
    "first_registered_at",
    "last_registered_at",
    "total_matches",
    "total_wins",
    "lifetime_points",
    "best_solo_score",
    "best_battle_score",
    "average_response_ms",
    "last_room_code",
  ],
  questions: [
    "question_id",
    "source_row_id",
    "prompt",
    "choice_a",
    "choice_b",
    "choice_c",
    "choice_d",
    "correct_choice",
    "category",
    "difficulty",
    "tags",
    "is_active",
  ],
  matches: [
    "match_id",
    "room_code",
    "mode",
    "status",
    "started_at",
    "ended_at",
    "player1_id",
    "player2_id",
    "winner",
    "player1_score",
    "player2_score",
    "total_questions_planned",
    "total_questions_played",
    "reset_reason",
    "leaderboard_snapshot_id",
  ],
  matchAnswers: [
    "submission_id",
    "match_id",
    "room_code",
    "question_id",
    "question_index",
    "player_id",
    "player_slot",
    "selected_choice",
    "correct_choice",
    "is_correct",
    "response_time_ms",
    "submitted_at",
    "deadline_at",
    "status",
    "awarded_points",
  ],
  leaderboard: [
    "leaderboard_entry_id",
    "player_id",
    "player_name",
    "country",
    "matches_played",
    "wins",
    "solo_best_score",
    "battle_best_score",
    "lifetime_points",
    "average_response_ms",
    "rank",
    "updated_at",
  ],
  leaderboardSnapshots: [
    "snapshot_id",
    "match_id",
    "created_at",
    "rank",
    "player_id",
    "player_name",
    "city",
    "points",
    "average_response_ms",
  ],
};

const ensuredSheets = new Set<SheetResourceKey>();

export async function ensureSheetHeaders(resource: SheetResourceKey) {
  if (ensuredSheets.has(resource)) {
    return;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId(resource);
  const headerRange = await getSheetRange(resource, "A1:Z1");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const firstRow = response.data.values?.[0] ?? [];

  if (firstRow.length === 0) {
    const targetRange = await getSheetRange(resource, "A1");
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [sheetHeaders[resource]],
      },
    });
  }

  ensuredSheets.add(resource);
}
