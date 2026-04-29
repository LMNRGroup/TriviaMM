import type { PublicRoomState } from "@/lib/types/game";

const terminalPhases = new Set<PublicRoomState["phase"]>(["leaderboard", "finished", "reset"]);

export interface RoomGuardDecision {
  accept: boolean;
  reason:
    | "initial_state"
    | "same_version"
    | "newer_state"
    | "stale_version"
    | "same_version_conflict"
    | "unexpected_match_reset"
    | "invalid_phase_rollback";
  details: string;
}

function isInvalidQuestionRollback(current: PublicRoomState, incoming: PublicRoomState) {
  if (incoming.currentMatchId !== current.currentMatchId) {
    return false;
  }

  if (current.phase === "question" && incoming.phase === "question-read") {
    return incoming.currentQuestion.questionIndex <= current.currentQuestion.questionIndex;
  }

  if (current.phase === "answer-lock" && incoming.phase === "question-read") {
    return incoming.currentQuestion.questionIndex <= current.currentQuestion.questionIndex;
  }

  if (current.phase === "question-read" && incoming.phase === "countdown") {
    return true;
  }

  if (current.phase === "question" && incoming.phase === "countdown") {
    return true;
  }

  if (current.phase === "answer-lock" && incoming.phase === "question") {
    return incoming.currentQuestion.questionIndex <= current.currentQuestion.questionIndex;
  }

  return false;
}

function isUnexpectedMatchReset(current: PublicRoomState, incoming: PublicRoomState) {
  if (!current.currentMatchId || incoming.currentMatchId) {
    return false;
  }

  if (incoming.phase !== "idle" && incoming.phase !== "lobby") {
    return false;
  }

  if (terminalPhases.has(current.phase)) {
    return false;
  }

  const soloAfkResetExpected = current.mode === "solo" && current.unansweredStreaks.player1 >= 3;
  const battleAfkResetExpected =
    current.mode === "battle" &&
    current.unansweredStreaks.player1 >= 3 &&
    current.unansweredStreaks.player2 >= 3;

  if (current.reset.pending || soloAfkResetExpected || battleAfkResetExpected) {
    return false;
  }

  if (incoming.lobby.previewMessage === "system_recover") {
    return false;
  }

  return true;
}

export function decideRoomAcceptance(current: PublicRoomState | null, incoming: PublicRoomState): RoomGuardDecision {
  if (!current) {
    return {
      accept: true,
      reason: "initial_state",
      details: "Accepted initial room snapshot.",
    };
  }

  if (incoming.version < current.version) {
    return {
      accept: false,
      reason: "stale_version",
      details: `Incoming version ${incoming.version} is older than current version ${current.version}.`,
    };
  }

  if (incoming.version === current.version) {
    if (incoming.phase !== current.phase || incoming.currentMatchId !== current.currentMatchId) {
      return {
        accept: false,
        reason: "same_version_conflict",
        details: `Same version ${incoming.version} reported different phase/match (${current.phase}/${current.currentMatchId ?? "none"} -> ${incoming.phase}/${incoming.currentMatchId ?? "none"}).`,
      };
    }

    return {
      accept: true,
      reason: "same_version",
      details: "Accepted same-version snapshot.",
    };
  }

  if (isUnexpectedMatchReset(current, incoming)) {
    return {
      accept: false,
      reason: "unexpected_match_reset",
      details: `Rejected reset-like transition from ${current.phase} match ${current.currentMatchId} to ${incoming.phase} without terminal phase.`,
    };
  }

  if (isInvalidQuestionRollback(current, incoming)) {
    return {
      accept: false,
      reason: "invalid_phase_rollback",
      details: `Rejected invalid rollback ${current.phase} Q${current.currentQuestion.questionIndex} -> ${incoming.phase} Q${incoming.currentQuestion.questionIndex}.`,
    };
  }

  return {
    accept: true,
    reason: "newer_state",
    details: `Accepted newer room version ${incoming.version}.`,
  };
}
