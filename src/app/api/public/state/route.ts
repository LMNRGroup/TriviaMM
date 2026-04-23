import { ok, fail } from "@/lib/api/http";
import { sanitizeRoomState } from "@/lib/api/room-state";
import { getKv } from "@/lib/kv/client";
import { returningPlayerByIpKey } from "@/lib/kv/keys";
import { ensurePublicRoom, getRoomState } from "@/lib/kv/room-store";
import { getRegisteredPlayerById } from "@/lib/sheets/player-repo";
import { getBaseUrl } from "@/lib/utils/env";
import { getRequestIp } from "@/lib/utils/request";

export async function GET(request: Request) {
  try {
    await ensurePublicRoom(getBaseUrl());
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const ipAddress = getRequestIp(request);
    const rememberedPlayerId = await getKv().get<string>(returningPlayerByIpKey(ipAddress));
    const rememberedPlayer = rememberedPlayerId ? await getRegisteredPlayerById(rememberedPlayerId) : null;

    return ok({
      room: sanitizeRoomState(room),
      rememberedPlayer: rememberedPlayer
        ? {
            playerId: rememberedPlayer.playerId,
            name: rememberedPlayer.name,
            country: rememberedPlayer.country,
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
