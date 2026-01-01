const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";
const TTL_SECONDS = 60 * 60 * 2; // 2h
// ughi
// Allow normal answers + control commands from controller
const ALLOWED_CHOICES = new Set(["A", "B", "C", "D", "__START__", "__RESET__"]);

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { controllerToken, sessionId, choice } = req.body || {};
    const ct = (controllerToken || "").trim();
    const sid = (sessionId || "").trim();
    const ch = String(choice || "").trim().toUpperCase();

    if (!ct) return json(res, 400, { ok: false, error: "missing_controllerToken" });
    if (!sid) return json(res, 400, { ok: false, error: "missing_sessionId" });
    if (!ALLOWED_CHOICES.has(ch)) return json(res, 400, { ok: false, error: "invalid_choice" });

    const roomCode = ROOM_CODE_FIXED;

    const controllerKey = `trivia:controller:${roomCode}`;
    const ctrl = await kv.get(controllerKey);

    if (!ctrl || !ctrl.controllerToken) {
      return json(res, 403, { ok: false, error: "controller_lost", errorCode: "controller_lost" });
    }
    if (ctrl.controllerToken !== ct || ctrl.sessionId !== sid) {
      return json(res, 403, { ok: false, error: "invalid_controllerToken", errorCode: "controller_lost" });
    }

    // ✅ Heartbeat / lease refresh
    await kv.set(
      controllerKey,
      { ...ctrl, lastSeen: Date.now() },
      { ex: TTL_SECONDS }
    );

    // Increment seq and store last "answer" (including commands)
    const seqKey = `trivia:seq:${roomCode}`;
    const answerKey = `trivia:answer:${roomCode}`;

    const seq = await kv.incr(seqKey);
    await kv.expire(seqKey, TTL_SECONDS);

    const payload = {
      seq,
      choice: ch,
      sessionId: sid,
      ts: Date.now(),
      kind: ["A", "B", "C", "D"].includes(ch) ? "answer" : "command",
    };

    await kv.set(answerKey, payload, { ex: TTL_SECONDS });

    return json(res, 200, { ok: true, seq });
  } catch (err) {
    console.error("answer error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
