import { ok, fail } from "@/lib/api/http";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { applyAnswerSubmission, createAnswerSubmission } from "@/lib/game/engine";
import { getQuestionBank, getRoomState, saveRoomPlayer, saveRoomState } from "@/lib/kv/room-store";
import { answerSubmissionSchema } from "@/lib/validation/answer";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "El cuerpo debe ser JSON valido.");
  }

  const parsed = answerSubmissionSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_answer_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const room = await getRoomState();

    if (!room) {
      return fail("room_not_found", 404, "No se encontro la sala publica.");
    }

    if (room.phase !== "question") {
      return fail("phase_not_answerable", 409, "Ahora mismo no se estan aceptando respuestas.");
    }

    const player = findPlayerById(room, parsed.data.playerId);

    if (!player || !requirePlayerToken(player, parsed.data.controllerToken)) {
      return fail("invalid_player", 403, "El jugador no es valido para esta partida.");
    }

    if (parsed.data.questionId !== room.currentQuestion.questionId || parsed.data.questionIndex !== room.currentQuestion.questionIndex) {
      return fail("question_mismatch", 409, "La respuesta no coincide con la pregunta activa.");
    }

    const slotKey = player.slot === 1 ? "player1" : "player2";

    if (room.answers[slotKey]) {
      return fail("already_answered", 409, "Ya respondiste esta pregunta.");
    }

    const questionBank = await getQuestionBank(room.roomCode);
    const question = questionBank.find((candidate) => candidate.questionId === parsed.data.questionId);

    if (!question) {
      return fail("question_not_found", 404, "No se encontro la pregunta actual.");
    }

    const submission = createAnswerSubmission({
      room,
      player,
      question,
      selectedChoice: parsed.data.selectedChoice,
      submittedAt: new Date().toISOString(),
    });

    const updatedRoom = applyAnswerSubmission(room, player, submission);
    await Promise.all([saveRoomState(updatedRoom), saveRoomPlayer(room.roomCode, updatedRoom.players[slotKey]!)]); 

    return ok({
      submission: {
        accepted: true,
        locked: false,
        receivedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    console.error("public answer error", error);
    return fail("server_error", 500, "No se pudo enviar la respuesta.");
  }
}
