import { ok, fail } from "@/lib/api/http";
import { assertPublicTickAllowed } from "@/lib/api/public-tick-rate-limit";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { toPublicRoomState } from "@/lib/api/room-state";
import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { runAuthoritativeRoomTick } from "@/lib/game/room-tick-runner";
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
      return fail(
        "room_unavailable",
        503,
        "La sala publica no esta disponible temporalmente en este nodo. Intenta de nuevo.",
      );
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

    const outcome = await runAuthoritativeRoomTick(PUBLIC_ROOM_CODE, {
      expectedDriverPlayerId: actor.playerId,
    });

    if (!outcome.ok) {
      if (outcome.error === "driver_mismatch") {
        return fail("invalid_tick_driver", 409, "El jugador controlador cambio. Reintenta con el estado mas reciente.");
      }
      return fail(
        "room_unavailable",
        503,
        "La sala publica no esta disponible temporalmente en este nodo. Intenta de nuevo.",
      );
    }

    return ok({
      room: toPublicRoomState(outcome.room, { includePlayerIds: true }),
      transitionApplied: outcome.transitionApplied,
    });
  } catch (error) {
    console.error("public tick error", error);
    if (error instanceof Error && error.message.includes("[kv]")) {
      return fail("kv_unavailable", 503, error.message);
    }
    return fail("server_error", 500, "No se pudo avanzar la partida.");
  }
}
