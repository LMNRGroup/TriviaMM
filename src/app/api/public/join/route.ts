import { randomUUID } from "node:crypto";
import { ok, fail } from "@/lib/api/http";
import { choosePlayerSlot, ensurePublicRoom, getRoomState, joinRoom, withRoomMutationLock } from "@/lib/kv/room-store";
import { getKv } from "@/lib/kv/client";
import { returningPlayerByIpKey } from "@/lib/kv/keys";
import { MATCH_QUESTION_COUNT, PUBLIC_ROOM_CODE } from "@/lib/game/constants";
import { startMatch } from "@/lib/game/engine";
import { buildLivePlayerFromRegistration, getRegisteredPlayerById } from "@/lib/sheets/player-repo";
import { getRandomQuestions } from "@/lib/sheets/question-repo";
import { getBaseUrl, isMultiplayerEnabled } from "@/lib/utils/env";
import { getRequestIp } from "@/lib/utils/request";
import { toJoinPlayerPayload, toPublicRoomState } from "@/lib/api/room-state";
import { joinRoomSchema } from "@/lib/validation/room";
import { saveQuestionBank, saveRoomState } from "@/lib/kv/room-store";

export async function POST(request: Request) {
  let payload: unknown;
  const allowRoomCreate = request.headers.get("x-trivia-allow-room-create") === "1";

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "El cuerpo debe ser JSON valido.");
  }

  const parsedBody = joinRoomSchema.safeParse(payload);

  if (!parsedBody.success) {
    return fail("invalid_join_payload", 400, parsedBody.error.issues[0]?.message);
  }

  try {
    const registration = await getRegisteredPlayerById(parsedBody.data.playerId);
    const multiplayerEnabled = isMultiplayerEnabled();

    if (!registration) {
      return fail("player_not_found", 404, "No se encontro el registro del jugador.");
    }

    const joinResult = await withRoomMutationLock(PUBLIC_ROOM_CODE, async () => {
      let room = await getRoomState();

      if (!room && allowRoomCreate) {
        await ensurePublicRoom(getBaseUrl());
        room = await getRoomState();
      }

      if (!room) {
        throw new Error("room_unavailable");
      }

      const existingPlayer =
        room.players.player1?.playerId === registration.playerId
          ? room.players.player1
          : room.players.player2?.playerId === registration.playerId
            ? room.players.player2
            : null;

      if (existingPlayer) {
        return {
          player: existingPlayer,
          room,
        };
      }

      if (!["idle", "lobby"].includes(room.phase)) {
        throw new Error("active_session");
      }

      if (
        !multiplayerEnabled &&
        room.players.player1 &&
        room.players.player1.playerId !== registration.playerId
      ) {
        throw new Error("multiplayer_disabled");
      }

      const slot = choosePlayerSlot(room, multiplayerEnabled ? parsedBody.data.preferredSlot : 1);

      if (!slot) {
        throw new Error("room_full");
      }

      const player = buildLivePlayerFromRegistration({
        roomCode: room.roomCode,
        slot,
        sessionId: parsedBody.data.sessionId,
        controllerToken: `ctrl_${randomUUID()}`,
        registration,
      });

      const updatedRoom = await joinRoom(player);
      let responseRoom = updatedRoom;

      if (player.slot === 2 && updatedRoom.players.player1 && updatedRoom.phase === "lobby") {
        const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);

        if (questions.length === 0) {
          throw new Error("question_bank_empty");
        }

        const { room: startedRoom } = startMatch(updatedRoom, "battle", questions, new Date().toISOString());
        await Promise.all([saveQuestionBank(startedRoom.roomCode, questions), saveRoomState(startedRoom)]);
        responseRoom = startedRoom;
      }

      if (!multiplayerEnabled && player.slot === 1 && updatedRoom.phase === "lobby") {
        const questions = await getRandomQuestions(MATCH_QUESTION_COUNT);

        if (questions.length === 0) {
          throw new Error("question_bank_empty");
        }

        const { room: startedRoom } = startMatch(updatedRoom, "solo", questions, new Date().toISOString());
        await Promise.all([saveQuestionBank(startedRoom.roomCode, questions), saveRoomState(startedRoom)]);
        responseRoom = startedRoom;
      }

      return {
        player,
        room: responseRoom,
      };
    });

    const ipAddress = getRequestIp(request);
    await getKv().set(returningPlayerByIpKey(ipAddress), joinResult.player.playerId, { ex: 60 * 60 * 24 * 30 });

    return ok({
      player: toJoinPlayerPayload(joinResult.player),
      room: toPublicRoomState(joinResult.room),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "room_unavailable" || error.message === "room_not_found") {
        return fail(
          "room_unavailable",
          503,
          "La sala publica no esta disponible temporalmente en este nodo. Intenta de nuevo.",
        );
      }

      if (error.message === "slot_taken") {
        return fail("slot_taken", 409, "Ese lugar ya esta ocupado.");
      }

      if (error.message === "room_full") {
        return fail("room_full", 409, "La sala ya esta ocupada.");
      }

      if (error.message === "multiplayer_disabled") {
        return fail("multiplayer_disabled", 409, "Multiplayer esta temporalmente desactivado.");
      }

      if (error.message === "match_in_progress") {
        return fail("active_session", 409, "Ya hay una partida activa. Espera a que termine.");
      }

      if (error.message === "active_session") {
        return fail("active_session", 409, "Ya hay una partida activa. Espera a que termine para entrar.");
      }

      if (error.message === "question_bank_empty") {
        return fail("question_bank_empty", 409, "No hay preguntas disponibles para iniciar la partida.");
      }
    }

    console.error("public join error", error);
    return fail("server_error", 500, "No se pudo unir al jugador.");
  }
}
