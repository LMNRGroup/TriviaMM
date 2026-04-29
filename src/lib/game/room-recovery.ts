import { PUBLIC_ROOM_CODE, LEADERBOARD_DURATION_MS } from "@/lib/game/constants";
import { resetRoom } from "@/lib/game/engine";
import { runAuthoritativeRoomTick } from "@/lib/game/room-tick-runner";
import { clearQuestionBank, getRoomState, saveRoomState, withRoomMutationLock } from "@/lib/kv/room-store";
import type { RoomState } from "@/lib/types/game";

const TIMER_GRACE_MS = 2_000;
const MISSING_TIMER_GRACE_MS = 10_000;

interface RecoveryOptions {
  allowHardReset?: boolean;
  maxTransitions?: number;
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasExpired(value: string | null | undefined, nowMs: number, graceMs = TIMER_GRACE_MS) {
  const parsed = parseIsoMs(value);
  return parsed !== null && nowMs >= parsed + graceMs;
}

function shouldCatchUpTick(room: RoomState, nowMs: number) {
  switch (room.phase) {
    case "countdown":
      return hasExpired(room.countdown.endsAt, nowMs);
    case "question-read":
      return hasExpired(room.currentQuestion.answersVisibleAt, nowMs);
    case "question":
      return hasExpired(room.currentQuestion.endsAt, nowMs);
    case "answer-lock":
      return hasExpired(room.currentQuestion.answerLockEndsAt, nowMs);
    case "battle-result":
      return hasExpired(room.battleResult.displayUntil, nowMs);
    case "leaderboard": {
      const shownAtMs = parseIsoMs(room.leaderboard.shownAt);
      return shownAtMs !== null && nowMs >= shownAtMs + LEADERBOARD_DURATION_MS + TIMER_GRACE_MS;
    }
    case "finished":
    case "reset":
      return true;
    default:
      return false;
  }
}

function hardTimeoutMsForPhase(phase: RoomState["phase"]) {
  switch (phase) {
    case "countdown":
      return 90_000;
    case "question-read":
      return 45_000;
    case "question":
      return 75_000;
    case "answer-lock":
      return 30_000;
    case "battle-result":
      return 40_000;
    case "leaderboard":
      return LEADERBOARD_DURATION_MS + 60_000;
    case "finished":
    case "reset":
      return 35_000;
    case "lobby":
      return Number.POSITIVE_INFINITY;
    case "idle":
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function hasMissingCriticalTimer(room: RoomState, elapsedMs: number) {
  if (elapsedMs < MISSING_TIMER_GRACE_MS) {
    return false;
  }

  switch (room.phase) {
    case "countdown":
      return parseIsoMs(room.countdown.endsAt) === null;
    case "question-read":
      return parseIsoMs(room.currentQuestion.answersVisibleAt) === null;
    case "question":
      return parseIsoMs(room.currentQuestion.endsAt) === null;
    case "answer-lock":
      return parseIsoMs(room.currentQuestion.answerLockEndsAt) === null;
    case "battle-result":
      return parseIsoMs(room.battleResult.displayUntil) === null;
    case "leaderboard":
      return parseIsoMs(room.leaderboard.shownAt) === null;
    case "finished":
    case "reset":
      return parseIsoMs(room.countdown.endsAt) === null;
    default:
      return false;
  }
}

function isHardStuck(room: RoomState, nowMs: number) {
  if (room.phase === "idle") {
    return false;
  }

  const elapsedMs = Math.max(0, nowMs - room.phaseStartedAt);
  if (elapsedMs >= hardTimeoutMsForPhase(room.phase)) {
    return true;
  }

  return hasMissingCriticalTimer(room, elapsedMs);
}

export async function forceResetPublicRoomNow() {
  return withRoomMutationLock(PUBLIC_ROOM_CODE, async () => {
    const latest = await getRoomState(PUBLIC_ROOM_CODE);
    if (!latest) {
      return null;
    }

    const reset = resetRoom(latest, new Date().toISOString());
    const [persisted] = await Promise.all([saveRoomState(reset), clearQuestionBank(PUBLIC_ROOM_CODE)]);
    return persisted;
  });
}

export async function recoverPublicRoomState(room: RoomState, options: RecoveryOptions = {}) {
  const maxTransitions = Math.max(1, options.maxTransitions ?? 5);
  let current = room;

  for (let index = 0; index < maxTransitions; index += 1) {
    const nowMs = Date.now();

    if (shouldCatchUpTick(current, nowMs)) {
      const ticked = await runAuthoritativeRoomTick(PUBLIC_ROOM_CODE);
      if (!ticked.ok) {
        break;
      }

      current = ticked.room;
      continue;
    }

    if (options.allowHardReset && isHardStuck(current, nowMs)) {
      const forced = await forceResetPublicRoomNow();
      if (forced) {
        current = forced;
      }
    }

    break;
  }

  return current;
}
