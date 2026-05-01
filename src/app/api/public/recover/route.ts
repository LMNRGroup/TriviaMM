import { fail, ok } from "@/lib/api/http";
import { hasAdminAccess } from "@/lib/api/admin-auth";
import { toPublicRoomState } from "@/lib/api/room-state";
import { forceResetPublicRoomNow, recoverPublicRoomState } from "@/lib/game/room-recovery";
import { ensurePublicRoom, getRoomState } from "@/lib/kv/room-store";
import { getBaseUrl } from "@/lib/utils/env";

export async function POST(request: Request) {
  if (!hasAdminAccess(request)) {
    return fail("forbidden", 403, "No autorizado para recuperar o reiniciar la sala.");
  }

  let force = false;

  try {
    const payload = (await request.json()) as { force?: unknown };
    force = payload?.force === true;
  } catch {
    force = false;
  }

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

    const nextRoom = force
      ? await forceResetPublicRoomNow()
      : await recoverPublicRoomState(room, { allowHardReset: true, maxTransitions: 8 });

    if (!nextRoom) {
      return fail("room_unavailable", 503, "No se pudo recuperar la sala publica.");
    }

    return ok({
      room: toPublicRoomState(nextRoom),
      recovered: true,
      forced: force,
    });
  } catch (error) {
    console.error("public recover error", error);
    if (error instanceof Error && error.message.includes("[kv]")) {
      return fail("kv_unavailable", 503, error.message);
    }
    return fail("server_error", 500, "No se pudo recuperar la sala publica.");
  }
}
