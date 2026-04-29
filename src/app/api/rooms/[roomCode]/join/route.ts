import { ok, fail } from "@/lib/api/http";
import { toJoinPlayerPayload, toPublicRoomJoinSlice } from "@/lib/api/room-state";
import { choosePlayerSlot, getRoomState, joinRoom, withRoomMutationLock } from "@/lib/kv/room-store";
import { buildLivePlayerFromRegistration, getRegisteredPlayerById } from "@/lib/sheets/player-repo";
import { isBattleModeEnabled, isMultiplayerEnabled } from "@/lib/utils/env";
import { roomCodeSchema, joinRoomSchema } from "@/lib/validation/room";
import { randomUUID } from "node:crypto";

interface RouteContext {
  params: Promise<{ roomCode: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { roomCode } = await context.params;
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);

  if (!parsedRoomCode.success) {
    return fail("invalid_room_code", 400, "Room code format is invalid");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "Request body must be valid JSON");
  }

  const parsedBody = joinRoomSchema.safeParse(payload);

  if (!parsedBody.success) {
    return fail("invalid_join_payload", 400, parsedBody.error.issues[0]?.message);
  }

  try {
    const multiplayerEnabled = isMultiplayerEnabled();
    const battleModeEnabled = isBattleModeEnabled();
    const registration = await getRegisteredPlayerById(parsedBody.data.playerId);

    if (!registration) {
      return fail("player_not_found", 404, "Registration record was not found");
    }

    const result = await withRoomMutationLock(parsedRoomCode.data, async () => {
      const existingRoom = await getRoomState(parsedRoomCode.data);

      if (!existingRoom) {
        throw new Error("room_not_found");
      }

      if (
        !multiplayerEnabled &&
        existingRoom.players.player1 &&
        existingRoom.players.player1.playerId !== registration.playerId
      ) {
        throw new Error("multiplayer_disabled");
      }

      if (
        !battleModeEnabled &&
        existingRoom.players.player1 &&
        existingRoom.players.player1.playerId !== registration.playerId
      ) {
        throw new Error("battle_mode_disabled");
      }

      const slot = choosePlayerSlot(
        existingRoom,
        multiplayerEnabled && battleModeEnabled ? parsedBody.data.preferredSlot : 1,
      );

      if (!slot) {
        throw new Error("room_full");
      }

      const player = buildLivePlayerFromRegistration({
        roomCode: parsedRoomCode.data,
        slot,
        sessionId: parsedBody.data.sessionId,
        controllerToken: `ctrl_${randomUUID()}`,
        registration,
      });

      const room = await joinRoom(player);
      return { player, room };
    });

    return ok({
      player: toJoinPlayerPayload(result.player),
      room: toPublicRoomJoinSlice({
        version: result.room.version,
        phaseStartedAt: result.room.phaseStartedAt,
        phase: result.room.phase,
        mode: result.room.mode,
        players: result.room.players,
        lobby: result.room.lobby,
      }),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_not_found") {
        return fail("room_not_found", 404, "Room not found");
      }

      if (error.message === "slot_taken") {
        return fail("slot_taken", 409, "Requested slot is already taken");
      }

      if (error.message === "player_already_joined") {
        return fail("player_already_joined", 409, "Player is already in this room");
      }

      if (error.message === "match_in_progress") {
        return fail("match_in_progress", 409, "This room already has an active match");
      }

      if (error.message === "multiplayer_disabled") {
        return fail("multiplayer_disabled", 409, "Multiplayer is temporarily disabled");
      }

      if (error.message === "battle_mode_disabled") {
        return fail("battle_mode_disabled", 409, "Battle mode is temporarily disabled");
      }
    }

    console.error("join room error", error);
    return fail("server_error", 500, "Unable to join room");
  }
}
