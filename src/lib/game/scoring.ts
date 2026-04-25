import type { Player, WinnerType } from "@/lib/types/game";
import { QUESTION_ANSWER_DURATION_MS } from "@/lib/game/constants";

const BASE_CORRECT_POINTS = 100;
const MAX_SPEED_BONUS = 50;

export function calculatePoints(responseTimeMs: number | null, isCorrect: boolean) {
  if (!isCorrect || responseTimeMs === null) {
    return 0;
  }

  const speedRatio = Math.max(
    0,
    (QUESTION_ANSWER_DURATION_MS - responseTimeMs) / QUESTION_ANSWER_DURATION_MS,
  );
  const speedBonus = Math.round(MAX_SPEED_BONUS * speedRatio);

  return BASE_CORRECT_POINTS + speedBonus;
}

export function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Match-wide mean response time from finalized timed answers (excludes timeouts / null). */
export function matchAverageResponseMs(
  player: Pick<Player, "matchResponseTimeSumMs" | "matchResponseTimeCount"> | null | undefined,
): number | null {
  if (!player) {
    return null;
  }

  const count = player.matchResponseTimeCount ?? 0;
  if (count <= 0) {
    return null;
  }

  const sum = player.matchResponseTimeSumMs ?? 0;
  return Math.round(sum / count);
}

export function determineBattleWinner(input: {
  player1Score: number;
  player2Score: number;
  player1CorrectCount: number;
  player2CorrectCount: number;
  player1AverageMs: number | null;
  player2AverageMs: number | null;
}): WinnerType {
  if (input.player1Score !== input.player2Score) {
    return input.player1Score > input.player2Score ? "player1" : "player2";
  }

  if (input.player1CorrectCount !== input.player2CorrectCount) {
    return input.player1CorrectCount > input.player2CorrectCount ? "player1" : "player2";
  }

  if (input.player1AverageMs !== null && input.player2AverageMs !== null && input.player1AverageMs !== input.player2AverageMs) {
    return input.player1AverageMs < input.player2AverageMs ? "player1" : "player2";
  }

  return "tie";
}
