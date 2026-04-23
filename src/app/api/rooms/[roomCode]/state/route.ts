import { ok, fail } from "@/lib/api/http";
import { sanitizeRoomState } from "@/lib/api/room-state";
import { getRoomState } from "@/lib/kv/room-store";
import { roomCodeSchema } from "@/lib/validation/room";

interface RouteContext {
  params: Promise<{ roomCode: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const { roomCode } = await context.params;
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);

  if (!parsedRoomCode.success) {
    return fail("invalid_room_code", 400, "Room code format is invalid");
  }

  try {
    const room = await getRoomState(parsedRoomCode.data);

    if (!room) {
      return fail("room_not_found", 404, "Room not found");
    }

    return ok({
      room: sanitizeRoomState(room),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("get room state error", error);
    return fail("server_error", 500, "Unable to load room state");
  }
}
