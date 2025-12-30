const { kv } = require("@vercel/kv");

const ROOM_CODE_FIXED = "ACTIVE";

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const roomCode = ROOM_CODE_FIXED;
    const hostToken = String(req.query.hostToken || "").trim();
    const afterSeq = Number(req.query.afterSeq || 0);

    if (!hostToken) return json(res, 400, { ok: false, error: "missing_hostToken" });

    const hostKey = `trivia:host:${roomCode}`;
    const host = await kv.get(hostKey);
    if (!host || !host.hostToken) return json(res, 409, { ok: false, error: "room_not_ready" });
    if (host.hostToken !== hostToken) return json(res, 403, { ok: false, error: "invalid_hostToken" });

    const answerKey = `trivia:answer:${roomCode}`;
    const ans = await kv.get(answerKey);

    if (!ans || typeof ans.seq !== "number") {
      return json(res, 200, { ok: true, seq: afterSeq, answer: null });
    }

    // ✅ No kv.expire() here (that was extra commands)
    if (ans.seq > afterSeq) {
      return json(res, 200, { ok: true, seq: ans.seq, answer: ans });
    }

    return json(res, 200, { ok: true, seq: ans.seq, answer: null });
  } catch (err) {
    console.error("poll-answer error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
