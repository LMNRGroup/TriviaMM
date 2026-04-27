import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { requireHost } from "@/lib/api/room-auth";
import { startMatch } from "@/lib/game/engine";
import { getRoomState, saveQuestionBank, saveRoomState, withRoomMutationLock } from "@/lib/kv/room-store";
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
    const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);

    if (questions.length === 0) {
      return fail("question_bank_empty", 409, "No questions are available to start the match");
    }

    const startedRoom = await withRoomMutationLock(parsedRoomCode.data, async () => {
      const room = await getRoomState(parsedRoomCode.data);

      if (!room) {
        throw new Error("room_not_found");
      }

      if (!requireHost(room, parsed.data.hostToken)) {
        throw new Error("invalid_host_token");
      }

      if (room.phase !== "idle" && room.phase !== "lobby") {
        return room;
      }

      if (!room.players.player1) {
        throw new Error("missing_player_1");
      }

      if (parsed.data.mode === "battle" && !room.players.player2) {
        throw new Error("missing_player_2");
      }

      const { room: nextRoom } = startMatch(room, parsed.data.mode, questions, new Date().toISOString());
      await Promise.all([saveQuestionBank(parsedRoomCode.data, questions), saveRoomState(nextRoom)]);
      return nextRoom;
    });

    return ok({ room: toPublicRoomState(startedRoom) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_not_found") {
        return fail("room_not_found", 404, "Room not found");
      }

      if (error.message === "invalid_host_token") {
        return fail("invalid_host_token", 403, "Host token is invalid");
      }

      if (error.message === "missing_player_1") {
        return fail("missing_player_1", 409, "At least one player must join before starting");
      }

      if (error.message === "missing_player_2") {
        return fail("missing_player_2", 409, "Battle mode requires two players");
      }
    }

    console.error("start room error", error);
    return fail("server_error", 500, "Unable to start match");
  }
}
