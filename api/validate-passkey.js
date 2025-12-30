
function json(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const passkey = String(body.passkey || "").trim();
    const serverPk = process.env.APP_PK;

    if (!serverPk) return json(res, 500, { ok: false, error: "app_pk_not_configured" });
    if (!passkey) return json(res, 400, { ok: false, error: "missing_passkey" });

    if (passkey !== serverPk) return json(res, 401, { ok: false, error: "invalid_passkey" });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }
}
