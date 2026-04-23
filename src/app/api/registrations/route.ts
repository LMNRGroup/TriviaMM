import { ok, fail } from "@/lib/api/http";
import { createRegisteredPlayer } from "@/lib/sheets/player-repo";
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
    const player = await createRegisteredPlayer(parsed.data);
    return ok({ player });
  } catch (error) {
    console.error("registration error", error);
    return fail("server_error", 500, "Unable to save registration");
  }
}
