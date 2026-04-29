import { ok, fail } from "@/lib/api/http";
import { findPlayerById, requireHost, requirePlayerToken } from "@/lib/api/room-auth";
import { getRoomState, saveRoomPlayer } from "@/lib/kv/room-store";
import { presenceSchema } from "@/lib/validation/answer";
import { roomCodeSchema } from "@/lib/validation/room";

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

  const parsed = presenceSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_presence_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState(parsedRoomCode.data);

    if (!room) {
      return fail("room_not_found", 404, "Room not found");
    }

    const nowIso = new Date().toISOString();

    if (parsed.data.actorType === "host") {
      if (!requireHost(room, parsed.data.token)) {
        return fail("invalid_host_token", 403, "Host token is invalid");
      }

      // Host presence is tracked out-of-band; avoid room writes to prevent stale-state overwrite races.
      return ok({ lastSeenAt: nowIso });
    }

    const player = findPlayerById(room, parsed.data.actorId);

    if (!player || !requirePlayerToken(player, parsed.data.token)) {
      return fail("invalid_player_token", 403, "Player token is invalid");
    }

    const updatedPlayer = {
      ...player,
      lastSeenAt: nowIso,
      status: "connected" as const,
    };
    await saveRoomPlayer(parsedRoomCode.data, updatedPlayer);
    return ok({ lastSeenAt: nowIso });
  } catch (error) {
    console.error("presence error", error);
    return fail("server_error", 500, "Unable to refresh presence");
  }
}
