import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { createInitialRoomState } from "@/lib/game/default-room";
import type { Player, Question, RoomState } from "@/lib/types/game";
import { getKv } from "@/lib/kv/client";
import {
  ROOM_TTL_SECONDS,
  roomHostKey,
  roomMetaKey,
  roomPlayerKey,
  roomPlayersKey,
  roomQuestionBankKey,
  roomStateKey,
} from "@/lib/kv/keys";
import { createHostToken, createSessionId } from "@/lib/utils/ids";

interface RoomMetaRecord {
  roomCode: string;
  hostSessionId: string;
  hostToken: string;
  createdAt: string;
  expiresAt: string;
}

export async function ensurePublicRoom(baseUrl: string) {
  const kv = getKv();
  const existing = await kv.get<RoomState>(roomStateKey(PUBLIC_ROOM_CODE));

  if (existing) {
    return existing;
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

export async function getRoomState(roomCode = PUBLIC_ROOM_CODE) {
  const kv = getKv();
  return kv.get<RoomState>(roomStateKey(roomCode));
}

export async function saveRoomState(room: RoomState) {
  const kv = getKv();
  const updatedRoom: RoomState = {
    ...room,
    updatedAt: new Date().toISOString(),
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
    players: {
      ...room.players,
      [slotKey]: player,
    },
    lobby: {
      ...room.lobby,
      allowSoloStart: slotKey === "player1" && room.players[otherSlotKey] === null,
      waitingEndsAt:
        room.players.player1 || slotKey === "player2"
          ? room.lobby.waitingEndsAt
          : new Date(Date.now() + 120_000).toISOString(),
    },
  };

  await Promise.all([
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

  return updatedRoom;
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
