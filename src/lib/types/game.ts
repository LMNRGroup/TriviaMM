export type RoomPhase =
  | "idle"
  | "lobby"
  | "instructions"
  | "countdown"
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

export interface Player {
  playerId: string;
  roomCode: string;
  slot: 1 | 2;
  name: string;
  city: string;
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
  qrUrl: string;
  players: {
    player1: Player | null;
    player2: Player | null;
  };
  lobby: {
    allowSoloStart: boolean;
    soloStartRequestedAt?: string;
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
    endsAt: string | null;
    answerLockEndsAt: string | null;
  };
  answers: {
    player1: AnswerSubmission | null;
    player2: AnswerSubmission | null;
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
