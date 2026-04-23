import { ok, fail } from "@/lib/api/http";
import { requireHost } from "@/lib/api/room-auth";
import { startMatch } from "@/lib/game/engine";
import { getQuestionBank, getRoomState, saveQuestionBank, saveRoomState } from "@/lib/kv/room-store";
import { getRandomQuestions } from "@/lib/sheets/question-repo";
import { roomCodeSchema, startRoomSchema } from "@/lib/validation/room";
import { MATCH_QUESTION_COUNT } from "@/lib/game/constants";

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

  const parsed = startRoomSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_start_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState(parsedRoomCode.data);

    if (!room) {
      return fail("room_not_found", 404, "Room not found");
    }

    if (!requireHost(room, parsed.data.hostToken)) {
      return fail("invalid_host_token", 403, "Host token is invalid");
    }

    if (!room.players.player1) {
      return fail("missing_player_1", 409, "At least one player must join before starting");
    }

    if (parsed.data.mode === "battle" && !room.players.player2) {
      return fail("missing_player_2", 409, "Battle mode requires two players");
    }

    const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);
    const { room: startedRoom } = startMatch(room, parsed.data.mode, questions, new Date().toISOString());

    await Promise.all([
      saveQuestionBank(parsedRoomCode.data, questions),
      saveRoomState(startedRoom),
      getQuestionBank(parsedRoomCode.data),
    ]);

    return ok({ room: startedRoom });
  } catch (error) {
    console.error("start room error", error);
    return fail("server_error", 500, "Unable to start match");
  }
}
