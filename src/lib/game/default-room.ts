import type { RoomState } from "@/lib/types/game";

interface CreateInitialRoomStateInput {
  roomCode: string;
  hostSessionId: string;
  hostToken: string;
  qrUrl: string;
  createdAt: string;
  expiresAt: string;
}

export function createInitialRoomState({
  roomCode,
  hostSessionId,
  hostToken,
  qrUrl,
  createdAt,
  expiresAt,
}: CreateInitialRoomStateInput): RoomState {
  const createdAtMs = Date.parse(createdAt);

  return {
    roomCode,
    hostSessionId,
    hostToken,
    version: 1,
    phase: "idle",
    phaseStartedAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    mode: null,
    createdAt,
    updatedAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    expiresAt,
    currentMatchId: null,
    matchStartedAt: null,
    qrUrl,
    players: {
      player1: null,
      player2: null,
    },
    lobby: {
      allowSoloStart: false,
      waitingEndsAt: null,
      previewMessage: null,
    },
    countdown: {
      startedAt: null,
      endsAt: null,
      secondsRemaining: null,
    },
    currentQuestion: {
      questionId: null,
      questionIndex: 0,
      totalQuestions: 0,
      category: null,
      prompt: null,
      choices: null,
      startedAt: null,
      answersVisibleAt: null,
      endsAt: null,
      answerLockEndsAt: null,
    },
    answers: {
      player1: null,
      player2: null,
    },
    answerFeedback: {
      player1: null,
      player2: null,
    },
    scores: {
      player1: 0,
      player2: 0,
    },
    unansweredStreaks: {
      player1: 0,
      player2: 0,
    },
    warnings: {
      player1AfkWarningVisible: false,
      player2AfkWarningVisible: false,
    },
    battleResult: {
      winner: null,
      shownAt: null,
      displayUntil: null,
    },
    leaderboard: {
      visibleTop: [],
      shownAt: null,
    },
    randomization: {
      askedQuestionIds: [],
      remainingQuestionIds: [],
    },
    reset: {
      pending: false,
    },
  };
}
