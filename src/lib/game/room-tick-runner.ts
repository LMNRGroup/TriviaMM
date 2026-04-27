import { tickRoom } from "@/lib/game/engine";
import {
  clearQuestionBank,
  getQuestionBank,
  getRoomState,
  mergePlayerPresenceFromKeys,
  saveRoomState,
  withRoomMutationLock,
} from "@/lib/kv/room-store";

/**
 * Advances match state once with optimistic concurrency: if another writer updated the room
 * blob between read and save (e.g. lobby timer vs start match race), re-read and retry so we
 * never overwrite a newer match with stale transitions.
 */
export async function runTickWithOptimisticRetry(roomCode: string) {
  return withRoomMutationLock(roomCode, async () => {
    const nowIso = new Date().toISOString();
    let room = await getRoomState(roomCode);

    if (!room) {
      return { ok: false as const, error: "room_not_found" as const };
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const questionBank = await getQuestionBank(room.roomCode);
      const snapshotUpdatedAt = room.updatedAt;
      const result = await tickRoom({ room, questionBank, nowIso });
      const verify = await getRoomState(room.roomCode);

      if (!verify) {
        return { ok: false as const, error: "room_not_found" as const };
      }

      if (verify.updatedAt === snapshotUpdatedAt) {
        const withPresence = await mergePlayerPresenceFromKeys(result.room);
        if (!result.transitionApplied) {
          return {
            ok: true as const,
            transitionApplied: false,
            room: withPresence,
          };
        }

        await saveRoomState(withPresence);

        if (withPresence.phase === "idle") {
          await clearQuestionBank(withPresence.roomCode);
        }

        return {
          ok: true as const,
          transitionApplied: result.transitionApplied,
          room: withPresence,
        };
      }

      room = verify;
    }

    const questionBank = await getQuestionBank(room.roomCode);
    const result = await tickRoom({ room, questionBank, nowIso });
    const withPresence = await mergePlayerPresenceFromKeys(result.room);
    if (!result.transitionApplied) {
      return {
        ok: true as const,
        transitionApplied: false,
        room: withPresence,
      };
    }

    await saveRoomState(withPresence);

    if (withPresence.phase === "idle") {
      await clearQuestionBank(withPresence.roomCode);
    }

    return {
      ok: true as const,
      transitionApplied: result.transitionApplied,
      room: withPresence,
    };
  });
}
