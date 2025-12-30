import { kv } from "@vercel/kv";

function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

const ROOM_TTL_SECONDS = 60 * 60 * 2;

export default async function handler(req, res) {
  // Allow GET for convenience (polling), but POST is fine too
  const method = req.method;
  if (method !== "GET" && method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    let roomCode, hostToken, afterSeq;

    if (method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      roomCode = String(url.searchParams.get("roomCode") || "").trim().toUpperCase();
      hostToken = String(url.searchParams.get("hostToken") || "").trim();
      afterSeq = Number(url.searchParams.get("afterSeq") || "0");
    } else {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      roomCode = String(body.roomCode || "").trim().toUpperCase();
      hostToken = String(body.hostToken || "").trim();
      afterSeq = Number(body.afterSeq || 0);
    }

    if (!roomCode) return json(res, 400, { ok: false, error: "missing_roomCode" });
    if (!hostToken) return json(res, 400, { ok: false, error: "missing_hostToken" });
    if (!Number.isFinite(afterSeq) || afterSeq < 0) afterSeq = 0;

    const metaKey = `trivia:room:${roomCode}:meta`;
    const answerKey = `trivia:room:${roomCode}:lastAnswer`;

    const meta = await kv.get(metaKey);
    if (!meta || !meta.active) return json(res, 404, { ok: false, error: "room_not_found" });
    if (meta.hostToken !== hostToken) return json(res, 403, { ok: false, error: "invalid_hostToken" });

    meta.hostLastSeenAt = Date.now();
    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });

    const last = (await kv.get(answerKey)) || { seq: 0, answer: null };
    const seq = typeof last.seq === "number" ? last.seq : 0;

    if (!last.answer || seq <= afterSeq) {
      return json(res, 200, { ok: true, seq, answer: null });
    }

    return json(res, 200, { ok: true, seq, answer: last.answer });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
