import { randomUUID } from "node:crypto";
import {
  ANSWER_LOCK_DURATION_MS,
  BATTLE_COUNTDOWN_DURATION_MS,
  BATTLE_RESULT_DURATION_MS,
  FINISHED_DURATION_MS,
  LEADERBOARD_DURATION_MS,
  QUESTION_ANSWER_DURATION_MS,
  QUESTION_READ_DURATION_MS,
  SOLO_COUNTDOWN_DURATION_MS,
} from "@/lib/game/constants";
import { playerDisplayCity } from "@/lib/api/room-state";
import { shouldResetForAfk, shouldShowAfkWarning } from "@/lib/game/afk";
import { calculatePoints, determineBattleWinner, matchAverageResponseMs } from "@/lib/game/scoring";
import { appendMatch, appendMatchAnswers } from "@/lib/sheets/match-repo";
import { getPlayerLeaderboardRank, listLeaderboard, upsertLeaderboardEntry } from "@/lib/sheets/leaderboard-repo";
import type {
  AnswerFeedback,
  AnswerSubmission,
  Match,
  Player,
  Question,
  RoomMode,
  RoomState,
  WinnerType,
} from "@/lib/types/game";

function plusMs(baseIso: string, milliseconds: number) {
  return new Date(new Date(baseIso).getTime() + milliseconds).toISOString();
}

function activePlayers(room: RoomState) {
  return [room.players.player1, room.players.player2].filter((player): player is Player => {
    if (!player) return false;
    return room.mode === "solo" ? player.slot === 1 : true;
  });
}

function feedbackFromSubmission(submission: AnswerSubmission): AnswerFeedback {
  if (submission.status === "timeout") return "timeout";
  return submission.isCorrect ? "correct" : "incorrect";
}

function buildQuestionReadState(question: Question, room: RoomState, nowIso: string) {
  return {
    ...room.currentQuestion,
    questionId: question.questionId,
    questionIndex: room.randomization.askedQuestionIds.length + 1,
    totalQuestions: room.currentQuestion.totalQuestions,
    prompt: question.prompt,
    choices: question.choices,
    startedAt: nowIso,
    answersVisibleAt: plusMs(nowIso, QUESTION_READ_DURATION_MS),
    endsAt: plusMs(nowIso, QUESTION_READ_DURATION_MS + QUESTION_ANSWER_DURATION_MS),
    answerLockEndsAt: null,
  };
}

function createMatch(room: RoomState, mode: RoomMode, questions: Question[], nowIso: string): Match {
  return {
    matchId: randomUUID(),
    roomCode: room.roomCode,
    mode,
    status: "active",
    startedAt: nowIso,
    player1Id: room.players.player1?.playerId ?? "",
    player2Id: room.players.player2?.playerId,
    winner: null,
    questionIds: questions.map((question) => question.questionId),
    totalQuestionsPlanned: questions.length,
    totalQuestionsPlayed: 0,
    finalScores: {
      player1: 0,
      player2: 0,
    },
  };
}

function resetPlayers(room: RoomState) {
  return {
    player1: room.players.player1
      ? {
          ...room.players.player1,
          totalScore: 0,
          correctCount: 0,
          wrongCount: 0,
          timeoutCount: 0,
          unansweredStreak: 0,
          matchResponseTimeSumMs: 0,
          matchResponseTimeCount: 0,
        }
      : null,
    player2: room.players.player2
      ? {
          ...room.players.player2,
          totalScore: 0,
          correctCount: 0,
          wrongCount: 0,
          timeoutCount: 0,
          unansweredStreak: 0,
          matchResponseTimeSumMs: 0,
          matchResponseTimeCount: 0,
        }
      : null,
  };
}

export function startMatch(room: RoomState, mode: RoomMode, questions: Question[], nowIso: string) {
  const match = createMatch(room, mode, questions, nowIso);
  const countdownDurationMs = mode === "battle" ? BATTLE_COUNTDOWN_DURATION_MS : SOLO_COUNTDOWN_DURATION_MS;

  return {
    room: {
      ...room,
      phase: "countdown" as const,
      mode,
      currentMatchId: match.matchId,
      matchStartedAt: nowIso,
      countdown: {
        startedAt: nowIso,
        endsAt: plusMs(nowIso, countdownDurationMs),
        secondsRemaining: Math.ceil(countdownDurationMs / 1000),
      },
      currentQuestion: {
        ...room.currentQuestion,
        questionId: null,
        questionIndex: 0,
        totalQuestions: questions.length,
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
        ...room.randomization,
        askedQuestionIds: [],
        remainingQuestionIds: questions.map((question) => question.questionId),
      },
      reset: {
        pending: false,
      },
      lobby: {
        allowSoloStart: false,
        waitingEndsAt: null,
        previewMessage: mode === "battle" ? "battle_auto_start" : "solo_starting",
      },
      players: resetPlayers(room),
    },
    match,
  };
}

export function createAnswerSubmission({
  room,
  player,
  question,
  selectedChoice,
  submittedAt,
}: {
  room: RoomState;
  player: Player;
  question: Question;
  selectedChoice: Question["correctChoice"];
  submittedAt: string;
}): AnswerSubmission {
  const responseTimeMs = room.currentQuestion.answersVisibleAt
    ? Math.max(0, new Date(submittedAt).getTime() - new Date(room.currentQuestion.answersVisibleAt).getTime())
    : null;
  const isCorrect = selectedChoice === question.correctChoice;

  return {
    submissionId: randomUUID(),
    roomCode: room.roomCode,
    matchId: room.currentMatchId ?? "",
    questionId: question.questionId,
    questionIndex: room.currentQuestion.questionIndex,
    playerId: player.playerId,
    playerSlot: player.slot,
    selectedChoice,
    correctChoice: question.correctChoice,
    isCorrect,
    responseTimeMs,
    submittedAt,
    deadlineAt: room.currentQuestion.endsAt ?? submittedAt,
    status: "submitted",
    awardedPoints: calculatePoints(responseTimeMs, isCorrect),
    unansweredStreakAfter: 0,
  };
}

function buildTimeoutSubmission({
  room,
  player,
  question,
}: {
  room: RoomState;
  player: Player;
  question: Question;
}): AnswerSubmission {
  return {
    submissionId: randomUUID(),
    roomCode: room.roomCode,
    matchId: room.currentMatchId ?? "",
    questionId: question.questionId,
    questionIndex: room.currentQuestion.questionIndex,
    playerId: player.playerId,
    playerSlot: player.slot,
    selectedChoice: null,
    correctChoice: question.correctChoice,
    isCorrect: false,
    responseTimeMs: null,
    submittedAt: null,
    deadlineAt: room.currentQuestion.endsAt ?? new Date().toISOString(),
    status: "timeout",
    awardedPoints: 0,
    unansweredStreakAfter: player.unansweredStreak + 1,
  };
}

function updateRoomForSubmission(room: RoomState, player: Player, submission: AnswerSubmission) {
  const slotKey = player.slot === 1 ? "player1" : "player2";
  const currentPlayer = room.players[slotKey];

  if (!currentPlayer) {
    return room;
  }

  const timedAnswer = submission.responseTimeMs !== null;
  const sumMs = currentPlayer.matchResponseTimeSumMs ?? 0;
  const cnt = currentPlayer.matchResponseTimeCount ?? 0;

  const updatedPlayer = {
    ...currentPlayer,
    totalScore: currentPlayer.totalScore + submission.awardedPoints,
    correctCount: currentPlayer.correctCount + (submission.isCorrect ? 1 : 0),
    wrongCount:
      currentPlayer.wrongCount + (!submission.isCorrect && submission.status === "submitted" ? 1 : 0),
    timeoutCount: currentPlayer.timeoutCount + (submission.status === "timeout" ? 1 : 0),
    unansweredStreak: submission.unansweredStreakAfter,
    lastSeenAt: submission.submittedAt ?? currentPlayer.lastSeenAt,
    matchResponseTimeSumMs: sumMs + (timedAnswer ? submission.responseTimeMs! : 0),
    matchResponseTimeCount: cnt + (timedAnswer ? 1 : 0),
  };

  return {
    ...room,
    players: {
      ...room.players,
      [slotKey]: updatedPlayer,
    },
    answers: {
      ...room.answers,
      [slotKey]: submission,
    },
    answerFeedback: {
      ...room.answerFeedback,
      [slotKey]: feedbackFromSubmission(submission),
    },
    scores: {
      ...room.scores,
      [slotKey]: updatedPlayer.totalScore,
    },
    unansweredStreaks: {
      ...room.unansweredStreaks,
      [slotKey]: submission.unansweredStreakAfter,
    },
    warnings: {
      ...room.warnings,
      [slotKey === "player1" ? "player1AfkWarningVisible" : "player2AfkWarningVisible"]: shouldShowAfkWarning(
        submission.unansweredStreakAfter,
      ),
    },
  };
}

export function applyAnswerSubmission(room: RoomState, player: Player, submission: AnswerSubmission) {
  return updateRoomForSubmission(room, player, submission);
}

export async function finalizeQuestion({
  room,
  questionBank,
  nowIso,
}: {
  room: RoomState;
  questionBank: Question[];
  nowIso: string;
}) {
  const question = questionBank.find((candidate) => candidate.questionId === room.currentQuestion.questionId);

  if (!question) {
    throw new Error("question_not_found");
  }

  let nextRoom: RoomState = room;
  const submissions: AnswerSubmission[] = [];

  for (const player of activePlayers(room)) {
    const slotKey = player.slot === 1 ? "player1" : "player2";
    const existing = nextRoom.answers[slotKey];
    const finalized = existing ?? buildTimeoutSubmission({ room: nextRoom, player, question });
    submissions.push(finalized);
    nextRoom = updateRoomForSubmission(nextRoom, player, finalized);
  }

  await appendMatchAnswers(submissions);

  const askedQuestionIds = [...nextRoom.randomization.askedQuestionIds, question.questionId];
  const remainingQuestionIds = nextRoom.randomization.remainingQuestionIds.filter(
    (questionId) => questionId !== question.questionId,
  );
  const shouldReset = nextRoom.mode
    ? shouldResetForAfk(
        nextRoom.mode,
        nextRoom.unansweredStreaks.player1,
        nextRoom.unansweredStreaks.player2,
      )
    : false;

  return {
    room: {
      ...nextRoom,
      phase: "answer-lock" as const,
      currentQuestion: {
        ...nextRoom.currentQuestion,
        answerLockEndsAt: plusMs(nowIso, ANSWER_LOCK_DURATION_MS),
      },
      randomization: {
        ...nextRoom.randomization,
        askedQuestionIds,
        remainingQuestionIds,
      },
      reset: shouldReset
        ? {
            pending: true,
            reason: "afk" as const,
          }
        : nextRoom.reset,
    },
  };
}

export async function finalizeMatch(room: RoomState, nowIso: string) {
  const player1 = room.players.player1;
  const player2 = room.players.player2;
  const mode = room.mode ?? "solo";
  const skipLeaderboard = Boolean(room.reset.pending && room.reset.reason === "afk");

  const winner: WinnerType =
    mode === "solo"
      ? "solo"
      : determineBattleWinner({
          player1Score: room.scores.player1,
          player2Score: room.scores.player2,
          player1CorrectCount: player1?.correctCount ?? 0,
          player2CorrectCount: player2?.correctCount ?? 0,
          player1AverageMs: matchAverageResponseMs(player1),
          player2AverageMs: matchAverageResponseMs(player2),
        });

  if (player1 && !skipLeaderboard) {
    await upsertLeaderboardEntry({
      playerId: player1.playerId,
      playerName: player1.name,
      country: playerDisplayCity(player1),
      matchScore: room.scores.player1,
      mode,
      won: winner === "solo" || winner === "player1",
      averageResponseMs: matchAverageResponseMs(player1),
    });
  }

  if (player2 && mode === "battle" && !skipLeaderboard) {
    await upsertLeaderboardEntry({
      playerId: player2.playerId,
      playerName: player2.name,
      country: playerDisplayCity(player2),
      matchScore: room.scores.player2,
      mode,
      won: winner === "player2",
      averageResponseMs: matchAverageResponseMs(player2),
    });
  }

  const leaderboardTop = await listLeaderboard(10);
  const player1Rank = player1 ? await getPlayerLeaderboardRank(player1.playerId) : null;
  const player2Rank = player2 ? await getPlayerLeaderboardRank(player2.playerId) : null;
  const match: Match = {
    matchId: room.currentMatchId ?? randomUUID(),
    roomCode: room.roomCode,
    mode,
    status: room.reset.pending ? "reset_afk" : "completed",
    startedAt: room.matchStartedAt ?? nowIso,
    endedAt: nowIso,
    player1Id: player1?.playerId ?? "",
    player2Id: player2?.playerId,
    winner,
    questionIds: [...room.randomization.askedQuestionIds],
    totalQuestionsPlanned: room.currentQuestion.totalQuestions,
    totalQuestionsPlayed: room.randomization.askedQuestionIds.length,
    resetReason: room.reset.pending ? "afk" : "completed",
    finalScores: {
      player1: room.scores.player1,
      player2: mode === "battle" ? room.scores.player2 : undefined,
    },
  };

  await appendMatch(match);

  return {
    room: {
      ...room,
      battleResult: {
        winner,
        shownAt: mode === "battle" ? nowIso : null,
        displayUntil: mode === "battle" ? plusMs(nowIso, BATTLE_RESULT_DURATION_MS) : null,
      },
      leaderboard: {
        visibleTop: leaderboardTop,
        player1Rank: player1Rank?.rank,
        player2Rank: player2Rank?.rank,
        shownAt: mode === "battle" ? null : nowIso,
      },
    },
  };
}

export function resetRoom(room: RoomState, nowIso: string): RoomState {
  return {
    ...room,
    phase: "idle",
    mode: null,
    currentMatchId: null,
    matchStartedAt: null,
    countdown: {
      startedAt: null,
      endsAt: null,
      secondsRemaining: null,
    },
    currentQuestion: {
      ...room.currentQuestion,
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
    lobby: {
      allowSoloStart: false,
      waitingEndsAt: null,
      previewMessage: null,
    },
    players: {
      player1: null,
      player2: null,
    },
    updatedAt: nowIso,
  };
}

export async function tickRoom({
  room,
  questionBank,
  nowIso,
}: {
  room: RoomState;
  questionBank: Question[];
  nowIso: string;
}): Promise<{ room: RoomState; transitionApplied: boolean }> {
  if (
    room.phase === "lobby" &&
    room.lobby.waitingEndsAt &&
    !room.players.player2 &&
    nowIso >= room.lobby.waitingEndsAt
  ) {
    return {
      room: {
        ...resetRoom(room, nowIso),
        lobby: {
          allowSoloStart: false,
          waitingEndsAt: null,
          previewMessage: "lobby_timeout",
        },
      },
      transitionApplied: true,
    };
  }

  if (room.phase === "countdown" && room.countdown.endsAt && nowIso >= room.countdown.endsAt) {
    const nextQuestionId = room.randomization.remainingQuestionIds[0];
    const nextQuestion = questionBank.find((question) => question.questionId === nextQuestionId);

    if (!nextQuestion) return { room, transitionApplied: false };

    return {
      room: {
        ...room,
        phase: "question-read",
        currentQuestion: buildQuestionReadState(nextQuestion, room, nowIso),
        answers: {
          player1: null,
          player2: null,
        },
        answerFeedback: {
          player1: null,
          player2: null,
        },
      },
      transitionApplied: true,
    };
  }

  if (
    room.phase === "question-read" &&
    room.currentQuestion.answersVisibleAt &&
    nowIso >= room.currentQuestion.answersVisibleAt
  ) {
    return {
      room: {
        ...room,
        phase: "question",
      },
      transitionApplied: true,
    };
  }

  if (room.phase === "question") {
    const allAnswered = activePlayers(room).every((player) => {
      const slotKey = player.slot === 1 ? "player1" : "player2";
      return room.answers[slotKey] !== null;
    });

    if (allAnswered || (room.currentQuestion.endsAt && nowIso >= room.currentQuestion.endsAt)) {
      const finalized = await finalizeQuestion({ room, questionBank, nowIso });
      return { room: finalized.room, transitionApplied: true };
    }
  }

  if (room.phase === "answer-lock" && room.currentQuestion.answerLockEndsAt && nowIso >= room.currentQuestion.answerLockEndsAt) {
    if (room.reset.pending) {
      return {
        room: {
          ...resetRoom(room, nowIso),
          phase: "reset",
          countdown: {
            startedAt: nowIso,
            endsAt: plusMs(nowIso, FINISHED_DURATION_MS),
            secondsRemaining: Math.ceil(FINISHED_DURATION_MS / 1000),
          },
        },
        transitionApplied: true,
      };
    }

    const nextQuestionId = room.randomization.remainingQuestionIds[0];
    const nextQuestion = questionBank.find((question) => question.questionId === nextQuestionId);

    if (nextQuestion) {
      return {
        room: {
          ...room,
          phase: "question-read",
          currentQuestion: buildQuestionReadState(nextQuestion, room, nowIso),
          answers: {
            player1: null,
            player2: null,
          },
          answerFeedback: {
            player1: null,
            player2: null,
          },
        },
        transitionApplied: true,
      };
    }

    const finalized = await finalizeMatch(room, nowIso);
    return {
      room:
        room.mode === "battle"
          ? { ...finalized.room, phase: "battle-result" }
          : {
              ...finalized.room,
              phase: "leaderboard",
              leaderboard: {
                ...finalized.room.leaderboard,
                shownAt: nowIso,
              },
            },
      transitionApplied: true,
    };
  }

  if (room.phase === "battle-result" && room.battleResult.displayUntil && nowIso >= room.battleResult.displayUntil) {
    return {
      room: {
        ...room,
        phase: "leaderboard",
        leaderboard: {
          ...room.leaderboard,
          shownAt: nowIso,
        },
      },
      transitionApplied: true,
    };
  }

  if (
    room.phase === "leaderboard" &&
    room.leaderboard.shownAt &&
    nowIso >= plusMs(room.leaderboard.shownAt, LEADERBOARD_DURATION_MS)
  ) {
    return {
      room: {
        ...room,
        phase: "finished",
        countdown: {
          startedAt: nowIso,
          endsAt: plusMs(nowIso, FINISHED_DURATION_MS),
          secondsRemaining: Math.ceil(FINISHED_DURATION_MS / 1000),
        },
      },
      transitionApplied: true,
    };
  }

  if ((room.phase === "finished" || room.phase === "reset") && room.countdown.endsAt && nowIso >= room.countdown.endsAt) {
    return {
      room: resetRoom(room, nowIso),
      transitionApplied: true,
    };
  }

  return { room, transitionApplied: false };
}
