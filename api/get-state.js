const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h

// ✅ Throttles (big command saver)
const HEARTBEAT_MS = 30_000;   // only refresh controller lease every 30s max
const STATE_TOUCH_MS = 60_000; // only touch state TTL every 60s max (optional)

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

    if (!ctrl || !ctrl.controllerToken) {
      return json(res, 403, { ok: false, error: "controller_lost", errorCode: "controller_lost" });
    }
    if (ctrl.controllerToken !== ct || ctrl.sessionId !== sid) {
      return json(res, 403, { ok: false, error: "controller_lost", errorCode: "controller_lost" });
    }

    // ✅ Heartbeat only every HEARTBEAT_MS (instead of every poll)
    const now = Date.now();
    const lastSeen = typeof ctrl.lastSeen === "number" ? ctrl.lastSeen : 0;

    if (now - lastSeen > HEARTBEAT_MS) {
      await kv.set(
        controllerKey,
        { ...ctrl, lastSeen: now },
        { ex: TTL_SECONDS }
      );
    }

    const stateKey = `trivia:state:${roomCode}`;
    const st = await kv.get(stateKey);

    // ✅ Optional: do NOT expire on every request (command spam)
    // If you still want insurance, only extend TTL occasionally:
    if (st && typeof st === "object") {
      const touchedAt = typeof st._touchedAt === "number" ? st._touchedAt : 0;
      if (now - touchedAt > STATE_TOUCH_MS) {
        // one write per minute max
        await kv.set(stateKey, { ...st, _touchedAt: now }, { ex: TTL_SECONDS });
      }
    }

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
