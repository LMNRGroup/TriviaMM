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
  const createdAtMs = Date.parse(room.createdAt);
  const legacyUpdatedAt =
    typeof room.updatedAt === "number"
      ? room.updatedAt
      : typeof room.updatedAt === "string"
      ? Date.parse(room.updatedAt)
      : Number.NaN;
  const normalizedUpdatedAt = Number.isFinite(legacyUpdatedAt)
    ? legacyUpdatedAt
    : Number.isFinite(createdAtMs)
    ? createdAtMs
    : Date.now();
  const normalizedPhaseStartedAt =
    typeof room.phaseStartedAt === "number" && Number.isFinite(room.phaseStartedAt)
      ? room.phaseStartedAt
      : normalizedUpdatedAt;
  const normalizedVersion =
    typeof room.version === "number" && Number.isFinite(room.version) && room.version >= 1
      ? Math.floor(room.version)
      : 1;

  return {
    ...room,
    version: normalizedVersion,
    phaseStartedAt: normalizedPhaseStartedAt,
    updatedAt: normalizedUpdatedAt,
    matchStartedAt: room.matchStartedAt ?? null,
    players: {
      player1: room.players.player1 ? coercePlayerFromStorage(room.players.player1) : null,
      player2: room.players.player2 ? coercePlayerFromStorage(room.players.player2) : null,
    },
  };
}
