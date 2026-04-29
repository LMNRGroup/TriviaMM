import { ok, fail } from "@/lib/api/http";
import { assertPublicTickAllowed } from "@/lib/api/public-tick-rate-limit";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { toPublicRoomState } from "@/lib/api/room-state";
import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { runTickWithOptimisticRetry } from "@/lib/game/room-tick-runner";
import { getRoomState } from "@/lib/kv/room-store";
import { getRequestIp } from "@/lib/utils/request";
import { publicTickSchema } from "@/lib/validation/room";

export async function POST(request: Request) {
  let payload: unknown = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const parsed = publicTickSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_tick_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const rate = await assertPublicTickAllowed(getRequestIp(request));
    if (!rate.ok) {
      return fail("rate_limited", 429, "Demasiadas solicitudes. Espera un momento.");
    }

    const room = await getRoomState(PUBLIC_ROOM_CODE);
    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const actor = findPlayerById(room, parsed.data.playerId);
    if (!actor || !requirePlayerToken(actor, parsed.data.controllerToken)) {
      return fail("invalid_tick_actor", 403, "El avance de tiempo requiere un jugador valido con token.");
    }

    const activeOrWaiting =
      room.phase !== "idle" &&
      (room.phase !== "lobby" || Boolean(room.lobby.waitingEndsAt));

    if (activeOrWaiting) {
      const tickDriver = room.players.player1 ?? room.players.player2;

      if (!tickDriver) {
        return fail("missing_tick_driver", 409, "No hay jugador controlador para avanzar la partida.");
      }

      if (actor.playerId !== tickDriver.playerId) {
        return fail("invalid_tick_driver", 403, "Solo el jugador controlador puede avanzar el tiempo.");
      }
    }

    const outcome = await runTickWithOptimisticRetry(PUBLIC_ROOM_CODE);

    if (!outcome.ok) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    return ok({
      room: toPublicRoomState(outcome.room),
      transitionApplied: outcome.transitionApplied,
    });
  } catch (error) {
    console.error("public tick error", error);
    return fail("server_error", 500, "No se pudo avanzar la partida.");
  }
}
