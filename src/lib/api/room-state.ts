import type {
  AnswerSubmission,
  LeaderboardEntry,
  Player,
  PublicAnswerSummary,
  PublicLeaderboardEntry,
  PublicPlayer,
  PublicRoomState,
  RoomState,
} from "@/lib/types/game";

/** Display city from a live or legacy `Player` (KV may still have `country` only). */
export function playerDisplayCity(player: Pick<Player, "city" | "country">): string {
  const value = (player.city || player.country || "").trim();
  return value.length > 0 ? value : "—";
}

function toPublicPlayer(player: Player | null): PublicPlayer | null {
  if (!player) {
    return null;
  }

  return {
    playerId: player.playerId,
    roomCode: player.roomCode,
    slot: player.slot,
    name: player.name,
    city: playerDisplayCity(player),
    status: player.status,
    unansweredStreak: player.unansweredStreak,
    totalScore: player.totalScore,
    correctCount: player.correctCount,
    wrongCount: player.wrongCount,
    timeoutCount: player.timeoutCount,
    connectedAt: player.connectedAt,
    lastSeenAt: player.lastSeenAt,
    rank: player.rank,
  };
}

function toPublicAnswer(submission: AnswerSubmission | null): PublicAnswerSummary | null {
  if (!submission) {
    return null;
  }

  return {
    questionId: submission.questionId,
    questionIndex: submission.questionIndex,
    playerId: submission.playerId,
    playerSlot: submission.playerSlot,
    selectedChoice: submission.selectedChoice,
    isCorrect: submission.isCorrect,
    responseTimeMs: submission.responseTimeMs,
    submittedAt: submission.submittedAt,
    deadlineAt: submission.deadlineAt,
    status: submission.status,
    awardedPoints: submission.awardedPoints,
  };
}

function toPublicLeaderboardEntry(entry: LeaderboardEntry): PublicLeaderboardEntry {
  return {
    leaderboardEntryId: entry.leaderboardEntryId,
    playerId: entry.playerId,
    playerName: entry.playerName,
    city: entry.country,
    matchesPlayed: entry.matchesPlayed,
    wins: entry.wins,
    soloBestScore: entry.soloBestScore,
    battleBestScore: entry.battleBestScore,
    lifetimePoints: entry.lifetimePoints,
    averageResponseMs: entry.averageResponseMs,
    rank: entry.rank,
    updatedAt: entry.updatedAt,
  };
}

/** Strip secrets and correct answers for any browser-facing API. */
export function toPublicRoomState(room: RoomState): PublicRoomState {
  return {
    roomCode: room.roomCode,
    phase: room.phase,
    mode: room.mode,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    expiresAt: room.expiresAt,
    currentMatchId: room.currentMatchId,
    matchStartedAt: room.matchStartedAt,
    qrUrl: room.qrUrl,
    players: {
      player1: toPublicPlayer(room.players.player1),
      player2: toPublicPlayer(room.players.player2),
    },
    lobby: room.lobby,
    countdown: room.countdown,
    currentQuestion: room.currentQuestion,
    answers: {
      player1: toPublicAnswer(room.answers.player1),
      player2: toPublicAnswer(room.answers.player2),
    },
    answerFeedback: room.answerFeedback,
    scores: room.scores,
    unansweredStreaks: room.unansweredStreaks,
    warnings: room.warnings,
    battleResult: room.battleResult,
    leaderboard: {
      visibleTop: room.leaderboard.visibleTop.map(toPublicLeaderboardEntry),
      player1Rank: room.leaderboard.player1Rank,
      player2Rank: room.leaderboard.player2Rank,
      shownAt: room.leaderboard.shownAt,
    },
    randomization: room.randomization,
    reset: room.reset,
  };
}

/** Minimal public room slice for join responses (no tokens). */
export function toPublicRoomJoinSlice(room: Pick<RoomState, "phase" | "mode" | "lobby"> & { players: RoomState["players"] }): {
  phase: RoomState["phase"];
  mode: RoomState["mode"];
  lobby: RoomState["lobby"];
  players: PublicRoomState["players"];
} {
  return {
    phase: room.phase,
    mode: room.mode,
    lobby: room.lobby,
    players: {
      player1: toPublicPlayer(room.players.player1),
      player2: toPublicPlayer(room.players.player2),
    },
  };
}

/** Controller client needs tokens; omit email and other PII from this payload. */
export function toJoinPlayerPayload(player: Player) {
  return {
    playerId: player.playerId,
    name: player.name,
    city: playerDisplayCity(player),
    slot: player.slot,
    roomCode: player.roomCode,
    controllerToken: player.controllerToken,
    sessionId: player.sessionId,
  };
}
