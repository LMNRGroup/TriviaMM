import { randomUUID } from "node:crypto";
import { ok, fail } from "@/lib/api/http";
import { choosePlayerSlot, ensurePublicRoom, getRoomState, joinRoom } from "@/lib/kv/room-store";
import { getKv } from "@/lib/kv/client";
import { returningPlayerByIpKey } from "@/lib/kv/keys";
import { buildLivePlayerFromRegistration, getRegisteredPlayerById } from "@/lib/sheets/player-repo";
import { getBaseUrl } from "@/lib/utils/env";
import { getRequestIp } from "@/lib/utils/request";
import { joinRoomSchema } from "@/lib/validation/room";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "El cuerpo debe ser JSON valido.");
  }

  const parsedBody = joinRoomSchema.safeParse(payload);

  if (!parsedBody.success) {
    return fail("invalid_join_payload", 400, parsedBody.error.issues[0]?.message);
  }

  try {
    await ensurePublicRoom(getBaseUrl());
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    if (!["idle", "lobby"].includes(room.phase)) {
      return fail("active_session", 409, "Ya hay una partida activa. Espera a que termine para entrar.");
    }

    const registration = await getRegisteredPlayerById(parsedBody.data.playerId);

    if (!registration) {
      return fail("player_not_found", 404, "No se encontro el registro del jugador.");
    }

    const existingPlayer =
      room.players.player1?.playerId === registration.playerId
        ? room.players.player1
        : room.players.player2?.playerId === registration.playerId
          ? room.players.player2
          : null;

    if (existingPlayer) {
      return ok({
        player: existingPlayer,
        room: {
          phase: room.phase,
          mode: room.mode,
          players: room.players,
          lobby: room.lobby,
        },
      });
    }

    const slot = choosePlayerSlot(room, parsedBody.data.preferredSlot);

    if (!slot) {
      return fail("room_full", 409, "La sala ya tiene dos jugadores.");
    }

    const player = buildLivePlayerFromRegistration({
      roomCode: room.roomCode,
      slot,
      sessionId: parsedBody.data.sessionId,
      controllerToken: `ctrl_${randomUUID()}`,
      registration,
    });

    const updatedRoom = await joinRoom(player);
    const ipAddress = getRequestIp(request);
    await getKv().set(returningPlayerByIpKey(ipAddress), player.playerId, { ex: 60 * 60 * 24 * 30 });

    return ok({
      player,
      room: {
        phase: updatedRoom.phase,
        mode: updatedRoom.mode,
        players: updatedRoom.players,
        lobby: updatedRoom.lobby,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "slot_taken") {
        return fail("slot_taken", 409, "Ese lugar ya esta ocupado.");
      }

      if (error.message === "match_in_progress") {
        return fail("active_session", 409, "Ya hay una partida activa. Espera a que termine.");
      }
    }

    console.error("public join error", error);
    return fail("server_error", 500, "No se pudo unir al jugador.");
  }
}
