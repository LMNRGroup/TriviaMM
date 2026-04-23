import type { RoomMode } from "@/lib/types/game";

export function shouldShowAfkWarning(unansweredStreak: number) {
  return unansweredStreak >= 2;
}

export function shouldResetForAfk(mode: RoomMode, player1Streak: number, player2Streak: number) {
  if (mode === "solo") {
    return player1Streak >= 3;
  }

  return player1Streak >= 3 && player2Streak >= 3;
}
