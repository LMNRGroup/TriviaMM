export type RoomPhase =
  | "idle"
  | "lobby"
  | "countdown"
  | "question-read"
  | "question"
  | "answer-lock"
  | "battle-result"
  | "leaderboard"
  | "finished"
  | "reset";

export type RoomMode = "solo" | "battle";
export type PlayerStatus = "registered" | "connected" | "disconnected" | "eliminated";
export type AnswerChoice = "A" | "B" | "C" | "D";
export type MatchStatus = "pending" | "active" | "completed" | "abandoned" | "reset_afk";
export type SubmissionStatus = "submitted" | "timeout" | "duplicate_ignored";
export type WinnerType = "player1" | "player2" | "tie" | "solo";
export type AnswerFeedback = "correct" | "incorrect" | "timeout" | null;

export interface Player {
  playerId: string;
  roomCode: string;
  slot: 1 | 2;
  name: string;
  /** Primary location field for registration and display */
  city: string;
  /**
   * Legacy KV/Sheets rows may only have `country`; prefer `city` when present.
   * @deprecated use `city`
   */
  country?: string;
  age: number;
  email: string;
  acceptedTermsAt: string;
  newsletterOptIn: boolean;
  registeredAt: string;
  status: PlayerStatus;
  sessionId: string;
  controllerToken: string;
  connectedAt: string;
  lastSeenAt: string;
  unansweredStreak: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  timeoutCount: number;
  /** Sum of `responseTimeMs` for finalized submissions where time was recorded (excludes timeouts). */
  matchResponseTimeSumMs: number;
  /** Count of submissions included in `matchResponseTimeSumMs`. */
  matchResponseTimeCount: number;
  rank?: number;
}

export interface Question {
  questionId: string;
  sourceRowId: string;
  prompt: string;
  choices: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctChoice: AnswerChoice;
  category?: string;
  difficulty?: "easy" | "medium" | "hard";
  isActive: boolean;
  tags?: string[];
}

export interface AnswerSubmission {
  submissionId: string;
  roomCode: string;
  matchId: string;
  questionId: string;
  questionIndex: number;
  playerId: string;
  playerSlot: 1 | 2;
  selectedChoice: AnswerChoice | null;
  correctChoice: AnswerChoice;
  isCorrect: boolean;
  responseTimeMs: number | null;
  submittedAt: string | null;
  deadlineAt: string;
  status: SubmissionStatus;
  awardedPoints: number;
  unansweredStreakAfter: number;
}

export interface Match {
  matchId: string;
  roomCode: string;
  mode: RoomMode;
  status: MatchStatus;
  startedAt: string;
  endedAt?: string;
  resetReason?: "host_reset" | "afk" | "completed";
  player1Id: string;
  player2Id?: string;
  winner: WinnerType | null;
  questionIds: string[];
  totalQuestionsPlanned: number;
  totalQuestionsPlayed: number;
  leaderboardSnapshotId?: string;
  finalScores: {
    player1: number;
    player2?: number;
  };
}

export interface LeaderboardEntry {
  leaderboardEntryId: string;
  playerId: string;
  playerName: string;
  country: string;
  matchesPlayed: number;
  wins: number;
  soloBestScore: number;
  battleBestScore: number;
  lifetimePoints: number;
  averageResponseMs: number | null;
  rank: number;
  updatedAt: string;
}

/** ISO time when the current match countdown started; null when idle. */
export type MatchStartedAt = string | null;

export interface PublicPlayer {
  playerId: string;
  roomCode: string;
  slot: 1 | 2;
  name: string;
  city: string;
  status: PlayerStatus;
  unansweredStreak: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  timeoutCount: number;
  connectedAt: string;
  lastSeenAt: string;
  rank?: number;
}

/** Answer slice safe for browsers — never includes `correctChoice`. */
export interface PublicAnswerSummary {
  questionId: string;
  questionIndex: number;
  playerId: string;
  playerSlot: 1 | 2;
  selectedChoice: AnswerChoice | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  submittedAt: string | null;
  deadlineAt: string;
  status: SubmissionStatus;
  awardedPoints: number;
}

/** Leaderboard row safe for clients (location only as `city`). */
export interface PublicLeaderboardEntry {
  leaderboardEntryId: string;
  playerId: string;
  playerName: string;
  city: string;
  matchesPlayed: number;
  wins: number;
  soloBestScore: number;
  battleBestScore: number;
  lifetimePoints: number;
  averageResponseMs: number | null;
  rank: number;
  updatedAt: string;
}

export interface RoomState {
  roomCode: string;
  hostSessionId: string;
  hostToken: string;
  phase: RoomPhase;
  mode: RoomMode | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  currentMatchId: string | null;
  /** Real match start (countdown start); used for Sheets match records. */
  matchStartedAt: MatchStartedAt;
  qrUrl: string;
  players: {
    player1: Player | null;
    player2: Player | null;
  };
  lobby: {
    allowSoloStart: boolean;
    waitingEndsAt: string | null;
    previewMessage: string | null;
  };
  countdown: {
    startedAt: string | null;
    endsAt: string | null;
    secondsRemaining: number | null;
  };
  currentQuestion: {
    questionId: string | null;
    questionIndex: number;
    totalQuestions: number;
    prompt: string | null;
    choices: { A: string; B: string; C: string; D: string } | null;
    startedAt: string | null;
    answersVisibleAt: string | null;
    endsAt: string | null;
    answerLockEndsAt: string | null;
  };
  answers: {
    player1: AnswerSubmission | null;
    player2: AnswerSubmission | null;
  };
  answerFeedback: {
    player1: AnswerFeedback;
    player2: AnswerFeedback;
  };
  scores: {
    player1: number;
    player2: number;
  };
  unansweredStreaks: {
    player1: number;
    player2: number;
  };
  warnings: {
    player1AfkWarningVisible: boolean;
    player2AfkWarningVisible: boolean;
  };
  battleResult: {
    winner: WinnerType | null;
    shownAt: string | null;
    displayUntil: string | null;
  };
  leaderboard: {
    visibleTop: LeaderboardEntry[];
    player1Rank?: number;
    player2Rank?: number;
    shownAt: string | null;
  };
  randomization: {
    askedQuestionIds: string[];
    remainingQuestionIds: string[];
    seed?: string;
  };
  reset: {
    pending: boolean;
    reason?: "completed_cycle" | "afk" | "host_reset";
  };
}

/** Room payload safe to expose to browsers and unauthenticated callers. */
export interface PublicRoomState {
  roomCode: string;
  phase: RoomPhase;
  mode: RoomMode | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  currentMatchId: string | null;
  matchStartedAt: MatchStartedAt;
  qrUrl: string;
  players: {
    player1: PublicPlayer | null;
    player2: PublicPlayer | null;
  };
  lobby: RoomState["lobby"];
  countdown: RoomState["countdown"];
  currentQuestion: RoomState["currentQuestion"];
  answers: {
    player1: PublicAnswerSummary | null;
    player2: PublicAnswerSummary | null;
  };
  answerFeedback: RoomState["answerFeedback"];
  scores: RoomState["scores"];
  unansweredStreaks: RoomState["unansweredStreaks"];
  warnings: RoomState["warnings"];
  battleResult: RoomState["battleResult"];
  leaderboard: {
    visibleTop: PublicLeaderboardEntry[];
    player1Rank?: number;
    player2Rank?: number;
    shownAt: string | null;
  };
  randomization: RoomState["randomization"];
  reset: RoomState["reset"];
}
