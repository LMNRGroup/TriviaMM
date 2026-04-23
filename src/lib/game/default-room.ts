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
  return {
    roomCode,
    hostSessionId,
    hostToken,
    phase: "idle",
    mode: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    currentMatchId: null,
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
