const BASE_URL = (process.env.TRIVIA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const MAX_STEPS = Number(process.env.SOAK_MAX_STEPS || 1600);
const POLL_MS = Number(process.env.SOAK_POLL_MS || 300);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callJson(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const payload = await response.json();
  return { response, payload };
}

function assertOk({ response, payload }, label) {
  if (!response.ok || !payload?.ok) {
    const message = payload?.message || response.statusText;
    throw new Error(`${label} failed: ${message}`);
  }
}

async function registerPlayer() {
  const suffix = Date.now();
  const registration = {
    roomCode: "PUBLICO",
    name: `Soak ${suffix}`,
    city: "Mayaguez",
    age: 28,
    email: `soak-${suffix}@example.com`,
    acceptedTerms: true,
    newsletterOptIn: false,
  };

  const result = await callJson("/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registration),
  });
  assertOk(result, "registration");
  return result.payload.data.player.playerId;
}

async function joinPlayer(playerId) {
  const result = await callJson("/api/public/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trivia-allow-room-create": "1",
    },
    body: JSON.stringify({
      playerId,
      sessionId: crypto.randomUUID(),
    }),
  });
  assertOk(result, "join");
  return result.payload.data.player;
}

function phaseRegressionGuard(previous, next) {
  if (!previous) {
    return null;
  }

  if (
    previous.currentMatchId &&
    !next.currentMatchId &&
    (next.phase === "idle" || next.phase === "lobby") &&
    !["leaderboard", "finished", "reset"].includes(previous.phase)
  ) {
    return `unexpected match reset ${previous.phase} -> ${next.phase}`;
  }

  if (previous.phase === "question" && next.phase === "question-read" && next.currentQuestion.questionIndex <= previous.currentQuestion.questionIndex) {
    return `invalid question rollback Q${previous.currentQuestion.questionIndex} -> Q${next.currentQuestion.questionIndex}`;
  }

  return null;
}

async function run() {
  console.log(`[soak] baseUrl=${BASE_URL}`);
  const playerId = await registerPlayer();
  const joined = await joinPlayer(playerId);
  console.log(`[soak] joined player=${joined.playerId} slot=${joined.slot}`);

  let lastRoom = null;
  let lastVersion = 0;
  let answered = new Set();
  let sawActiveMatch = false;
  let sawLeaderboardOrFinished = false;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const stateResult = await callJson("/api/public/state", {
      headers: {
        ...(joined.playerId ? { "x-trivia-player-id": joined.playerId } : {}),
        ...(lastRoom?.currentMatchId ? { "x-trivia-current-match-id": lastRoom.currentMatchId } : {}),
      },
    });

    if (!stateResult.response.ok || !stateResult.payload?.ok) {
      const code = stateResult.payload?.error;
      if (code === "room_unavailable") {
        await sleep(POLL_MS);
        continue;
      }
      assertOk(stateResult, "public state");
    }

    const room = stateResult.payload.data.room;

    if (typeof room.version !== "number") {
      throw new Error("room version missing from state response");
    }

    if (room.version < lastVersion) {
      throw new Error(`version regressed ${lastVersion} -> ${room.version}`);
    }

    const regression = phaseRegressionGuard(lastRoom, room);
    if (regression) {
      throw new Error(regression);
    }

    if (room.currentMatchId) {
      sawActiveMatch = true;
    }

    if (room.phase === "leaderboard" || room.phase === "finished" || room.phase === "reset") {
      sawLeaderboardOrFinished = true;
    }

    if (room.phase === "question") {
      const key = `${room.currentMatchId ?? "none"}:${room.currentQuestion.questionIndex}`;
      const ownAnswer = room.answers.player1?.playerId === joined.playerId ? room.answers.player1 : room.answers.player2;
      if (!ownAnswer && !answered.has(key)) {
        const answerResult = await callJson("/api/public/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: joined.playerId,
            controllerToken: joined.controllerToken,
            questionId: room.currentQuestion.questionId,
            questionIndex: room.currentQuestion.questionIndex,
            selectedChoice: "A",
          }),
        });

        if (answerResult.response.ok && answerResult.payload?.ok) {
          answered.add(key);
        } else if (!["room_unavailable", "room_not_found"].includes(answerResult.payload?.error)) {
          assertOk(answerResult, "answer");
        }
      }
    }

    if (step % 100 === 0) {
      console.log(`[soak] step=${step} phase=${room.phase} version=${room.version} q=${room.currentQuestion.questionIndex}`);
    }

    if (
      room.phase !== "idle" &&
      (room.phase !== "lobby" || room.lobby.waitingEndsAt)
    ) {
      const tickResult = await callJson("/api/public/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: joined.playerId,
          controllerToken: joined.controllerToken,
        }),
      });

      if (!tickResult.response.ok || !tickResult.payload?.ok) {
        const code = tickResult.payload?.error;
        if (!["room_unavailable", "room_not_found", "invalid_tick_driver"].includes(code)) {
          assertOk(tickResult, "tick");
        }
      }
    }

    if (
      sawActiveMatch &&
      sawLeaderboardOrFinished &&
      room.phase === "idle" &&
      room.currentMatchId === null
    ) {
      console.log("[soak] completed full solo cycle successfully.");
      console.log(`[soak] final version=${room.version}`);
      return;
    }

    lastRoom = room;
    lastVersion = room.version;
    await sleep(POLL_MS);
  }

  throw new Error("soak run timed out before completing solo cycle");
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[soak] failure:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
