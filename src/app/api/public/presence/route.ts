import { ok, fail } from "@/lib/api/http";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { getRoomState, saveRoomPlayer, saveRoomState } from "@/lib/kv/room-store";
import { z } from "zod";

const publicPresenceSchema = z.object({
  playerId: z.string().trim().min(1),
  controllerToken: z.string().trim().min(1),
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "El cuerpo debe ser JSON valido.");
  }

  const parsed = publicPresenceSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_presence_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const player = findPlayerById(room, parsed.data.playerId);

    if (!player || !requirePlayerToken(player, parsed.data.controllerToken)) {
      return fail("invalid_player_token", 403, "El jugador no es valido.");
    }

    const nowIso = new Date().toISOString();
    const slotKey = player.slot === 1 ? "player1" : "player2";
    const updatedPlayer = {
      ...player,
      lastSeenAt: nowIso,
      status: "connected" as const,
    };
    const updatedRoom = {
      ...room,
      players: {
        ...room.players,
        [slotKey]: updatedPlayer,
      },
    };

    await Promise.all([saveRoomState(updatedRoom), saveRoomPlayer(room.roomCode, updatedPlayer)]);
    return ok({ lastSeenAt: nowIso });
  } catch (error) {
    console.error("public presence error", error);
    return fail("server_error", 500, "No se pudo actualizar la presencia.");
  }
}
