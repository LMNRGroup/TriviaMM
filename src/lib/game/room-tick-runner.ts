import { tickRoom } from "@/lib/game/engine";
import {
  clearQuestionBank,
  getQuestionBank,
  getRoomState,
  mergePlayerPresenceFromKeys,
  saveRoomState,
  withRoomMutationLock,
} from "@/lib/kv/room-store";

interface TickOptions {
  expectedDriverPlayerId?: string;
}

/**
 * Advances match state once with optimistic concurrency: if another writer updated the room
 * blob between read and save (e.g. lobby timer vs start match race), re-read and retry so we
 * never overwrite a newer match with stale transitions.
 */
export async function runAuthoritativeRoomTick(roomCode: string, options: TickOptions = {}) {
  return withRoomMutationLock(roomCode, async () => {
    let nowIso = new Date().toISOString();
    let room = await getRoomState(roomCode);

    if (!room) {
      return { ok: false as const, error: "room_not_found" as const };
    }

    if (options.expectedDriverPlayerId) {
      const tickDriver = room.players.player1 ?? room.players.player2;
      if (!tickDriver || tickDriver.playerId !== options.expectedDriverPlayerId) {
        return { ok: false as const, error: "driver_mismatch" as const };
      }
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const questionBank = await getQuestionBank(room.roomCode);
      const snapshotVersion = room.version;
      const result = await tickRoom({ room, questionBank, nowIso });
      const verify = await getRoomState(room.roomCode);

      if (!verify) {
        return { ok: false as const, error: "room_not_found" as const };
      }

      if (verify.version === snapshotVersion) {
        const withPresence = await mergePlayerPresenceFromKeys(result.room);
        if (!result.transitionApplied) {
          return {
            ok: true as const,
            transitionApplied: false,
            room: withPresence,
          };
        }

        const persistedRoom = await saveRoomState(withPresence);

        if (persistedRoom.phase === "idle") {
          await clearQuestionBank(persistedRoom.roomCode);
        }

        return {
          ok: true as const,
          transitionApplied: result.transitionApplied,
          room: persistedRoom,
        };
      }

      room = verify;
      nowIso = new Date().toISOString();
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

    const persistedRoom = await saveRoomState(withPresence);

    if (persistedRoom.phase === "idle") {
      await clearQuestionBank(persistedRoom.roomCode);
    }

    return {
      ok: true as const,
      transitionApplied: result.transitionApplied,
      room: persistedRoom,
    };
  });
}

export async function runTickWithOptimisticRetry(roomCode: string) {
  return runAuthoritativeRoomTick(roomCode);
}
