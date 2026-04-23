import { ok, fail } from "@/lib/api/http";
import { tickRoom } from "@/lib/game/engine";
import { clearQuestionBank, getQuestionBank, getRoomState, saveRoomState } from "@/lib/kv/room-store";

export async function POST() {
  try {
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const questionBank = await getQuestionBank(room.roomCode);
    const result = await tickRoom({
      room,
      questionBank,
      nowIso: new Date().toISOString(),
    });

    await saveRoomState(result.room);

    if (result.room.phase === "idle") {
      await clearQuestionBank(result.room.roomCode);
    }

    return ok({
      room: result.room,
      transitionApplied: result.transitionApplied,
    });
  } catch (error) {
    console.error("public tick error", error);
    return fail("server_error", 500, "No se pudo avanzar la partida.");
  }
}
