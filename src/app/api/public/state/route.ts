import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { getKv } from "@/lib/kv/client";
import { returningPlayerByIpKey } from "@/lib/kv/keys";
import { ensurePublicRoom, getRoomState } from "@/lib/kv/room-store";
import { getRegisteredPlayerById } from "@/lib/sheets/player-repo";
import { getBaseUrl } from "@/lib/utils/env";
import { getRequestIp } from "@/lib/utils/request";

export async function GET(request: Request) {
  try {
    const sessionPlayerId = request.headers.get("x-trivia-player-id")?.trim() ?? "";
    const currentMatchHint = request.headers.get("x-trivia-current-match-id")?.trim() ?? "";
    let room = await getRoomState();

    if (!room) {
      if (sessionPlayerId && currentMatchHint) {
        return fail(
          "room_unavailable",
          503,
          "El estado de la sala no esta disponible temporalmente en este nodo. Intenta de nuevo.",
        );
      }

      await ensurePublicRoom(getBaseUrl());
      room = await getRoomState();
    }

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const ipAddress = getRequestIp(request);
    const rememberedPlayerId = await getKv().get<string>(returningPlayerByIpKey(ipAddress));
    let rememberedPlayer = null;

    if (rememberedPlayerId) {
      try {
        rememberedPlayer = await getRegisteredPlayerById(rememberedPlayerId);
      } catch (error) {
        console.error("remembered player lookup error", error);
      }
    }

    return ok({
      room: toPublicRoomState(room),
      rememberedPlayer: rememberedPlayer
        ? {
            playerId: rememberedPlayer.playerId,
            name: rememberedPlayer.name,
            city: rememberedPlayer.city,
            age: rememberedPlayer.age,
            email: rememberedPlayer.email,
          }
        : null,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("public state error", error);
    return fail("server_error", 500, "No se pudo cargar la sala publica.");
  }
}
