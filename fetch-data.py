"""
fetch-data.py
Fetch download statistics from pypistats.org for all Db2 ecosystem connectors.

Endpoints used per package:
  recent  → /api/packages/{name}/recent
  overall → /api/packages/{name}/overall?mirrors=false  (no CI/mirror noise)
  overall → /api/packages/{name}/overall?mirrors=true   (all downloads incl. mirrors)

Run:
  python fetch-data.py
"""

import json
import urllib.request
import urllib.error
import time
from datetime import datetime

PACKAGES = [
    "lfx-ibm",
    "langflow-db2-connector",          # user label: "langflow db2 connector"
    "langchain-db2",
    "ibm-db-haystack",
    "llama-index-vector-stores-db2",   # user label: "lamma-index-db2-vector-store"
    "db2-sqlglot-dialect",
    "ibm-dbt-db2",
]

BASE = "https://pypistats.org/api/packages"
HEADERS = {"User-Agent": "db2-telemetry-fetcher/1.0"}

def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "url": url}
    except Exception as e:
        return {"error": str(e), "url": url}

def fetch_package(name: str) -> dict:
    recent_url  = f"{BASE}/{name}/recent"
    overall_no_mirrors = f"{BASE}/{name}/overall?mirrors=false"
    overall_with_mirrors = f"{BASE}/{name}/overall?mirrors=true"

    recent  = fetch(recent_url)
    time.sleep(0.4)   # be polite to the API
    overall_false = fetch(overall_no_mirrors)
    time.sleep(0.4)
    overall_true  = fetch(overall_with_mirrors)
    time.sleep(0.4)

    return {
        "package": name,
        "recent": recent,
        "overall_mirrors_false": overall_false,
        "overall_mirrors_true": overall_true,
    }

def summarise(result: dict) -> None:
    pkg = result["package"]
    print(f"\n{'─'*60}")
    print(f"  📦  {pkg}")
    print(f"{'─'*60}")

    # ── recent ──────────────────────────────────────────────────
    recent = result.get("recent", {})
    if "error" in recent:
        print(f"  recent        : ERROR — {recent['error']}")
    else:
        data = recent.get("data", {})
        print(f"  last_day      : {data.get('last_day',  'n/a'):>10,}" if isinstance(data.get('last_day'), int) else f"  last_day      : {data.get('last_day', 'n/a')}")
        print(f"  last_week     : {data.get('last_week', 'n/a'):>10,}" if isinstance(data.get('last_week'), int) else f"  last_week     : {data.get('last_week', 'n/a')}")
        print(f"  last_month    : {data.get('last_month','n/a'):>10,}" if isinstance(data.get('last_month'), int) else f"  last_month    : {data.get('last_month', 'n/a')}")

    # ── overall (mirrors=false) ──────────────────────────────────
    ov_f = result.get("overall_mirrors_false", {})
    if "error" in ov_f:
        print(f"  overall(no mirror): ERROR — {ov_f['error']}")
    else:
        rows = ov_f.get("data", [])
        total = sum(r.get("downloads", 0) for r in rows)
        print(f"  overall(no mirrors): {total:>10,}  ({len(rows)} rows)")

    # ── overall (mirrors=true) ───────────────────────────────────
    ov_t = result.get("overall_mirrors_true", {})
    if "error" in ov_t:
        print(f"  overall(w/ mirror): ERROR — {ov_t['error']}")
    else:
        rows = ov_t.get("data", [])
        total = sum(r.get("downloads", 0) for r in rows)
        print(f"  overall(w/ mirrors): {total:>10,}  ({len(rows)} rows)")

def main():
    print(f"Db2 Connector Download Stats — pypistats.org")
    print(f"Fetched at: {datetime.now(tz=__import__('datetime').timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Packages  : {len(PACKAGES)}")

    all_results = []
    for name in PACKAGES:
        print(f"\nFetching → {name} ...", end=" ", flush=True)
        result = fetch_package(name)
        all_results.append(result)
        print("done")
        summarise(result)

    # Dump full raw JSON for inspection / ingest into the dashboard
    out_file = "pypi_stats.json"
    with open(out_file, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\n\nFull raw data written → {out_file}")

if __name__ == "__main__":
    main()
