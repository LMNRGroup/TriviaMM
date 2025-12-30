import { kv } from "@vercel/kv";

function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

const ROOM_TTL_SECONDS = 60 * 60 * 2;

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const roomCode = String(body.roomCode || "").trim().toUpperCase();
    const hostToken = String(body.hostToken || "").trim();
    const state = body.state;

    if (!roomCode) return json(res, 400, { ok: false, error: "missing_roomCode" });
    if (!hostToken) return json(res, 400, { ok: false, error: "missing_hostToken" });
    if (!state || typeof state !== "object") return json(res, 400, { ok: false, error: "missing_state" });

    const metaKey = `trivia:room:${roomCode}:meta`;
    const stateKey = `trivia:room:${roomCode}:state`;
    const answerKey = `trivia:room:${roomCode}:lastAnswer`;

    const meta = await kv.get(metaKey);
    if (!meta || !meta.active) return json(res, 404, { ok: false, error: "room_not_found" });
    if (meta.hostToken !== hostToken) return json(res, 403, { ok: false, error: "invalid_hostToken" });

    const now = Date.now();

    // Optional host-driven reset (clears controller lock + last answer)
    if (state.phase === "reset" || state.reset === true) {
      meta.controllerToken = null;
      meta.controllerSessionId = null;
      meta.controllerLastSeenAt = null;
      await kv.set(answerKey, { seq: 0, answer: null }, { ex: ROOM_TTL_SECONDS });
    }

    meta.hostLastSeenAt = now;

    const safeState = {
      phase: String(state.phase || "splash"),
      total: typeof state.total === "number" ? state.total : 20,
      qIndex: typeof state.qIndex === "number" ? state.qIndex : 0,
      score: typeof state.score === "number" ? state.score : 0,
      questionEndsAt: typeof state.questionEndsAt === "number" ? state.questionEndsAt : null,
      answers: state.answers && typeof state.answers === "object" ? state.answers : null,
      lastUpdateAt: now
    };

    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });
    await kv.set(stateKey, safeState, { ex: ROOM_TTL_SECONDS });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
