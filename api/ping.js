/**
 * Vercel diagnostic endpoint — /api/ping
 * Checks: env var present, pepy.tech reachable, single package fetch.
 * Remove this file once the issue is resolved.
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const key = process.env.PEPY_API_KEY;
  const report = {
    env_key_set: !!key,
    env_key_last4: key ? "****" + key.slice(-4) : null,
    vercel_region: process.env.VERCEL_REGION || process.env.AWS_REGION || "unknown",
    node_version: process.version,
    timestamp: new Date().toISOString(),
    pepy_test: null,
  };

  if (!key) {
    return res.status(200).json({ ...report, verdict: "PEPY_API_KEY not set" });
  }

  // Test a single cheap fetch
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const t0 = Date.now();
    const r = await fetch("https://pepy.tech/api/v2/projects/langchain-db2", {
      headers: { "X-Api-Key": key, "User-Agent": "db2-dashboard/diag" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const body = await r.text();

    report.pepy_test = {
      http_status: r.status,
      elapsed_ms: elapsed,
      response_headers: {
        "x-rate-limit-remaining": r.headers.get("x-rate-limit-remaining"),
        "x-rate-limit-limit": r.headers.get("x-rate-limit-limit"),
        "content-type": r.headers.get("content-type"),
      },
      body_preview: r.ok ? "(ok — " + body.length + " bytes)" : body.slice(0, 300),
    };

    report.verdict = r.ok ? "OK" : `FAILED — HTTP ${r.status}`;
  } catch (err) {
    report.pepy_test = { error: err.message };
    report.verdict = "FAILED — " + err.message;
  }

  return res.status(200).json(report);
}
