import type { AnswerSubmission, Match } from "@/lib/types/game";
import { ensureSheetHeaders } from "@/lib/sheets/bootstrap";
import { hasSheetsConfig } from "@/lib/utils/env";
import { getSheetRange, getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";

export async function appendMatch(match: Match) {
  if (!hasSheetsConfig()) {
    return;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("matches");
  const range = await getSheetRange("matches", "A:O");

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId("matches"),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        match.matchId,
        match.roomCode,
        match.mode,
        match.status,
        match.startedAt,
        match.endedAt ?? "",
        match.player1Id,
        match.player2Id ?? "",
        match.winner ?? "",
        String(match.finalScores.player1),
        String(match.finalScores.player2 ?? ""),
        String(match.totalQuestionsPlanned),
        String(match.totalQuestionsPlayed),
        match.resetReason ?? "",
        match.leaderboardSnapshotId ?? "",
      ]],
    },
  });
}

export async function appendMatchAnswers(submissions: AnswerSubmission[]) {
  if (!hasSheetsConfig() || submissions.length === 0) {
    return;
  }

  const sheets = getSheetsClient();
  await ensureSheetHeaders("matchAnswers");
  const range = await getSheetRange("matchAnswers", "A:N");
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId("matchAnswers"),
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: submissions.map((submission) => [
        submission.submissionId,
        submission.matchId,
        submission.roomCode,
        submission.questionId,
        String(submission.questionIndex),
        submission.playerId,
        String(submission.playerSlot),
        submission.selectedChoice ?? "",
        submission.correctChoice,
        String(submission.isCorrect),
        submission.responseTimeMs === null ? "" : String(submission.responseTimeMs),
        submission.submittedAt ?? "",
        submission.deadlineAt,
        submission.status,
        String(submission.awardedPoints),
      ]),
    },
  });
}
