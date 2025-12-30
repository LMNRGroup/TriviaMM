function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const { passkey } = req.body || {};
    const pk = (passkey || "").trim();
    const expected = (process.env.APP_PK || "").trim();

    if (!expected) return json(res, 500, { ok: false, error: "APP_PK_not_configured" });
    if (!pk) return json(res, 400, { ok: false, error: "missing_passkey" });

    const ok = pk === expected;
    return json(res, ok ? 200 : 401, { ok });
  } catch (err) {
    console.error("validate-passkey error:", err);
    return json(res, 500, { ok: false, error: "server_error" });
  }
};
