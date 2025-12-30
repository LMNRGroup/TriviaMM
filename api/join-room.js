const crypto = require("crypto");
const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h

// If controller hasn't checked in for this long, allow a new phone to take over
const STALE_MS = 45 * 1000;

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function randToken(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { passkey, sessionId } = req.body || {};
    const pk = (passkey || "").trim();
    const sid = (sessionId || "").trim();

    const expected = (process.env.APP_PK || "").trim();
    if (!expected) return json(res, 500, { ok: false, error: "APP_PK_not_configured" });
    if (!pk) return json(res, 400, { ok: false, error: "missing_passkey" });
    if (pk !== expected) return json(res, 401, { ok: false, error: "invalid_passkey" });
    if (!sid) return json(res, 400, { ok: false, error: "missing_sessionId" });

    const roomCode = ROOM_CODE_FIXED;

    // Room must have a host created (big screen should call create-room first)
    const hostKey = `trivia:host:${roomCode}`;
    const host = await kv.get(hostKey);
    if (!host || !host.hostToken) return json(res, 409, { ok: false, error: "room_not_ready" });

    const controllerKey = `trivia:controller:${roomCode}`;
    const existingCtrl = await kv.get(controllerKey);

    if (existingCtrl && existingCtrl.controllerToken) {
      // Resume same sessionId
      if (existingCtrl.sessionId === sid) {
        await kv.set(
          controllerKey,
          { ...existingCtrl, sessionId: sid, lastSeen: Date.now() },
          { ex: TTL_SECONDS }
        );
        return json(res, 200, { ok: true, roomCode, controllerToken: existingCtrl.controllerToken, resumed: true });
      }

      // Stale takeover
      const lastSeen = Number(existingCtrl.lastSeen || existingCtrl.joinedAt || 0);
      const stale = !lastSeen || (Date.now() - lastSeen) > STALE_MS;

      if (!stale) {
        return json(res, 409, { ok: false, error: "controller_taken" });
      }

      // Takeover allowed
      const controllerToken = randToken("ctrl");
      await kv.set(
        controllerKey,
        { controllerToken, sessionId: sid, joinedAt: Date.now(), lastSeen: Date.now() },
        { ex: TTL_SECONDS }
      );
      return json(res, 200, { ok: true, roomCode, controllerToken, resumed: false, takeover: true });
    }

    const controllerToken = randToken("ctrl");
    await kv.set(
      controllerKey,
      { controllerToken, sessionId: sid, joinedAt: Date.now(), lastSeen: Date.now() },
      { ex: TTL_SECONDS }
    );

    return json(res, 200, { ok: true, roomCode, controllerToken, resumed: false });
  } catch (err) {
    console.error("join-room error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
