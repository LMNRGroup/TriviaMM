import { createClient, type VercelKV } from "@vercel/kv";
import { getKvConfig } from "@/lib/utils/env";

let kvClient: VercelKV | null = null;
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

  async set(key: string, value: unknown, options?: { ex?: number }) {
    this.store.set(key, {
      value,
      expiresAt: options?.ex ? Date.now() + options.ex * 1000 : null,
    });
  }

  async del(key: string) {
    this.store.delete(key);
  }
}

const fallbackKv = new MemoryKv();

export function getKv() {
  try {
    if (!kvClient) {
      kvClient = createClient(getKvConfig());
    }

    return kvClient;
  } catch {
    return fallbackKv;
  }
}
