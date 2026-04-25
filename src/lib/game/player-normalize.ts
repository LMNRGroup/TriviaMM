import type { Player, RoomState } from "@/lib/types/game";

/** Merge legacy KV/Sheets `Player` blobs into the current `Player` shape. */
export function coercePlayerFromStorage(raw: Player): Player {
  return {
    ...raw,
    city: raw.city || raw.country || "",
    matchResponseTimeSumMs: raw.matchResponseTimeSumMs ?? 0,
    matchResponseTimeCount: raw.matchResponseTimeCount ?? 0,
  };
}

/** Merge legacy `RoomState` blobs from KV (e.g. missing `matchStartedAt`). */
export function coerceRoomStateFromStorage(room: RoomState): RoomState {
  return {
    ...room,
    matchStartedAt: room.matchStartedAt ?? null,
    players: {
      player1: room.players.player1 ? coercePlayerFromStorage(room.players.player1) : null,
      player2: room.players.player2 ? coercePlayerFromStorage(room.players.player2) : null,
    },
  };
}
