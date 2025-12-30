const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { controllerToken, sessionId } = req.body || {};
    const ct = (controllerToken || "").trim();
    const sid = (sessionId || "").trim();

    if (!ct) return json(res, 400, { ok: false, error: "missing_controllerToken" });
    if (!sid) return json(res, 400, { ok: false, error: "missing_sessionId" });

    const roomCode = ROOM_CODE_FIXED;

    const controllerKey = `trivia:controller:${roomCode}`;
    const ctrl = await kv.get(controllerKey);

    // controller must still be the active one
    if (!ctrl || !ctrl.controllerToken) {
      return json(res, 403, { ok: false, error: "controller_lost", errorCode: "controller_lost" });
    }
    if (ctrl.controllerToken !== ct || ctrl.sessionId !== sid) {
      return json(res, 403, { ok: false, error: "controller_lost", errorCode: "controller_lost" });
    }

    const stateKey = `trivia:state:${roomCode}`;
    const st = await kv.get(stateKey);

    // keep TTL alive while game runs
    await kv.expire(controllerKey, TTL_SECONDS);
    if (st) await kv.expire(stateKey, TTL_SECONDS);

    // default fallback
    const state =
      st && typeof st === "object"
        ? st
        : { phase: "splash", total: 20, qIndex: 0, score: 0, questionEndsAt: null };

    return json(res, 200, { ok: true, state });
  } catch (err) {
    console.error("get-state error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
