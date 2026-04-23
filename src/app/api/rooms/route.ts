import { createRoom } from "@/lib/kv/room-store";
import { ok, fail } from "@/lib/api/http";
import { getBaseUrl } from "@/lib/utils/env";

export async function POST() {
  try {
    const room = await createRoom(getBaseUrl());

    return ok({
      roomCode: room.roomCode,
      hostToken: room.hostToken,
      hostSessionId: room.hostSessionId,
      playUrl: room.room.qrUrl,
      qrUrl: room.room.qrUrl,
    });
  } catch (error) {
    console.error("create room error", error);
    return fail("server_error", 500, "Unable to create room");
  }
}
