const crypto = require("crypto");
const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h

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
    const body = req.body || {};
    const roomCode = ROOM_CODE_FIXED; // ONE-room mode

    const hostKey = `trivia:host:${roomCode}`;
    const existing = await kv.get(hostKey);

    // If a host already exists, DO NOT leak the hostToken.
    // Big screen must keep its hostToken in localStorage to survive refresh.
    if (existing && existing.hostToken) {
      const provided = (body.hostToken || "").trim();
      if (provided && provided === existing.hostToken) {
        return json(res, 200, { ok: true, roomCode, hostToken: existing.hostToken, alreadyExists: true });
      }
      return json(res, 200, { ok: true, roomCode, hostToken: null, alreadyExists: true, needsHostToken: true });
    }

    // Create fresh host token (first time only)
    const hostToken = randToken("host");
    await kv.set(hostKey, { hostToken, createdAt: Date.now() }, { ex: TTL_SECONDS });

    // Also set a default "splash" state so phone can poll safely
    const stateKey = `trivia:state:${roomCode}`;
    await kv.set(
      stateKey,
      { phase: "splash", total: 20, qIndex: 0, score: 0, questionEndsAt: null },
      { ex: TTL_SECONDS }
    );

    return json(res, 200, { ok: true, roomCode, hostToken, alreadyExists: false });
  } catch (err) {
    console.error("create-room error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
