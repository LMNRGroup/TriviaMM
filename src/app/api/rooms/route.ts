import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { ok, fail } from "@/lib/api/http";
import { getBaseUrl } from "@/lib/utils/env";
import { ensurePublicRoom } from "@/lib/kv/room-store";

export async function POST() {
  try {
    const room = await ensurePublicRoom(getBaseUrl());

    return ok({
      roomCode: PUBLIC_ROOM_CODE,
      hostToken: room.hostToken,
      hostSessionId: room.hostSessionId,
      playUrl: `${getBaseUrl()}/play`,
      qrUrl: `${getBaseUrl()}/play`,
      hostUrl: `${getBaseUrl()}/host`,
    });
  } catch (error) {
    console.error("create room error", error);
    return fail("server_error", 500, "Unable to create room");
  }
}
