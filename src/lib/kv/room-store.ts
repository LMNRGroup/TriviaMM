import type { RoomState } from "@/lib/types/game";
import { createInitialRoomState } from "@/lib/game/default-room";
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
import { createHostToken, createRoomCode, createSessionId } from "@/lib/utils/ids";
import type { Player, Question } from "@/lib/types/game";

interface RoomMetaRecord {
  roomCode: string;
  hostSessionId: string;
  hostToken: string;
  createdAt: string;
  expiresAt: string;
}

interface CreateRoomResult {
  room: RoomState;
  roomCode: string;
  hostToken: string;
  hostSessionId: string;
}

export async function createRoom(playUrlBase: string): Promise<CreateRoomResult> {
  const kv = getKv();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = createRoomCode();
    const stateKey = roomStateKey(roomCode);
    const existing = await kv.get<RoomState>(stateKey);

    if (existing) {
      continue;
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ROOM_TTL_SECONDS * 1000).toISOString();
    const hostSessionId = createSessionId();
    const hostToken = createHostToken();
    const qrUrl = `${playUrlBase}/play/${roomCode}`;
    const room = createInitialRoomState({
      roomCode,
      hostSessionId,
      hostToken,
      qrUrl,
      createdAt,
      expiresAt,
    });

    const meta: RoomMetaRecord = {
      roomCode,
      hostSessionId,
      hostToken,
      createdAt,
      expiresAt,
    };

    await Promise.all([
      kv.set(stateKey, room, { ex: ROOM_TTL_SECONDS }),
      kv.set(roomMetaKey(roomCode), meta, { ex: ROOM_TTL_SECONDS }),
      kv.set(roomHostKey(roomCode), {
        hostSessionId,
        hostToken,
        lastSeenAt: createdAt,
      }, { ex: ROOM_TTL_SECONDS }),
    ]);

    return {
      room,
      roomCode,
      hostToken,
      hostSessionId,
    };
  }

  throw new Error("Unable to allocate a unique room code");
}

export async function getRoomState(roomCode: string) {
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

export async function joinRoom(roomCode: string, player: Player) {
  const kv = getKv();
  const room = await getRoomState(roomCode);

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

  if (room.players.player1?.playerId === player.playerId || room.players.player2?.playerId === player.playerId) {
    throw new Error("player_already_joined");
  }

  const updatedRoom: RoomState = {
    ...room,
    phase: "lobby",
    players: {
      ...room.players,
      [slotKey]: player,
    },
    lobby: {
      allowSoloStart: slotKey === "player1" && room.players[otherSlotKey] === null,
      soloStartRequestedAt: room.lobby.soloStartRequestedAt,
    },
  };

  await Promise.all([
    saveRoomState(updatedRoom),
    kv.set(roomPlayerKey(roomCode, player.playerId), player, { ex: ROOM_TTL_SECONDS }),
    kv.set(
      roomPlayersKey(roomCode),
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
