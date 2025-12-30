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
    const controllerToken = String(body.controllerToken || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    const choice = String(body.choice || "").trim().toUpperCase();

    if (!roomCode) return json(res, 400, { ok: false, error: "missing_roomCode" });
    if (!controllerToken) return json(res, 400, { ok: false, error: "missing_controllerToken" });
    if (!sessionId) return json(res, 400, { ok: false, error: "missing_sessionId" });
    if (!["A", "B", "C", "D"].includes(choice)) return json(res, 400, { ok: false, error: "invalid_choice" });

    const metaKey = `trivia:room:${roomCode}:meta`;
    const stateKey = `trivia:room:${roomCode}:state`;
    const answerKey = `trivia:room:${roomCode}:lastAnswer`;

    const meta = await kv.get(metaKey);
    if (!meta || !meta.active) return json(res, 404, { ok: false, error: "room_not_found" });

    // controller enforcement
    if (!meta.controllerToken || meta.controllerToken !== controllerToken || meta.controllerSessionId !== sessionId) {
      return json(res, 403, { ok: false, error: "controller_not_authorized", errorCode: "controller_lost" });
    }

    // Optional: only accept during live phase
    const curState = await kv.get(stateKey);
    if (!curState) return json(res, 404, { ok: false, error: "room_state_missing" });
    if (curState.phase !== "live") {
      return json(res, 409, { ok: false, error: "not_accepting_answers" });
    }

    const last = (await kv.get(answerKey)) || { seq: 0, answer: null };
    const nextSeq = (typeof last.seq === "number" ? last.seq : 0) + 1;

    const payload = {
      seq: nextSeq,
      answer: {
        choice,
        sessionId,
        clientAt: Date.now()
      }
    };

    meta.controllerLastSeenAt = Date.now();

    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });
    await kv.set(answerKey, payload, { ex: ROOM_TTL_SECONDS });

    return json(res, 200, { ok: true, seq: nextSeq });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
