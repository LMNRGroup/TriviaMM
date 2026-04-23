import { ok } from "@/lib/api/http";
import { hasSheetsConfig } from "@/lib/utils/env";

export async function GET() {
  return ok({
    status: "ok",
    ready: {
      appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
      kv: Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim()),
      sheets: hasSheetsConfig(),
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    checkedAt: new Date().toISOString(),
  });
}
