import { isProductionRuntime } from "@/lib/utils/env";

const ADMIN_HEADER = "x-trivia-admin-key";

function configuredAdminKey() {
  return process.env.TRIVIA_ADMIN_API_KEY?.trim() ?? "";
}

/**
 * Production: requires `TRIVIA_ADMIN_API_KEY` and matching `x-trivia-admin-key` header.
 * Non-production: if no key is configured, allow local usage for debugging workflows.
 */
export function hasAdminAccess(request: Request) {
  const configured = configuredAdminKey();
  const provided = request.headers.get(ADMIN_HEADER)?.trim() ?? "";

  if (configured.length > 0) {
    return provided.length > 0 && provided === configured;
  }

  return !isProductionRuntime();
}
