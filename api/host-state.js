const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function releaseController(roomCode) {
  const controllerKey = `trivia:controller:${roomCode}`;
  const answerKey = `trivia:answer:${roomCode}`;
  const seqKey = `trivia:seq:${roomCode}`;
  await kv.del(controllerKey);
  await kv.del(answerKey);
  await kv.del(seqKey);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { hostToken, state } = req.body || {};
    const ht = (hostToken || "").trim();
    if (!ht) return json(res, 400, { ok: false, error: "missing_hostToken" });

    const roomCode = ROOM_CODE_FIXED;

    const hostKey = `trivia:host:${roomCode}`;
    const host = await kv.get(hostKey);
    if (!host || !host.hostToken) return json(res, 409, { ok: false, error: "room_not_ready" });
    if (host.hostToken !== ht) return json(res, 403, { ok: false, error: "invalid_hostToken" });

    const safeState = state && typeof state === "object" ? state : {};
    const stateKey = `trivia:state:${roomCode}`;

    // If host signals reset OR returns to splash, release controller for next guest
    const shouldRelease =
      safeState.reset === true || safeState.phase === "reset" || safeState.phase === "splash";

    if (shouldRelease) {
      await releaseController(roomCode);
    }

    await kv.set(
      stateKey,
      { ...safeState, updatedAt: Date.now() },
      { ex: TTL_SECONDS }
    );

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error("host-state error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
