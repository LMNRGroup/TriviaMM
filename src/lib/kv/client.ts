import { Redis } from "@upstash/redis";
import { getKvConfig, hasKvConfig, preferMemoryKv } from "@/lib/utils/env";

type KvSetOptions = { ex?: number; nx?: boolean };
type KvClient = Omit<Pick<Redis, "get" | "set" | "del" | "incr" | "expire">, "set"> & {
  set<TData>(key: string, value: TData, options?: KvSetOptions): Promise<TData | "OK" | null>;
};

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

  async set<TData>(key: string, value: TData, options?: KvSetOptions): Promise<TData | "OK" | null> {
    if (options?.nx && this.store.has(key)) {
      const entry = this.store.get(key);
      if (entry && (entry.expiresAt === null || entry.expiresAt > Date.now())) {
        return null;
      }
    }

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

type KvRuntimeMode = "memory" | "remote" | "unconfigured";
let runtimeMode: KvRuntimeMode = "unconfigured";

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
 * Single process-wide KV client.
 *
 * Safety rule: if Upstash is configured but unreachable, do not silently fail over to memory.
 * Memory KV is process-local and causes split-brain room state in multi-instance environments.
 * Use `KV_USE_MEMORY=true` explicitly for local-only testing.
 */
function createResilientKv(): KvClient {
  const memory = fallbackKv;
  let remote: Redis | null = null;
  const forceMemory = preferMemoryKv();
  const hasRemoteConfig = hasKvConfig();
  const runningProduction = process.env.NODE_ENV === "production";
  let memoryOnly = forceMemory || (!hasRemoteConfig && !runningProduction);

  runtimeMode = memoryOnly ? "memory" : hasRemoteConfig ? "remote" : "unconfigured";

  async function run<T>(operation: (client: KvClient) => Promise<T>): Promise<T> {
    if (memoryOnly) {
      return operation(memory);
    }

    try {
      if (!remote) {
        remote = new Redis(getKvConfig());
      }
      const result = await operation(remote);
      runtimeMode = "remote";
      return result;
    } catch (error) {
      if (isKvUnreachableError(error)) {
        if (forceMemory) {
          console.warn(
            "[kv] Upstash Redis unreachable. `KV_USE_MEMORY` is enabled, so this process will use in-memory KV.",
          );
          memoryOnly = true;
          remote = null;
          runtimeMode = "memory";
          return operation(memory);
        }

        throw new Error(
          "[kv] Upstash Redis unreachable. Refusing to auto-fallback to in-memory KV because it breaks shared room state across instances.",
        );
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

export function getKvRuntimeMode(): KvRuntimeMode {
  if (!singleton) {
    singleton = createResilientKv();
  }
  return runtimeMode;
}
