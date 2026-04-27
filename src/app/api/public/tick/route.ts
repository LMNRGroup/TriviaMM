import { ok, fail } from "@/lib/api/http";
import { assertPublicTickAllowed } from "@/lib/api/public-tick-rate-limit";
import { toPublicRoomState } from "@/lib/api/room-state";
import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { runTickWithOptimisticRetry } from "@/lib/game/room-tick-runner";
import { getRequestIp } from "@/lib/utils/request";

export async function POST(request: Request) {
  try {
    const rate = await assertPublicTickAllowed(getRequestIp(request));
    if (!rate.ok) {
      return fail("rate_limited", 429, "Demasiadas solicitudes. Espera un momento.");
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
