/**
 * Vercel Serverless Function — /api/stats
 * Fetches pepy.tech for all Db2 connector packages and returns JSON.
 * Called by the frontend on load and polled hourly.
 * Vercel CDN caches the response for 1 hour (s-maxage=3600).
 *
 * Schedule: vercel.json crons trigger this at the top of every hour.
 *
 * Environment variables (Vercel dashboard → Settings → Environment Variables):
 *   PEPY_API_KEY  — pepy.tech API key
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
  const res = await fetch(PEPY_BASE + pkg, {
    headers: { "X-Api-Key": key, "User-Agent": "db2-dashboard/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  const key = process.env.PEPY_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "PEPY_API_KEY not configured" });
  }

  const results = await Promise.allSettled(
    PACKAGES.map(async (pkg) => {
      const d = await fetchPepy(pkg, key);
      return { pkg, data: processPackage(d) };
    })
  );

  const packages = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      packages[r.value.pkg] = r.value.data;
    }
  }

  // Cache at Vercel CDN edge for 1 hour — serves stale while revalidating
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    fetched_at: new Date().toISOString(),
    packages,
  });
}
