import { kv } from "@vercel/kv";

function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function randToken(prefix = "tok") {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function makeRoomCode() {
  // 6 chars, easy to read
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const ROOM_TTL_SECONDS = 60 * 60 * 2; // 2 hours

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    // Make a unique roomCode (retry a few times)
    let roomCode = null;
    for (let i = 0; i < 6; i++) {
      const code = makeRoomCode();
      const metaKey = `trivia:room:${code}:meta`;
      const exists = await kv.get(metaKey);
      if (!exists) {
        roomCode = code;
        break;
      }
    }
    if (!roomCode) return json(res, 500, { ok: false, error: "could_not_allocate_room" });

    const hostToken = randToken("host");

    const metaKey = `trivia:room:${roomCode}:meta`;
    const stateKey = `trivia:room:${roomCode}:state`;
    const answerKey = `trivia:room:${roomCode}:lastAnswer`;

    const now = Date.now();

    const meta = {
      roomCode,
      hostToken, // private to big screen
      createdAt: now,
      active: true,
      controllerToken: null,
      controllerSessionId: null,
      controllerLastSeenAt: null,
      hostLastSeenAt: now
    };

    const state = {
      phase: "splash",   // splash | live | reveal | finished | reset
      total: 20,
      qIndex: 0,
      score: 0,
      questionEndsAt: null, // ms epoch
      answers: null,         // optional {A,B,C,D} if you send it from big screen
      lastUpdateAt: now
    };

    await kv.set(metaKey, meta, { ex: ROOM_TTL_SECONDS });
    await kv.set(stateKey, state, { ex: ROOM_TTL_SECONDS });
    await kv.set(answerKey, { seq: 0, answer: null }, { ex: ROOM_TTL_SECONDS });

    return json(res, 200, { ok: true, roomCode, hostToken, ttlSeconds: ROOM_TTL_SECONDS });
  } catch (e) {
    return json(res, 500, { ok: false, error: "server_error", detail: String(e?.message || e) });
  }
}
