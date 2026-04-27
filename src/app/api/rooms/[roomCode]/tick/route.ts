import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { requireHost } from "@/lib/api/room-auth";
import { runTickWithOptimisticRetry } from "@/lib/game/room-tick-runner";
import { getRoomState } from "@/lib/kv/room-store";
import { hostTokenSchema, roomCodeSchema } from "@/lib/validation/room";

interface RouteContext {
  params: Promise<{ roomCode: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { roomCode } = await context.params;
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);

  if (!parsedRoomCode.success) {
    return fail("invalid_room_code", 400, "Room code format is invalid");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "Request body must be valid JSON");
  }

  const parsed = hostTokenSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_host_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState(parsedRoomCode.data);

    if (!room) {
      return fail("room_not_found", 404, "Room not found");
    }

    if (!requireHost(room, parsed.data.hostToken)) {
      return fail("invalid_host_token", 403, "Host token is invalid");
    }

    const outcome = await runTickWithOptimisticRetry(parsedRoomCode.data);

    if (!outcome.ok) {
      return fail("room_not_found", 404, "Room not found");
    }

    return ok({
      room: toPublicRoomState(outcome.room),
      transitionApplied: outcome.transitionApplied,
    });
  } catch (error) {
    console.error("tick room error", error);
    return fail("server_error", 500, "Unable to advance room state");
  }
}
