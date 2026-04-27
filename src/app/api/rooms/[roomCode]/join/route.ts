import { ok, fail } from "@/lib/api/http";
import { toJoinPlayerPayload, toPublicRoomJoinSlice } from "@/lib/api/room-state";
import { choosePlayerSlot, getRoomState, joinRoom, withRoomMutationLock } from "@/lib/kv/room-store";
import { buildLivePlayerFromRegistration, getRegisteredPlayerById } from "@/lib/sheets/player-repo";
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
    const registration = await getRegisteredPlayerById(parsedBody.data.playerId);

    if (!registration) {
      return fail("player_not_found", 404, "Registration record was not found");
    }

    const result = await withRoomMutationLock(parsedRoomCode.data, async () => {
      const existingRoom = await getRoomState(parsedRoomCode.data);

      if (!existingRoom) {
        throw new Error("room_not_found");
      }

      const slot = choosePlayerSlot(existingRoom, parsedBody.data.preferredSlot);

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
    }

    console.error("join room error", error);
    return fail("server_error", 500, "Unable to join room");
  }
}
