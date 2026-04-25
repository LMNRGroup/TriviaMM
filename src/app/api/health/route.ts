import { ok } from "@/lib/api/http";
import { hasKvConfig, hasSheetsConfig, preferMemoryKv } from "@/lib/utils/env";

export async function GET() {
  return ok({
    status: "ok",
    ready: {
      appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
      kv: hasKvConfig(),
      kvUseMemory: preferMemoryKv(),
      sheets: hasSheetsConfig(),
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    checkedAt: new Date().toISOString(),
  });
}
