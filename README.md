# Db2 Ecosystem — Download Telemetry Dashboard

**Live:** https://db2-opensource-telemetry.vercel.app

---

## What this is

A fully static dashboard tracking download metrics for the IBM Db2 open-source connector ecosystem across PyPI packages and VS Code Marketplace extensions. No backend server — the data is fetched server-side by a Vercel Serverless Function and served to the frontend via `/api/stats`.

---

## Architecture

```
Browser
  |
  v  GET /api/stats
Vercel Serverless Function (api/stats.js)
  |
  v  X-Api-Key: PEPY_API_KEY
pepy.tech API  -->  returns daily download series per package
  |
  v
JSON response cached at Vercel CDN edge (1 hour)
  |
  v
Frontend (public/index.html) renders charts + stats
```

### Key design decisions explored

| Option | Tried | Outcome |
|---|---|---|
| Browser direct to pepy.tech | Yes | CORS blocked from Vercel domain |
| Browser via CORS proxies (allorigins, corsproxy.io) | Yes | Both returning 403 from Vercel-hosted origin |
| Netlify Scheduled Functions (write data.json) | Yes | Blocked by IBM Vault Radar (API key in source) + Netlify not on approved list |
| Vercel `/api/stats` proxy route | **Yes — current solution** | Works. API key stays server-side, never in browser |
| Vercel Cron Jobs | **Yes — enabled** | Calls `/api/stats` daily at midnight UTC to warm the CDN cache |

---

## Packages tracked

| Package | Framework | PyPI |
|---|---|---|
| `lfx-ibm` | LangFlow | https://pypi.org/project/lfx-ibm/ |
| `langchain-db2` | LangChain | https://pypi.org/project/langchain-db2/ |
| `ibm-db-haystack` | Haystack | https://pypi.org/project/ibm-db-haystack/ |
| `llama-index-vector-stores-db2` | LlamaIndex | https://pypi.org/project/llama-index-vector-stores-db2/ |
| `db2-sqlglot-dialect` | SQLGlot | https://pypi.org/project/db2-sqlglot-dialect/ |
| `ibm-dbt-db2` | dbt | https://pypi.org/project/ibm-dbt-db2/ |

---

## How the refresh works

- **On page load** — frontend calls `/api/stats` immediately
- **Vercel CDN** — caches the response for 1 hour (`s-maxage=3600`), so repeated loads within the hour are instant with zero pepy.tech API calls
- **Vercel Cron** — fires `/api/stats` at `00:00 UTC` daily, warming the cache for the next day
- **Frontend auto-poll** — re-calls `/api/stats` every 24 hours while the tab is open
- **Fallback** — if `/api/stats` fails, the last-known snapshot numbers (hardcoded Jul 31) are shown with a failure banner and countdown to next retry

> **Note:** Vercel Hobby (free) plan supports cron jobs once per day only.
> Hourly cron requires Vercel Pro ($20/mo). The CDN `s-maxage=3600` means
> the first visitor each hour re-fetches live; subsequent visitors get cached.

---

## Repo structure

```
/
├── api/
│   └── stats.js          Vercel serverless function — fetches pepy.tech
├── public/
│   └── index.html        Single-file dashboard (HTML + CSS + JS)
├── vercel.json           Routing, cron schedule, function config
├── package.json          Node >=18 requirement
├── fetch-data.py         Local script to pull stats to pypi_stats.json
└── pypi_stats.json       Last local snapshot (not used by the live site)
```

---

## Environment variables (Vercel)

| Key | Where to set | Notes |
|---|---|---|
| `PEPY_API_KEY` | Vercel -> Settings -> Environment Variables | pepy.tech authenticated API key. **Type manually — do not paste from rich text** (copy-paste can introduce Unicode dashes that break Node 24's fetch header validation) |

---

## Local development

```bash
npm i -g vercel
vercel dev          # serves public/ + api/ locally at localhost:3000
```

---

## Updating snapshot data

Run the Python script to pull fresh numbers locally:

```bash
python3 fetch-data.py
```

To update the hardcoded fallback snapshot in `public/index.html`, find the `PACKAGES` array and update the `snapshot` objects with the latest numbers from `pypi_stats.json`.

---

## Known issues / gotchas

- **Non-ASCII in `PEPY_API_KEY`** — Node 24 on Vercel throws `Cannot convert argument to a ByteString` if the env var contains Unicode characters. The `api/stats.js` strips non-ASCII automatically but the correct fix is to retype the key manually in Vercel dashboard.
- **Vercel cron on Hobby** — limited to once per day. The CDN cache (`s-maxage=3600`) compensates by serving stale-while-revalidate for up to 10 minutes after expiry.
- **pepy.tech rate limit** — 1000 requests/day on authenticated plan. At 6 packages x 1 cron call/day = 6 API calls/day. Well within limit.
