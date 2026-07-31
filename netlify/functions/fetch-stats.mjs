/**
 * Netlify Scheduled Function — runs every hour via cron.
 * Fetches pepy.tech for all Db2 connector packages and writes
 * the result to public/data.json which the frontend reads.
 *
 * Schedule: "0 * * * *"  (top of every hour)
 *
 * Environment variables required (set in Netlify UI → Site settings → Env):
 *   PEPY_API_KEY  — your pepy.tech API key
 */

import { schedule } from "@netlify/functions";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PEPY_API_KEY = process.env.PEPY_API_KEY;
if (!PEPY_API_KEY) {
  console.error("fetch-stats: PEPY_API_KEY env var is not set — aborting.");
}
const PEPY_BASE    = "https://pepy.tech/api/v2/projects/";

const PACKAGES = [
  "lfx-ibm",
  "langchain-db2",
  "ibm-db-haystack",
  "llama-index-vector-stores-db2",
  "db2-sqlglot-dialect",
  "ibm-dbt-db2",
];

async function fetchPepy(pkg) {
  const res = await fetch(PEPY_BASE + pkg, {
    headers: { "X-Api-Key": PEPY_API_KEY, "User-Agent": "db2-dashboard/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pkg}`);
  return res.json();
}

async function buildStats() {
  const packages = {};

  await Promise.allSettled(
    PACKAGES.map(async (pkg) => {
      try {
        const d = await fetchPepy(pkg);
        const dl = d.downloads || {};
        const dates = Object.keys(dl).sort();
        const n = dates.length;
        const cutoff30 = n >= 30 ? dates[n - 30] : dates[0] ?? "";
        const last30 = Object.entries(dl)
          .filter(([date]) => date >= cutoff30)
          .reduce((sum, [, v]) => sum + Object.values(v).reduce((s, x) => s + x, 0), 0);
        const lastDay = dates.length
          ? Object.values(dl[dates[dates.length - 1]]).reduce((s, x) => s + x, 0)
          : 0;
        const series = Object.entries(dl)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-90)
          .map(([date, vmap]) => ({
            date,
            downloads: Object.values(vmap).reduce((s, x) => s + x, 0),
          }));

        packages[pkg] = {
          total_downloads: d.total_downloads ?? 0,
          last_month: last30,
          last_day: lastDay,
          series,
        };
      } catch (err) {
        console.error(`fetch-stats: failed for ${pkg}:`, err.message);
      }
    })
  );

  return {
    fetched_at: new Date().toISOString(),
    packages,
  };
}

const handler = schedule("0 * * * *", async () => {
  console.log("fetch-stats: starting hourly refresh…");
  const stats = await buildStats();

  // Write to public/data.json so the static site can serve it
  const outDir  = join(process.cwd(), "public");
  const outFile = join(outDir, "data.json");
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(outFile, JSON.stringify(stats), "utf8");
    console.log(`fetch-stats: wrote ${outFile} at ${stats.fetched_at}`);
  } catch (err) {
    console.error("fetch-stats: could not write data.json:", err.message);
  }

  return { statusCode: 200 };
});

export { handler };
