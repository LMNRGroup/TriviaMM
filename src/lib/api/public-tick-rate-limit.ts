import { getKv } from "@/lib/kv/client";

const WINDOW_SECONDS = 10;
const MAX_TICKS_PER_WINDOW = 120;

/**
 * Simple per-client counter with TTL (Upstash INCR + EXPIRE, or in-memory equivalent).
 * Client key should be IP or another stable identifier.
 */
export async function assertPublicTickAllowed(clientKey: string): Promise<{ ok: true } | { ok: false }> {
  const safeKey = clientKey.trim() || "unknown";
  const redisKey = `trivia:ratelimit:public-tick:${safeKey}`;

  try {
    const kv = getKv();
    const count = await kv.incr(redisKey);

    if (count === 1) {
      await kv.expire(redisKey, WINDOW_SECONDS);
    }

    if (count > MAX_TICKS_PER_WINDOW) {
      return { ok: false };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
