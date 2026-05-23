# AirOps Tracker

A tactical-display web dashboard for tracking real-world aircraft in Indian
airspace, themed after Indian Air Force command-and-control aesthetics.

Built as a single-page frontend (`airops.html`) backed by a tiny zero-dependency
Node.js proxy (`server.js`) that authenticates with the OpenSky Network API
and bridges the data to your browser.

![status](https://img.shields.io/badge/status-operational-gold)
![data](https://img.shields.io/badge/data-OpenSky_Network-5BB0E5)
![stack](https://img.shields.io/badge/stack-Vanilla_JS_+_Node-0E3463)
![deps](https://img.shields.io/badge/dependencies-zero-138808)

---

## Features

- **Live aircraft tracking** over Indian airspace (6°N–37°N, 68°E–97°E)
- **OAuth2-authenticated** OpenSky API access for 10× more daily quota
- **Leaflet dark-tile map** with rotating aircraft icons colored by class
- **Eight major airfield reference markers** (Delhi, Mumbai, Bengaluru,
  Chennai, Kolkata, Hyderabad, Ambala, Pune)
- **Filters** — ICAO24 / callsign search, aircraft category, altitude floor,
  origin country
- **Right-side contact list** sorted by altitude with click-to-fly
- **Detail panel** with full state vector for selected aircraft
- **Live SITREP ticker** announcing new contacts
- **Top-bar telemetry** — tracked / airborne / ground / avg altitude /
  max speed, IST clock
- **Demo mode fallback** — if the live feed is unreachable, the dashboard
  generates a realistic synthetic fleet so it always works for demos

---

## Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Frontend | Single-file HTML + vanilla JS + Leaflet 1.9.4  |
| Map tiles| CARTO dark basemap (no API key required)       |
| Backend  | Node.js HTTP server with OAuth2 (zero deps)    |
| Data     | OpenSky Network `/states/all` REST endpoint    |
| Auth     | OAuth2 client_credentials flow                 |
| Fonts    | Bebas Neue, Oswald, JetBrains Mono (Google)    |

---

## Requirements

- **Node.js 18 or newer** (uses built-in `fetch`)
- Any modern browser (Chrome, Brave, Firefox, Edge)
- Internet access (for OpenSky API, CARTO tiles, Google Fonts)
- *(Optional but recommended)* A free OpenSky Network account for
  authenticated API access

Check your Node version:

```bash
node --version
```

If it's below 18, upgrade from https://nodejs.org.

---

## Quick start

### 1. Folder layout

After cloning the repo, you should have:

```
AirOps/
├── airops.html
├── server.js
├── credentials.example.json
├── .gitignore
└── README.md
```

### 2. (Recommended) Set up OpenSky authentication

The proxy works without credentials, but you'll only get 400 API credits/day
(~25 minutes of polling). A free OpenSky account gives you 4,000 credits/day
plus fresher data — well worth the 2-minute signup.

1. **Create a free OpenSky account** at https://opensky-network.org/login
2. **Log in** and visit your **Account** page:
   https://opensky-network.org/my-opensky/account
3. Scroll to the **API Client** section and create a new client. Copy the
   `client_id` and `client_secret` — the secret is shown **only once**, so
   save it immediately.
4. In the project folder, copy the example credentials file:

   **Windows (PowerShell):**
   ```powershell
   Copy-Item credentials.example.json credentials.json
   ```

   **macOS / Linux:**
   ```bash
   cp credentials.example.json credentials.json
   ```

5. Open `credentials.json` and paste in your real values:

   ```json
   {
     "client_id": "abc123-your-real-client-id",
     "client_secret": "your-real-secret-here"
   }
   ```

`credentials.json` is listed in `.gitignore` so it will never be committed.

### 3. Start the proxy

In a terminal, in the project folder:

```bash
node server.js
```

You should see the banner:

```
╔════════════════════════════════════════════════════════╗
║  AIROPS PROXY · Indian Airspace Live Feed             ║
╠════════════════════════════════════════════════════════╣
║  Listening    http://localhost:8787                    ║
║  Endpoint     /api/states                              ║
║  Status       /status                                  ║
║  Upstream     opensky-network.org                      ║
║  Cache TTL    8s                                       ║
║  Auth mode    AUTHENTICATED                            ║
╚════════════════════════════════════════════════════════╝

  ✓ Authenticated mode active.
    Daily quota: 4,000 credits (~4 hours of 15s polling)
    Time resolution: 5s
  ✓ OAuth2 token acquired successfully.

  Now open airops.html in your browser. Ctrl+C to stop.
```

If `Auth mode` shows `ANONYMOUS`, the proxy didn't find your credentials —
check that `credentials.json` exists in the same folder as `server.js` and
contains real values (not the placeholders).

**Leave this terminal running.** Closing it stops the proxy.

### 4. Open the dashboard

Open `airops.html` in your browser. Two options:

**Option A — Direct file open**
Double-click `airops.html`. Works fine.

**Option B — Live Server (VS Code extension)**
Right-click `airops.html` in VS Code → "Open with Live Server".
Serves at `http://127.0.0.1:5500/airops.html`.

Within ~5 seconds you should see:

- The **LIVE FEED** indicator (red pulsing dot) in the top right
- Aircraft markers appearing on the map
- The right-side contacts panel populating
- The bottom ticker announcing new contacts

---

## Status indicators

| Top-right indicator        | Meaning                                                 |
| -------------------------- | ------------------------------------------------------- |
| 🔴 **LIVE FEED** (red)     | Connected to OpenSky via the local proxy                |
| 🟡 **DEMO MODE** (gold)    | Proxy unreachable, showing simulated synthetic fleet    |
| ⚫ **NO LINK** (grey)      | All sources failed (rare)                               |

You can also visit `http://localhost:8787/status` directly to see the proxy's
current state, including whether it's authenticated and how long the current
access token is valid.

---

## Authentication: anonymous vs authenticated

| Aspect                | Anonymous            | Authenticated (free signup) |
| --------------------- | -------------------- | --------------------------- |
| Daily API credits     | 400                  | 4,000                       |
| Time resolution       | 10 s                 | 5 s                         |
| Polling at 15s cycle  | ~25 minutes / day    | ~4 hours / day              |
| Polling at 30s cycle  | ~50 minutes / day    | ~8 hours / day              |
| Aircraft completeness | Sampled              | Full                        |
| Setup                 | None                 | 2-minute account + creds    |

A query covering all of India (~899 sq° bounding box) costs **4 credits per
request** since it exceeds 400 sq°. The proxy caches each response for 8
seconds to ensure rapid frontend polls don't burn through quota.

The proxy automatically refreshes its OAuth2 access token before it expires
(tokens last 30 minutes) and retries any request that comes back with a 401.
No manual token management needed.

---

## Troubleshooting

### "Failed to fetch" / CORS error in browser console

OpenSky's API does not send permissive CORS headers, which is why you need
`server.js` running as a local proxy.

**Fix:** Make sure `node server.js` is running and shows the banner. Hard-
reload the page with **Ctrl+Shift+R**.

### Browser shows "DEMO MODE" instead of "LIVE FEED"

The proxy isn't reachable. Check:

1. Is the `server.js` terminal still open and showing the banner?
2. Visit `http://localhost:8787/status` directly in your browser. You should
   see a JSON status response. If the page won't load at all, the proxy
   isn't running.
3. Make sure port 8787 isn't blocked by a firewall or used by another app.

### Banner shows "Auth mode  ANONYMOUS" even though I set up credentials

The credentials file isn't being found or parsed. Check:

1. Is the file named exactly `credentials.json` (not `credentials.json.txt`,
   which Windows sometimes adds)? Show file extensions in Explorer to verify.
2. Is it in the **same folder** as `server.js`?
3. Open it in a text editor and confirm the JSON is valid — both `client_id`
   and `client_secret` keys present, values in double quotes, no trailing
   commas.
4. Try a strict JSON validator like https://jsonlint.com.

### Banner shows authenticated but says "OAuth2 token request FAILED"

Your `client_id` / `client_secret` pair is wrong, or your OpenSky account is
new and hasn't been activated yet. Re-create the API client at
https://opensky-network.org/my-opensky/account and paste fresh values into
`credentials.json`.

### `node server.js` errors with "fetch is not defined"

Your Node.js is too old. Built-in `fetch` requires Node 18+. Upgrade Node
from https://nodejs.org.

### `EADDRINUSE` error when starting the proxy

Port 8787 is already in use. Either kill whatever is using it, or edit the
`PORT` constant near the top of `server.js` and update the matching URL in
`airops.html` (search for `localhost:8787`).

### HTTP 429 "Too many requests"

You've exhausted your daily credit quota. The error message includes
`X-Rate-Limit-Retry-After-Seconds` indicating when credits refill. Switch to
demo mode in the meantime, or wait for the daily reset (UTC midnight).

### Map tiles don't load

You're offline or CARTO's CDN is blocked. The dashboard will still show
aircraft markers, just over a blank background.

---

## How it works

```
┌────────────┐      ┌──────────────┐      ┌────────────────────┐
│  Browser   │ ───→ │  server.js   │ ───→ │ opensky-network.org│
│ airops.html│ ←─── │  :8787       │ ←─── │ /api/states/all    │
└────────────┘      └──────────────┘      └────────────────────┘
   polls every       OAuth2 token mgr        REST API
   15s by default    + 8s response cache     (Bearer auth)
                     + CORS headers
                            │
                            ▼
                  ┌────────────────────┐
                  │ auth.opensky-      │
                  │ network.org        │
                  │ /token             │
                  └────────────────────┘
                  client_credentials flow
                  (refreshes every ~30 min)
```

**`server.js` responsibilities:**

- Loads `credentials.json` at startup (falls back to anonymous if missing)
- Performs OAuth2 token exchanges; refreshes proactively before expiry
- Retries any 401 once with a fresh token
- Forwards `/api/states?...` requests to OpenSky with `Bearer` auth
- Caches each response for 8 seconds to conserve API credits
- Re-serves the JSON with `Access-Control-Allow-Origin: *`
- Surfaces rate-limit info from response headers
- Exposes `/status` for health checks

**`airops.html` responsibilities:**

- Tries `http://localhost:8787` first, then three public CORS proxies as
  fallbacks, then synthetic demo data as a last resort
- Maintains a Map of `icao24 → marker` and reconciles each poll: adds
  new aircraft, moves existing ones, removes stale ones
- Categorizes aircraft heuristically (military callsigns, low-and-slow =
  helicopter) since OpenSky's free tier doesn't expose the ICAO category
  field reliably

---

## Configuration

### Change the polling cycle

In the left panel under **REFRESH CYCLE**, pick 10s / 15s / 30s / 60s.

OpenSky's data refreshes roughly every 5–10 seconds upstream, so 10–15s
is the sweet spot. Slower cycles reduce API credit consumption.

### Change the bounding box

Edit the `BBOX` constant in `airops.html`:

```javascript
const BBOX = { lamin: 6.0, lomin: 68.0, lamax: 37.0, lomax: 97.0 };
```

Default covers Indian airspace including FIRs. Smaller box = fewer aircraft
but lower API credit cost.

### Use environment variables instead of credentials.json

If you'd rather not store credentials in a file (e.g. for deploys),
`server.js` reads these env vars and they take precedence over the file:

```bash
# macOS / Linux
export OPENSKY_CLIENT_ID="your_client_id"
export OPENSKY_CLIENT_SECRET="your_client_secret"
node server.js

# Windows PowerShell
$env:OPENSKY_CLIENT_ID = "your_client_id"
$env:OPENSKY_CLIENT_SECRET = "your_client_secret"
node server.js
```

---

## Why the aircraft count differs from Flightradar24

The same airspace can show 300+ aircraft on Flightradar24 but only ~80–150
on this dashboard. Reasons:

1. **Coverage** — FR24 fuses ADS-B + MLAT + satellite (Aireon) + radar
   + airline schedules. OpenSky is volunteer ADS-B receivers only, and
   India has sparse receiver coverage. Aircraft over central India and
   maritime areas are often invisible to OpenSky.
2. **ADS-B equipage** — Many military and older aircraft don't broadcast
   ADS-B. FR24 fills these in from other sources; OpenSky doesn't.
3. **Tier limits** — Anonymous OpenSky data is sampled with coarser time
   resolution. Authenticated accounts (which this proxy supports) see
   more complete and fresher data.

This dashboard is showing OpenSky's honest view, which is the best free
real-time feed available.

---

## File reference

| File                       | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `airops.html`              | Complete single-file frontend (HTML + CSS + JS)            |
| `server.js`                | Local CORS proxy with OAuth2 (no npm install)              |
| `credentials.example.json` | Template to copy into `credentials.json`                   |
| `credentials.json`         | Your real OpenSky API credentials (gitignored)             |
| `.gitignore`               | Excludes credentials and OS/IDE junk from git              |
| `README.md`                | This file                                                  |

---

## Data attribution

Aircraft data: **OpenSky Network** — https://opensky-network.org/
Used under their terms for non-commercial / research use.

If you publish work using this data, cite:
> Matthias Schäfer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic,
> Matthias Wilhelm. *Bringing Up OpenSky: A Large-scale ADS-B Sensor
> Network for Research.* IPSN 2014.

Map tiles: **CARTO** + **OpenStreetMap contributors** — © OpenStreetMap

Fonts: Bebas Neue, Oswald, JetBrains Mono via Google Fonts.

---

## Security note

Your OpenSky `client_secret` is sensitive — it authorizes API usage charged
against your account. The included `.gitignore` excludes `credentials.json`,
but you should also:

- Never paste your `client_secret` into screenshots, issues, or chat logs.
- If you accidentally commit it, rotate the credentials at
  https://opensky-network.org/my-opensky/account immediately.
- Consider using environment variables in any deployed environment.

---

## License

This dashboard is provided as-is for educational and demonstration purposes.
The IAF theming uses publicly available color symbology and is not affiliated
with or endorsed by the Indian Air Force.
