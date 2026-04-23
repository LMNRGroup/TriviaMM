import { ok, fail } from "@/lib/api/http";
import { getKv } from "@/lib/kv/client";
import { returningPlayerByIpKey } from "@/lib/kv/keys";
import { createRegisteredPlayer, findRegisteredPlayerByEmail } from "@/lib/sheets/player-repo";
import { getRequestIp } from "@/lib/utils/request";
import { registrationSchema } from "@/lib/validation/registration";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("invalid_json", 400, "Request body must be valid JSON");
  }

  const parsed = registrationSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("invalid_registration", 400, parsed.error.issues[0]?.message);
  }

  try {
    const existing = await findRegisteredPlayerByEmail(parsed.data.email);
    const player = existing
      ? {
          playerId: existing.playerId,
          name: existing.name,
          country: existing.country,
          email: existing.email,
        }
      : await createRegisteredPlayer(parsed.data);

    await getKv().set(returningPlayerByIpKey(getRequestIp(request)), player.playerId, {
      ex: 60 * 60 * 24 * 30,
    });

    return ok({ player });
  } catch (error) {
    console.error("registration error", error);
    return fail("server_error", 500, "Unable to save registration");
  }
}
