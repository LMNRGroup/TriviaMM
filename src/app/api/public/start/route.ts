import { ok, fail } from "@/lib/api/http";
import { toPublicRoomState } from "@/lib/api/room-state";
import { findPlayerById, requirePlayerToken } from "@/lib/api/room-auth";
import { MATCH_QUESTION_COUNT, PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { startMatch } from "@/lib/game/engine";
import { recoverPublicRoomState } from "@/lib/game/room-recovery";
import { getRoomState, saveQuestionBank, saveRoomState, withRoomMutationLock } from "@/lib/kv/room-store";
import { getRandomQuestions } from "@/lib/sheets/question-repo";
import { isBattleModeEnabled, isMultiplayerEnabled } from "@/lib/utils/env";
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
    const multiplayerEnabled = isMultiplayerEnabled();
    const battleModeEnabled = isBattleModeEnabled();
    const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);

    const preRoom = await getRoomState(PUBLIC_ROOM_CODE);
    if (preRoom && preRoom.phase !== "idle" && preRoom.phase !== "lobby") {
      await recoverPublicRoomState(preRoom, { allowHardReset: true, maxTransitions: 8 });
    }

    if (questions.length === 0) {
      return fail("question_bank_empty", 409, "No hay preguntas disponibles para iniciar la partida.");
    }

    const startedRoom = await withRoomMutationLock(PUBLIC_ROOM_CODE, async () => {
      const room = await getRoomState();

      if (!room) {
        throw new Error("room_not_found");
      }

      const player = findPlayerById(room, parsed.data.playerId);

      if (!player || player.slot !== 1) {
        throw new Error("only_player_1");
      }

      if (!requirePlayerToken(player, parsed.data.controllerToken)) {
        throw new Error("invalid_token");
      }

      if (room.phase !== "idle" && room.phase !== "lobby") {
        return room;
      }

      if (!multiplayerEnabled && parsed.data.mode === "battle") {
        throw new Error("multiplayer_disabled");
      }

      if (!battleModeEnabled && parsed.data.mode === "battle") {
        throw new Error("battle_mode_disabled");
      }

      if (parsed.data.mode === "battle" && !room.players.player2) {
        throw new Error("missing_player_2");
      }

      if (parsed.data.mode === "solo" && room.players.player2) {
        throw new Error("player_2_present");
      }

      const { room: nextRoom } = startMatch(room, parsed.data.mode, questions, new Date().toISOString());
      const [, persistedRoom] = await Promise.all([saveQuestionBank(room.roomCode, questions), saveRoomState(nextRoom)]);
      return persistedRoom;
    });

    return ok({ room: toPublicRoomState(startedRoom) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_not_found") {
        return fail(
          "room_unavailable",
          503,
          "La sala publica no esta disponible temporalmente en este nodo. Intenta de nuevo.",
        );
      }

      if (error.message === "only_player_1") {
        return fail("only_player_1", 403, "Solo el jugador 1 puede iniciar la partida.");
      }

      if (error.message === "invalid_token") {
        return fail("invalid_token", 403, "El token del jugador es invalido.");
      }

      if (error.message === "missing_player_2") {
        return fail("missing_player_2", 409, "Se necesita un segundo jugador para duelo.");
      }

      if (error.message === "player_2_present") {
        return fail("player_2_present", 409, "Ya hay dos jugadores en sala. Inicia en modo duelo.");
      }

      if (error.message === "multiplayer_disabled") {
        return fail("multiplayer_disabled", 409, "Multiplayer esta temporalmente desactivado.");
      }

      if (error.message === "battle_mode_disabled") {
        return fail("battle_mode_disabled", 409, "Battle mode esta temporalmente desactivado.");
      }

      if (error.message.includes("[kv]")) {
        return fail("kv_unavailable", 503, error.message);
      }
    }

    console.error("public start error", error);
    return fail("server_error", 500, "No se pudo iniciar la partida.");
  }
}
