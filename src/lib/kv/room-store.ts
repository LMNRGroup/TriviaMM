import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { createInitialRoomState } from "@/lib/game/default-room";
import { LOBBY_WAIT_DURATION_MS } from "@/lib/game/constants";
import { coerceRoomStateFromStorage } from "@/lib/game/player-normalize";
import type { Player, Question, RoomState } from "@/lib/types/game";
import { getKv } from "@/lib/kv/client";
import { isMultiplayerEnabled } from "@/lib/utils/env";
import {
  LOCK_TTL_SECONDS,
  ROOM_TTL_SECONDS,
  roomHostKey,
  roomLockKey,
  roomMetaKey,
  roomPlayerKey,
  roomPlayersKey,
  roomQuestionBankKey,
  roomStateKey,
  roomVersionKey,
} from "@/lib/kv/keys";
import { createHostToken, createSessionId } from "@/lib/utils/ids";

interface RoomMetaRecord {
  roomCode: string;
  hostSessionId: string;
  hostToken: string;
  createdAt: string;
  expiresAt: string;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRoomMutationLock<T>(roomCode: string, action: () => Promise<T>): Promise<T> {
  const kv = getKv();
  const lockKey = roomLockKey(roomCode);
  const token = createSessionId();

  for (let attempt = 0; attempt < 20; attempt++) {
    const acquired = await kv.set(lockKey, token, { ex: LOCK_TTL_SECONDS, nx: true });

    if (acquired) {
      try {
        return await action();
      } finally {
        const currentToken = await kv.get<string>(lockKey);
        if (currentToken === token) {
          await kv.del(lockKey);
        }
      }
    }

    await sleep(25 + attempt * 10);
  }

  throw new Error("room_lock_timeout");
}

export async function ensurePublicRoom(baseUrl: string) {
  const kv = getKv();
  const existing = await kv.get<RoomState>(roomStateKey(PUBLIC_ROOM_CODE));

  if (existing) {
    return coerceRoomStateFromStorage(existing);
  }

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ROOM_TTL_SECONDS * 1000).toISOString();
  const hostSessionId = createSessionId();
  const hostToken = createHostToken();

  const room = createInitialRoomState({
    roomCode: PUBLIC_ROOM_CODE,
    hostSessionId,
    hostToken,
    qrUrl: `${baseUrl}/play`,
    createdAt,
    expiresAt,
  });

  const meta: RoomMetaRecord = {
    roomCode: PUBLIC_ROOM_CODE,
    hostSessionId,
    hostToken,
    createdAt,
    expiresAt,
  };

  await Promise.all([
    kv.set(roomStateKey(PUBLIC_ROOM_CODE), room, { ex: ROOM_TTL_SECONDS }),
    kv.set(roomVersionKey(PUBLIC_ROOM_CODE), room.version, { ex: ROOM_TTL_SECONDS }),
    kv.set(roomMetaKey(PUBLIC_ROOM_CODE), meta, { ex: ROOM_TTL_SECONDS }),
    kv.set(
      roomHostKey(PUBLIC_ROOM_CODE),
      {
        hostSessionId,
        hostToken,
        lastSeenAt: createdAt,
      },
      { ex: ROOM_TTL_SECONDS },
    ),
  ]);

  return room;
}

/** Overlay latest presence fields from per-player KV blobs without touching game totals (scores, streaks). */
export async function mergePlayerPresenceFromKeys(room: RoomState): Promise<RoomState> {
  const code = room.roomCode;
  let player1 = room.players.player1;
  let player2 = room.players.player2;

  if (player1) {
    const blob = await getRoomPlayer(code, player1.playerId);
    if (blob && blob.playerId === player1.playerId) {
      player1 = { ...player1, lastSeenAt: blob.lastSeenAt, status: blob.status };
    }
  }

  if (player2) {
    const blob = await getRoomPlayer(code, player2.playerId);
    if (blob && blob.playerId === player2.playerId) {
      player2 = { ...player2, lastSeenAt: blob.lastSeenAt, status: blob.status };
    }
  }

  return {
    ...room,
    players: { player1, player2 },
  };
}

export async function getRoomState(roomCode = PUBLIC_ROOM_CODE) {
  const kv = getKv();
  const raw = await kv.get<RoomState>(roomStateKey(roomCode));
  if (!raw) {
    return null;
  }

  const room = coerceRoomStateFromStorage(raw);
  return mergePlayerPresenceFromKeys(room);
}

export async function saveRoomState(room: RoomState) {
  const kv = getKv();
  const versionKey = roomVersionKey(room.roomCode);
  let nextVersion = await kv.incr(versionKey);

  if (nextVersion <= room.version) {
    nextVersion = room.version + 1;
    await kv.set(versionKey, nextVersion, { ex: ROOM_TTL_SECONDS });
  } else {
    await kv.expire(versionKey, ROOM_TTL_SECONDS);
  }

  const nowMs = Date.now();
  const updatedRoom: RoomState = {
    ...room,
    version: nextVersion,
    updatedAt: nowMs,
  };

  await kv.set(roomStateKey(room.roomCode), updatedRoom, { ex: ROOM_TTL_SECONDS });
  return updatedRoom;
}

export function choosePlayerSlot(room: RoomState, preferredSlot?: 1 | 2) {
  if (preferredSlot) {
    const slotKey = preferredSlot === 1 ? "player1" : "player2";
    return room.players[slotKey] ? null : preferredSlot;
  }

  if (!room.players.player1) {
    return 1;
  }

  if (!room.players.player2) {
    return 2;
  }

  return null;
}

export async function joinRoom(player: Player) {
  const kv = getKv();
  const multiplayerEnabled = isMultiplayerEnabled();
  const room = await getRoomState(player.roomCode);

  if (!room) {
    throw new Error("room_not_found");
  }

  if (!["idle", "lobby"].includes(room.phase)) {
    throw new Error("match_in_progress");
  }

  const slotKey = player.slot === 1 ? "player1" : "player2";
  const otherSlotKey = player.slot === 1 ? "player2" : "player1";

  if (room.players[slotKey] && room.players[slotKey]?.playerId !== player.playerId) {
    throw new Error("slot_taken");
  }

  const updatedRoom: RoomState = {
    ...room,
    phase: "lobby",
    phaseStartedAt: room.phase === "lobby" ? room.phaseStartedAt : Date.now(),
    players: {
      ...room.players,
      [slotKey]: player,
    },
    lobby: {
      ...room.lobby,
      allowSoloStart:
        !multiplayerEnabled || (slotKey === "player1" && room.players[otherSlotKey] === null),
      waitingEndsAt:
        !multiplayerEnabled
          ? null
          : room.players.player1 || slotKey === "player2"
          ? room.lobby.waitingEndsAt
          : new Date(Date.now() + LOBBY_WAIT_DURATION_MS).toISOString(),
      previewMessage: null,
    },
  };

  const [persistedRoom] = await Promise.all([
    saveRoomState(updatedRoom),
    kv.set(roomPlayerKey(player.roomCode, player.playerId), player, { ex: ROOM_TTL_SECONDS }),
    kv.set(
      roomPlayersKey(player.roomCode),
      {
        player1Id: updatedRoom.players.player1?.playerId ?? null,
        player2Id: updatedRoom.players.player2?.playerId ?? null,
      },
      { ex: ROOM_TTL_SECONDS },
    ),
  ]);

  return persistedRoom;
}

export async function getRoomPlayer(roomCode: string, playerId: string) {
  const kv = getKv();
  return kv.get<Player>(roomPlayerKey(roomCode, playerId));
}

export async function saveRoomPlayer(roomCode: string, player: Player) {
  const kv = getKv();
  await kv.set(roomPlayerKey(roomCode, player.playerId), player, { ex: ROOM_TTL_SECONDS });
}

export async function saveQuestionBank(roomCode: string, questions: Question[]) {
  const kv = getKv();
  await kv.set(roomQuestionBankKey(roomCode), questions, { ex: ROOM_TTL_SECONDS });
}

export async function getQuestionBank(roomCode: string) {
  const kv = getKv();
  return (await kv.get<Question[]>(roomQuestionBankKey(roomCode))) ?? [];
}

export async function clearQuestionBank(roomCode: string) {
  const kv = getKv();
  await kv.del(roomQuestionBankKey(roomCode));
}
