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

    if (!roomCode) return json(res, 400, { ok: false, error: "missing_roomCode" });
    if (!controllerToken) return json(res, 400, { ok: false, error: "missing_controllerToken" });
    if (!sessionId) return json(res, 400, { ok: false, error: "missing_sessionId" });

    const metaKey = `trivia:room:${roomCode}:meta`;
    const stateKey = `trivia:room:${roomCode}:state`;

    const meta = await kv.get(metaKey);
    if (!meta || !meta.active) return json(res, 404, { ok: false, error: "room_not_found" });

    if (!meta.controllerToken || meta.controllerToken !== controllerToken || meta.controllerSessionId !== sessionId) {
      return json(res, 403, { ok: false, error: "controller_not_authorized", errorCode: "controller_lost" });
    }

    const state = await kv.get(stateKey);
    if (!state) return json(res, 404, { ok: false, error: "room_state_missing" });

    meta.controllerLastSeenAt = Date.now();
    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });

    return json(res, 200, { ok: true, state });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
