import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { ensurePublicRoom, getRoomState } from "@/lib/kv/room-store";
import { getBaseUrl } from "@/lib/utils/env";

export async function GET() {
  try {
    let room = await getRoomState();

    if (!room) {
      await ensurePublicRoom(getBaseUrl());
      room = await getRoomState();
    }

    if (!room) {
      return fail(
        "room_unavailable",
        503,
        "El estado de la sala publica no esta disponible temporalmente en este nodo.",
      );
    }

    return ok({
      room: toPublicRoomState(room),
      rememberedPlayer: null,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("public state error", error);
    if (error instanceof Error && error.message.includes("[kv]")) {
      return fail("kv_unavailable", 503, error.message);
    }
    return fail("server_error", 500, "No se pudo cargar la sala publica.");
  }
}
