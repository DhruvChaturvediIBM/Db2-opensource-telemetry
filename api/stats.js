/**
 * Vercel Serverless Function -- /api/stats
 * Fetches pepy.tech for all Db2 connector packages and returns JSON.
 *
 * Environment variables (Vercel -> Settings -> Environment Variables):
 *   PEPY_API_KEY  -- pepy.tech API key
 */

const PEPY_BASE = "https://pepy.tech/api/v2/projects/";

const PACKAGES = [
  "lfx-ibm",
  "langchain-db2",
  "ibm-db-haystack",
  "llama-index-vector-stores-db2",
  "db2-sqlglot-dialect",
  "ibm-dbt-db2",
];

async function fetchPepy(pkg, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(PEPY_BASE + pkg, {
      headers: { "X-Api-Key": key, "User-Agent": "db2-dashboard/1.0" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + (body ? ": " + body.slice(0, 120) : ""));
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function processPackage(d) {
  const dl = d.downloads || {};
  const dates = Object.keys(dl).sort();
  const n = dates.length;
  const cutoff30 = n >= 30 ? dates[n - 30] : dates[0] ?? "";
  const last_month = Object.entries(dl)
    .filter(([date]) => date >= cutoff30)
    .reduce((sum, [, v]) => sum + Object.values(v).reduce((s, x) => s + x, 0), 0);
  const last_day = n
    ? Object.values(dl[dates[n - 1]]).reduce((s, x) => s + x, 0)
    : 0;
  const series = Object.entries(dl)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-90)
    .map(([date, vmap]) => ({
      date,
      downloads: Object.values(vmap).reduce((s, x) => s + x, 0),
    }));
  return { total_downloads: d.total_downloads ?? 0, last_month, last_day, series };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.PEPY_API_KEY;
  if (!key) {
    console.error("[api/stats] PEPY_API_KEY env var is not set");
    return res.status(500).json({
      error: "PEPY_API_KEY env var is not set",
      hint: "Add it in Vercel -> Settings -> Environment Variables, then redeploy",
    });
  }

  console.log("[api/stats] v4 fetching " + PACKAGES.length + " packages  key=****" + key.slice(-4));

  const results = await Promise.allSettled(
    PACKAGES.map(async (pkg) => {
      const t0 = Date.now();
      try {
        const d = await fetchPepy(pkg, key);
        const data = processPackage(d);
        console.log("[api/stats]   OK  " + pkg + "  total=" + data.total_downloads + "  30d=" + data.last_month + "  1d=" + data.last_day + "  (" + (Date.now()-t0) + "ms)");
        return { pkg, data };
      } catch (err) {
        console.error("[api/stats]   ERR " + pkg + "  " + err.message + "  (" + (Date.now()-t0) + "ms)");
        throw err;
      }
    })
  );

  const packages = {};
  const errors = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      packages[r.value.pkg] = r.value.data;
    } else {
      const pkg = PACKAGES[results.indexOf(r)];
      errors[pkg] = r.reason?.message || "unknown error";
    }
  }

  const okCount = Object.keys(packages).length;
  if (okCount === 0) {
    console.error("[api/stats] all packages failed:", errors);
    return res.status(500).json({
      error: "all pepy.tech fetches failed",
      errors,
    });
  }

  if (okCount < PACKAGES.length) {
    console.warn("[api/stats] partial: " + okCount + "/" + PACKAGES.length + " ok");
  }

  console.log("[api/stats] done -- " + okCount + "/" + PACKAGES.length + " packages OK");

  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");
  return res.status(200).json({
    v: 4,
    fetched_at: new Date().toISOString(),
    packages,
    ...(Object.keys(errors).length > 0 && { partial_errors: errors }),
  });
}
