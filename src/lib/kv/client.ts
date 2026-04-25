import { Redis } from "@upstash/redis";
import { getKvConfig, hasKvConfig, preferMemoryKv } from "@/lib/utils/env";

type KvClient = Pick<Redis, "get" | "set" | "del" | "incr" | "expire">;

type MemoryValue = { value: unknown; expiresAt: number | null };

class MemoryKv {
  private store = new Map<string, MemoryValue>();

  async get<T>(key: string) {
    const entry = this.store.get(key);

    if (!entry) {
      return null as T | null;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null as T | null;
    }

    return entry.value as T;
  }

  async set<TData>(key: string, value: TData, options?: { ex?: number }): Promise<TData | "OK" | null> {
    this.store.set(key, {
      value,
      expiresAt: options?.ex ? Date.now() + options.ex * 1000 : null,
    });
    return value;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    let entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      entry = undefined;
    }

    const prev = typeof entry?.value === "number" ? entry.value : 0;
    const next = prev + 1;
    const expiresAt = entry?.expiresAt ?? Date.now() + 10_000;
    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    const entry = this.store.get(key);
    if (!entry) {
      return 0;
    }

    this.store.set(key, {
      ...entry,
      expiresAt: Date.now() + seconds * 1000,
    });
    return 1;
  }
}

const fallbackKv = new MemoryKv();

function isKvUnreachableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as Error & { cause?: unknown; code?: string };
  const parts: string[] = [err.message ?? "", String(err.code ?? "")];

  if (err.cause instanceof Error) {
    const causeCode = "code" in err.cause ? String((err.cause as { code?: string }).code ?? "") : "";
    parts.push(err.cause.message, causeCode);
  }

  const text = parts.join(" ").toLowerCase();

  return (
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("fetch failed") ||
    text.includes("getaddrinfo") ||
    text.includes("networkerror")
  );
}

/**
 * Single process-wide client: tries Upstash when configured, falls back to memory on
 * DNS/network failures (e.g. stale `KV_REST_API_URL` in `.env.local`).
 */
function createResilientKv(): KvClient {
  const memory = fallbackKv;
  let remote: Redis | null = null;
  let memoryOnly = preferMemoryKv() || !hasKvConfig();

  async function run<T>(operation: (client: KvClient) => Promise<T>): Promise<T> {
    if (memoryOnly) {
      return operation(memory);
    }

    try {
      if (!remote) {
        remote = new Redis(getKvConfig());
      }
      return await operation(remote);
    } catch (error) {
      if (isKvUnreachableError(error)) {
        console.warn(
          "[kv] Upstash Redis unreachable (check KV_REST_API_URL / network). Using in-memory KV for this server process.",
        );
        memoryOnly = true;
        remote = null;
        return operation(memory);
      }
      throw error;
    }
  }

  const client: KvClient = {
    get: (key) => run((c) => c.get(key)),
    set: (key, value, options) => run((c) => c.set(key, value, options)),
    del: (key) => run((c) => c.del(key)),
    incr: (key) => run((c) => c.incr(key)),
    expire: (key, seconds) => run((c) => c.expire(key, seconds)),
  };
  return client;
}

let singleton: KvClient | null = null;

export function getKv(): KvClient {
  if (!singleton) {
    singleton = createResilientKv();
  }
  return singleton;
}
