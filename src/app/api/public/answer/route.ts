import { ok, fail } from "@/lib/api/http";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { applyAnswerSubmission, createAnswerSubmission } from "@/lib/game/engine";
import { PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { getQuestionBank, getRoomState, saveRoomPlayer, saveRoomState, withRoomMutationLock } from "@/lib/kv/room-store";
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
    const result = await withRoomMutationLock(PUBLIC_ROOM_CODE, async () => {
      const room = await getRoomState();

      if (!room) {
        throw new Error("room_not_found");
      }

      if (room.phase !== "question") {
        throw new Error("phase_not_answerable");
      }

      const player = findPlayerById(room, parsed.data.playerId);

      if (!player || !requirePlayerToken(player, parsed.data.controllerToken)) {
        throw new Error("invalid_player");
      }

      if (parsed.data.questionId !== room.currentQuestion.questionId || parsed.data.questionIndex !== room.currentQuestion.questionIndex) {
        throw new Error("question_mismatch");
      }

      const slotKey = player.slot === 1 ? "player1" : "player2";

      if (room.answers[slotKey]) {
        throw new Error("already_answered");
      }

      const questionBank = await getQuestionBank(room.roomCode);
      const question = questionBank.find((candidate) => candidate.questionId === parsed.data.questionId);

      if (!question) {
        throw new Error("question_not_found");
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

      return { submission };
    });

    return ok({
      submission: {
        accepted: true,
        locked: false,
        receivedAt: result.submission.submittedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_not_found") {
        return fail("room_not_found", 404, "No se encontro la sala publica.");
      }

      if (error.message === "phase_not_answerable") {
        return fail("phase_not_answerable", 409, "Ahora mismo no se estan aceptando respuestas.");
      }

      if (error.message === "invalid_player") {
        return fail("invalid_player", 403, "El jugador no es valido para esta partida.");
      }

      if (error.message === "question_mismatch") {
        return fail("question_mismatch", 409, "La respuesta no coincide con la pregunta activa.");
      }

      if (error.message === "already_answered") {
        return fail("already_answered", 409, "Ya respondiste esta pregunta.");
      }

      if (error.message === "question_not_found") {
        return fail("question_not_found", 404, "No se encontro la pregunta actual.");
      }
    }

    console.error("public answer error", error);
    return fail("server_error", 500, "No se pudo enviar la respuesta.");
  }
}
