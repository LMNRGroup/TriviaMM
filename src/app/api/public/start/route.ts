import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { MATCH_QUESTION_COUNT } from "@/lib/game/constants";
import { startMatch } from "@/lib/game/engine";
import { getQuestionBank, getRoomState, saveQuestionBank, saveRoomState } from "@/lib/kv/room-store";
import { getRandomQuestions } from "@/lib/sheets/question-repo";
import { publicStartSchema } from "@/lib/validation/room";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "El cuerpo debe ser JSON valido.");
  }

  const parsed = publicStartSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_start_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    const player = findPlayerById(room, parsed.data.playerId);

    if (!player || player.slot !== 1) {
      return fail("only_player_1", 403, "Solo el jugador 1 puede iniciar la partida.");
    }

    if (!requirePlayerToken(player, parsed.data.controllerToken)) {
      return fail("invalid_token", 403, "El token del jugador es invalido.");
    }

    if (parsed.data.mode === "battle" && !room.players.player2) {
      return fail("missing_player_2", 409, "Se necesita un segundo jugador para duelo.");
    }

    const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);
    const { room: startedRoom } = startMatch(room, parsed.data.mode, questions, new Date().toISOString());

    await Promise.all([saveQuestionBank(room.roomCode, questions), saveRoomState(startedRoom), getQuestionBank(room.roomCode)]);

    return ok({ room: toPublicRoomState(startedRoom) });
  } catch (error) {
    console.error("public start error", error);
    return fail("server_error", 500, "No se pudo iniciar la partida.");
  }
}
