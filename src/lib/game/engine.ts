import { randomUUID } from "node:crypto";
import { ANSWER_LOCK_DURATION_MS, BATTLE_RESULT_DURATION_MS, COUNTDOWN_DURATION_MS, FINISHED_DURATION_MS, INSTRUCTIONS_DURATION_MS, LEADERBOARD_DURATION_MS, MATCH_QUESTION_COUNT, QUESTION_DURATION_MS } from "@/lib/game/constants";
import { calculatePoints, average, determineBattleWinner } from "@/lib/game/scoring";
import { shouldResetForAfk, shouldShowAfkWarning } from "@/lib/game/afk";
import type { AnswerSubmission, Match, Player, Question, RoomMode, RoomState, WinnerType } from "@/lib/types/game";
import { appendMatch, appendMatchAnswers } from "@/lib/sheets/match-repo";
import { getPlayerLeaderboardRank, listLeaderboard, upsertLeaderboardEntry } from "@/lib/sheets/leaderboard-repo";

function plusMs(baseIso: string, milliseconds: number) {
  return new Date(new Date(baseIso).getTime() + milliseconds).toISOString();
}

function activePlayers(room: RoomState) {
  return [room.players.player1, room.players.player2].filter((player): player is Player => {
    if (!player) {
      return false;
    }

    if (room.mode === "solo") {
      return player.slot === 1;
    }

    return true;
  });
}

function updatePlayerTotals(player: Player, submission: AnswerSubmission) {
  return {
    ...player,
    totalScore: player.totalScore + submission.awardedPoints,
    correctCount: player.correctCount + (submission.isCorrect ? 1 : 0),
    wrongCount: player.wrongCount + (!submission.isCorrect && submission.status === "submitted" ? 1 : 0),
    timeoutCount: player.timeoutCount + (submission.status === "timeout" ? 1 : 0),
    unansweredStreak: submission.unansweredStreakAfter,
    lastSeenAt: submission.submittedAt ?? player.lastSeenAt,
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

function buildQuestionState(question: Question, room: RoomState, nowIso: string, totalQuestions: number) {
  return {
    ...room.currentQuestion,
    questionId: question.questionId,
    questionIndex: room.randomization.askedQuestionIds.length + 1,
    totalQuestions,
    prompt: question.prompt,
    choices: question.choices,
    startedAt: nowIso,
    endsAt: plusMs(nowIso, QUESTION_DURATION_MS),
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

export function startMatch(
  room: RoomState,
  mode: RoomMode,
  questions: Question[],
  nowIso: string,
): { room: RoomState; match: Match } {
  const match = createMatch(room, mode, questions, nowIso);

  return {
    room: {
      ...room,
      phase: "instructions",
      mode,
      currentMatchId: match.matchId,
      countdown: {
        startedAt: nowIso,
        endsAt: plusMs(nowIso, INSTRUCTIONS_DURATION_MS),
        secondsRemaining: Math.ceil(INSTRUCTIONS_DURATION_MS / 1000),
      },
      currentQuestion: {
        ...room.currentQuestion,
        questionId: null,
        questionIndex: 0,
        totalQuestions: questions.length,
        prompt: null,
        choices: null,
        startedAt: null,
        endsAt: null,
        answerLockEndsAt: null,
      },
      answers: {
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
      players: {
        player1: room.players.player1
          ? { ...room.players.player1, totalScore: 0, correctCount: 0, wrongCount: 0, timeoutCount: 0, unansweredStreak: 0 }
          : null,
        player2: room.players.player2
          ? { ...room.players.player2, totalScore: 0, correctCount: 0, wrongCount: 0, timeoutCount: 0, unansweredStreak: 0 }
          : null,
      },
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
  const responseTimeMs = room.currentQuestion.startedAt
    ? Math.max(0, new Date(submittedAt).getTime() - new Date(room.currentQuestion.startedAt).getTime())
    : null;
  const isCorrect = selectedChoice === question.correctChoice;
  const awardedPoints = calculatePoints(responseTimeMs, isCorrect);

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
    awardedPoints,
    unansweredStreakAfter: isCorrect || !isCorrect ? 0 : player.unansweredStreak,
  };
}

function updateRoomForSubmission(room: RoomState, player: Player, submission: AnswerSubmission) {
  const slotKey = player.slot === 1 ? "player1" : "player2";
  const currentPlayer = room.players[slotKey];

  if (!currentPlayer) {
    return room;
  }

  const updatedPlayer = updatePlayerTotals(currentPlayer, submission);

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
}): Promise<{ room: RoomState; finalizedSubmissions: AnswerSubmission[] }> {
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
  const remainingQuestionIds = nextRoom.randomization.remainingQuestionIds.filter((questionId) => questionId !== question.questionId);
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
      phase: "answer-lock",
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
            reason: "afk",
          }
        : nextRoom.reset,
    },
    finalizedSubmissions: submissions,
  };
}

export async function finalizeMatch(room: RoomState, nowIso: string) {
  const player1 = room.players.player1;
  const player2 = room.players.player2;
  const mode = room.mode ?? "solo";
  const player1Times = [room.answers.player1?.responseTimeMs].filter((value): value is number => typeof value === "number");
  const player2Times = [room.answers.player2?.responseTimeMs].filter((value): value is number => typeof value === "number");
  const winner: WinnerType =
    mode === "solo"
      ? "solo"
      : determineBattleWinner({
          player1Score: room.scores.player1,
          player2Score: room.scores.player2,
          player1CorrectCount: player1?.correctCount ?? 0,
          player2CorrectCount: player2?.correctCount ?? 0,
          player1AverageMs: average(player1Times),
          player2AverageMs: average(player2Times),
        });

  if (player1) {
    await upsertLeaderboardEntry({
      playerId: player1.playerId,
      playerName: player1.name,
      city: player1.city,
      matchScore: room.scores.player1,
      mode,
      won: winner === "solo" || winner === "player1",
      averageResponseMs: average(player1Times),
    });
  }

  if (player2 && mode === "battle") {
    await upsertLeaderboardEntry({
      playerId: player2.playerId,
      playerName: player2.name,
      city: player2.city,
      matchScore: room.scores.player2,
      mode,
      won: winner === "player2",
      averageResponseMs: average(player2Times),
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
    startedAt: room.createdAt,
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
    winner,
  } satisfies { room: RoomState; winner: WinnerType };
}

export function resetRoom(room: RoomState, nowIso: string): RoomState {
  return {
    ...room,
    phase: "idle",
    mode: null,
    currentMatchId: null,
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
      endsAt: null,
      answerLockEndsAt: null,
    },
    answers: {
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
  if (room.phase === "instructions" && room.countdown.endsAt && nowIso >= room.countdown.endsAt) {
    return {
      room: {
        ...room,
        phase: "countdown",
        countdown: {
          startedAt: nowIso,
          endsAt: plusMs(nowIso, COUNTDOWN_DURATION_MS),
          secondsRemaining: Math.ceil(COUNTDOWN_DURATION_MS / 1000),
        },
      },
      transitionApplied: true,
    };
  }

  if (room.phase === "countdown" && room.countdown.endsAt && nowIso >= room.countdown.endsAt) {
    const nextQuestionId = room.randomization.remainingQuestionIds[0];
    const nextQuestion = questionBank.find((question) => question.questionId === nextQuestionId);

    if (!nextQuestion) {
      return { room, transitionApplied: false };
    }

    return {
      room: {
        ...room,
        phase: "question",
        currentQuestion: buildQuestionState(nextQuestion, room, nowIso, questionBank.length),
        answers: {
          player1: null,
          player2: null,
        },
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
      return {
        room: finalized.room,
        transitionApplied: true,
      };
    }
  }

  if (room.phase === "answer-lock" && room.currentQuestion.answerLockEndsAt && nowIso >= room.currentQuestion.answerLockEndsAt) {
    if (room.reset.pending) {
      return {
        room: {
          ...resetRoom(room, nowIso),
          phase: "reset",
          reset: room.reset,
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
          phase: "question",
          currentQuestion: buildQuestionState(nextQuestion, room, nowIso, questionBank.length),
          answers: {
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
          ? {
              ...finalized.room,
              phase: "battle-result",
            }
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

  if (room.phase === "leaderboard" && room.leaderboard.shownAt && nowIso >= plusMs(room.leaderboard.shownAt, LEADERBOARD_DURATION_MS)) {
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
