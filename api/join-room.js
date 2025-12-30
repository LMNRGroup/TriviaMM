import { kv } from "@vercel/kv";

function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function randToken(prefix = "ctrl") {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const ROOM_TTL_SECONDS = 60 * 60 * 2; // keep aligned with create-room

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const roomCode = String(body.roomCode || "").trim().toUpperCase();
    const passkey = String(body.passkey || "").trim();
    const sessionId = String(body.sessionId || "").trim();

    if (!roomCode) return json(res, 400, { ok: false, error: "missing_roomCode" });
    if (!passkey) return json(res, 400, { ok: false, error: "missing_passkey" });
    if (!sessionId) return json(res, 400, { ok: false, error: "missing_sessionId" });

    const serverPk = process.env.APP_PK;
    if (!serverPk) return json(res, 500, { ok: false, error: "app_pk_not_configured" });
    if (passkey !== serverPk) return json(res, 401, { ok: false, error: "invalid_passkey" });

    const metaKey = `trivia:room:${roomCode}:meta`;
    const meta = await kv.get(metaKey);

    if (!meta || !meta.active) return json(res, 404, { ok: false, error: "room_not_found" });

    // Enforce single controller per room.
    if (meta.controllerToken) {
      // allow ONLY same sessionId to resume
      if (meta.controllerSessionId === sessionId) {
        // refresh TTL
        meta.controllerLastSeenAt = Date.now();
        await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });
        return json(res, 200, { ok: true, controllerToken: meta.controllerToken, resumed: true });
      }
      return json(res, 409, { ok: false, error: "controller_taken" });
    }

    const controllerToken = randToken("ctrl");
    meta.controllerToken = controllerToken;
    meta.controllerSessionId = sessionId;
    meta.controllerLastSeenAt = Date.now();

    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });
    return json(res, 200, { ok: true, controllerToken, resumed: false });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
