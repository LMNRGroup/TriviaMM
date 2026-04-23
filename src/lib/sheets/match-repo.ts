import type { AnswerSubmission, Match } from "@/lib/types/game";
import { hasSheetsConfig } from "@/lib/utils/env";
import { getSheetsClient, getSpreadsheetId } from "@/lib/sheets/client";
import { SHEETS_TABS } from "@/lib/sheets/tabs";

export async function appendMatch(match: Match) {
  if (!hasSheetsConfig()) {
    return;
  }

  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.matches}!A:O`,
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
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${SHEETS_TABS.matchAnswers}!A:N`,
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
