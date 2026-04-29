import { ok, fail } from "@/lib/api/http";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { applyAnswerSubmission, createAnswerSubmission } from "@/lib/game/engine";
import { getQuestionBank, getRoomState, saveRoomPlayer, saveRoomState, withRoomMutationLock } from "@/lib/kv/room-store";
import { answerSubmissionSchema } from "@/lib/validation/answer";
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

  const parsed = answerSubmissionSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_answer_payload", 400, parsed.error.issues[0]?.message);
  }

  try {
    const result = await withRoomMutationLock(parsedRoomCode.data, async () => {
      const room = await getRoomState(parsedRoomCode.data);

      if (!room) {
        throw new Error("room_not_found");
      }

      if (room.phase !== "question") {
        throw new Error("phase_not_answerable");
      }

      const player = findPlayerById(room, parsed.data.playerId);

      if (!player) {
        throw new Error("invalid_player");
      }

      if (!requirePlayerToken(player, parsed.data.controllerToken)) {
        throw new Error("invalid_token");
      }

      if (parsed.data.questionId !== room.currentQuestion.questionId || parsed.data.questionIndex !== room.currentQuestion.questionIndex) {
        throw new Error("question_mismatch");
      }

      const slotKey = player.slot === 1 ? "player1" : "player2";

      if (room.answers[slotKey]) {
        throw new Error("already_answered");
      }

      const questionBank = await getQuestionBank(parsedRoomCode.data);
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
      await Promise.all([saveRoomState(updatedRoom), saveRoomPlayer(parsedRoomCode.data, updatedRoom.players[slotKey]!)]);

      return { submission };
    });

    return ok({
      submission: {
        accepted: true,
        locked: false,
        receivedAt: result.submission.submittedAt,
        feedback:
          result.submission.status === "timeout"
            ? "timeout"
            : result.submission.isCorrect
              ? "correct"
              : "incorrect",
        responseTimeMs: result.submission.responseTimeMs,
        awardedPoints: result.submission.awardedPoints,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_not_found") {
        return fail("room_not_found", 404, "Room not found");
      }

      if (error.message === "phase_not_answerable") {
        return fail("phase_not_answerable", 409, "The room is not currently accepting answers");
      }

      if (error.message === "invalid_player") {
        return fail("invalid_player", 404, "Player not found in room");
      }

      if (error.message === "invalid_token") {
        return fail("invalid_token", 403, "Controller token is invalid");
      }

      if (error.message === "question_mismatch") {
        return fail("question_mismatch", 409, "Question payload does not match current room question");
      }

      if (error.message === "already_answered") {
        return fail("already_answered", 409, "Player already answered this question");
      }

      if (error.message === "question_not_found") {
        return fail("question_not_found", 404, "Question record was not found");
      }
    }

    console.error("answer submission error", error);
    return fail("server_error", 500, "Unable to submit answer");
  }
}
