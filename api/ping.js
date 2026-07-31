// Vercel diagnostic endpoint -- /api/ping
// Tests: env var, pepy.tech connectivity, single package fetch.
// Safe to delete once dashboard is working.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const key = process.env.PEPY_API_KEY;

  const report = {
    v: 3,
    env_key_set: Boolean(key),
    env_key_last4: key ? "****" + key.slice(-4) : null,
    vercel_region: process.env.VERCEL_REGION || process.env.AWS_REGION || "unknown",
    node_version: process.version,
    timestamp: new Date().toISOString(),
    pepy_test: null,
    verdict: null,
  };

  if (!key) {
    report.verdict = "FAIL: PEPY_API_KEY not set in env";
    return res.status(200).json(report);
  }

  const url = "https://pepy.tech/api/v2/projects/langchain-db2";
  const headers = {};
  headers["X-Api-Key"] = key;
  headers["User-Agent"] = "db2ping/1";

  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, 10000);
  const t0 = Date.now();

  try {
    const r = await fetch(url, { headers: headers, signal: ctrl.signal });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const text = await r.text();

    report.pepy_test = {
      http_status: r.status,
      elapsed_ms: ms,
      rate_limit_remaining: r.headers.get("x-rate-limit-remaining"),
      body_length: text.length,
      body_preview: r.ok ? "OK" : text.slice(0, 200),
    };
    report.verdict = r.ok ? "OK" : ("FAIL: HTTP " + r.status);
  } catch (err) {
    clearTimeout(timer);
    const ms = Date.now() - t0;
    report.pepy_test = { error: err.message, elapsed_ms: ms };
    report.verdict = "FAIL: " + err.message;
  }

  return res.status(200).json(report);
}
