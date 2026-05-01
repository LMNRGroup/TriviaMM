import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { recoverPublicRoomState } from "@/lib/game/room-recovery";
import { ensurePublicRoom, getRoomState } from "@/lib/kv/room-store";
import { getBaseUrl } from "@/lib/utils/env";

function shouldIncludePlayerIds(room: Awaited<ReturnType<typeof getRoomState>>, request: Request) {
  if (!room) {
    return false;
  }

  const playerId = request.headers.get("x-trivia-player-id")?.trim();
  const controllerToken = request.headers.get("x-trivia-controller-token")?.trim();

  if (!playerId || !controllerToken) {
    return false;
  }

  const player =
    room.players.player1?.playerId === playerId
      ? room.players.player1
      : room.players.player2?.playerId === playerId
        ? room.players.player2
        : null;

  if (!player) {
    return false;
  }

  return player.controllerToken === controllerToken;
}

export async function GET(request: Request) {
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

    room = await recoverPublicRoomState(room, {
      allowHardReset: true,
      maxTransitions: 8,
    });
    const includePlayerIds = shouldIncludePlayerIds(room, request);

    return ok({
      room: toPublicRoomState(room, { includePlayerIds }),
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
