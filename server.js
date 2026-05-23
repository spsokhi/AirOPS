// ============================================================
// AirOps Tracker — Local CORS Proxy with OpenSky OAuth2
// ============================================================
// Fetches Indian airspace data from OpenSky Network and re-serves
// it to the browser with permissive CORS headers.
//
// SUPPORTS TWO MODES:
//
//   1. Anonymous (no setup)
//      Just `node server.js`. Uses OpenSky's anonymous endpoint.
//      Limits: 400 credits/day = ~25 minutes of 15s polling.
//
//   2. Authenticated (recommended)
//      Create credentials.json from credentials.example.json with
//      your OpenSky client_id and client_secret. Get them at:
//      https://opensky-network.org/my-opensky/account
//      Limits: 4,000 credits/day = ~4 hours of 15s polling, fresher
//      data, finer time resolution (5s vs 10s).
//
// Usage:
//   node server.js              → port 8787
//
// Requirements: Node.js 18+ (built-in fetch). Zero dependencies.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8787;
const OPENSKY_BASE = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// ============================================================
// Credentials loader
// ============================================================
// Reads credentials.json (gitignored) if present. Falls back
// to anonymous mode otherwise. Also accepts env vars as overrides.
let credentials = null;
try {
  const credPath = path.join(__dirname, 'credentials.json');
  if (fs.existsSync(credPath)) {
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (!credentials.client_id || !credentials.client_secret) {
      console.warn('[WARN] credentials.json found but missing client_id or client_secret');
      credentials = null;
    }
  }
} catch (err) {
  console.warn('[WARN] Failed to read credentials.json:', err.message);
}

// Environment variables override the file
if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
  credentials = {
    client_id: process.env.OPENSKY_CLIENT_ID,
    client_secret: process.env.OPENSKY_CLIENT_SECRET,
  };
}

const MODE = credentials ? 'AUTHENTICATED' : 'ANONYMOUS';

// ============================================================
// Token manager — fetches and refreshes OAuth2 access tokens
// ============================================================
// Tokens are valid for 30 minutes. We refresh with a 60-second
// safety margin so we never use an about-to-expire token.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

let tokenState = {
  accessToken: null,
  expiresAt: 0,        // unix ms
  refreshPromise: null, // in-flight refresh, prevents concurrent token fetches
};

async function getAccessToken() {
  if (!credentials) return null;

  const now = Date.now();
  if (tokenState.accessToken && now < tokenState.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return tokenState.accessToken;
  }

  // Coalesce concurrent refresh attempts into one
  if (tokenState.refreshPromise) {
    return tokenState.refreshPromise;
  }

  tokenState.refreshPromise = refreshToken().finally(() => {
    tokenState.refreshPromise = null;
  });
  return tokenState.refreshPromise;
}

async function refreshToken() {
  console.log(`[${new Date().toISOString()}] [AUTH] Requesting new OAuth2 token...`);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Token endpoint returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const expiresInSec = data.expires_in || 1800; // default 30 min
  tokenState.accessToken = data.access_token;
  tokenState.expiresAt = Date.now() + (expiresInSec * 1000);
  console.log(`[${new Date().toISOString()}] [AUTH] Token acquired, expires in ${expiresInSec}s`);
  return tokenState.accessToken;
}

// ============================================================
// Response cache — avoid hammering OpenSky on rapid polls
// ============================================================
let cache = { data: null, time: 0, url: null };
const CACHE_TTL_MS = 8000;

// ============================================================
// HTTP server
// ============================================================
const server = http.createServer(async (req, res) => {
  // Permissive CORS for browser clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health/status endpoint
  if (req.url === '/' || req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'AirOps Tracker Proxy',
      mode: MODE,
      authenticated: !!credentials,
      cacheTtlMs: CACHE_TTL_MS,
      tokenValidFor: tokenState.expiresAt ? Math.max(0, tokenState.expiresAt - Date.now()) : null,
    }, null, 2));
    return;
  }

  if (!req.url.startsWith('/api/states')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Try /api/states or /status' }));
    return;
  }

  // Build upstream URL by passing query string through
  const qs = req.url.split('?')[1] || '';
  const upstreamUrl = qs ? `${OPENSKY_BASE}?${qs}` : OPENSKY_BASE;

  // Serve from cache if fresh and same query
  const now = Date.now();
  if (cache.data && (now - cache.time) < CACHE_TTL_MS && cache.url === upstreamUrl) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT', 'X-Auth-Mode': MODE });
    res.end(cache.data);
    return;
  }

  // Fetch from OpenSky with retry on 401 (expired token)
  try {
    let body = await fetchFromOpenSky(upstreamUrl);
    cache = { data: body, time: now, url: upstreamUrl };
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS', 'X-Auth-Mode': MODE });
    res.end(body);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [ERROR]`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream fetch failed', detail: err.message }));
  }
});

async function fetchFromOpenSky(url, isRetry = false) {
  const headers = { 'User-Agent': 'AirOps-Tracker/1.0' };

  if (credentials) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  console.log(`[${new Date().toISOString()}] [GET] ${url}`);
  const res = await fetch(url, { headers });

  // Token expired? Refresh and retry once.
  if (res.status === 401 && credentials && !isRetry) {
    console.warn(`[${new Date().toISOString()}] [AUTH] 401 received, forcing token refresh`);
    tokenState.accessToken = null;
    tokenState.expiresAt = 0;
    return fetchFromOpenSky(url, true);
  }

  if (!res.ok) {
    // Surface useful rate-limit info if present
    const retryAfter = res.headers.get('X-Rate-Limit-Retry-After-Seconds');
    const remaining = res.headers.get('X-Rate-Limit-Remaining');
    throw new Error(`HTTP ${res.status}${retryAfter ? ` · retry after ${retryAfter}s` : ''}${remaining ? ` · ${remaining} credits left` : ''}`);
  }

  // Log credit balance occasionally so you can monitor usage
  const remaining = res.headers.get('X-Rate-Limit-Remaining');
  if (remaining && Math.random() < 0.1) {
    console.log(`[${new Date().toISOString()}] [CREDITS] ${remaining} remaining`);
  }

  return await res.text();
}

// ============================================================
// Startup
// ============================================================
server.listen(PORT, async () => {
  const bar = '═'.repeat(56);
  console.log('');
  console.log(`  ╔${bar}╗`);
  console.log(`  ║  AIROPS PROXY · Indian Airspace Live Feed              ║`);
  console.log(`  ╠${bar}╣`);
  console.log(`  ║  Listening    http://localhost:${PORT}                     ║`);
  console.log(`  ║  Endpoint     /api/states                              ║`);
  console.log(`  ║  Status       /status                                  ║`);
  console.log(`  ║  Upstream     opensky-network.org                      ║`);
  console.log(`  ║  Cache TTL    ${CACHE_TTL_MS / 1000}s                                       ║`);
  console.log(`  ║  Auth mode    ${MODE.padEnd(43)}║`);
  console.log(`  ╚${bar}╝`);
  console.log('');

  if (MODE === 'AUTHENTICATED') {
    console.log('  ✓ Authenticated mode active.');
    console.log('    Daily quota: 4,000 credits (~4 hours of 15s polling)');
    console.log('    Time resolution: 5s');
    // Preflight: try to get a token immediately so we fail fast on bad creds
    try {
      await getAccessToken();
      console.log('  ✓ OAuth2 token acquired successfully.');
    } catch (err) {
      console.error('  ✗ OAuth2 token request FAILED:', err.message);
      console.error('    Check credentials.json or env vars.');
      console.error('    Server will continue, but requests will fail.');
    }
  } else {
    console.log('  ⚠ Running in ANONYMOUS mode.');
    console.log('    Daily quota: 400 credits (~25 min of 15s polling)');
    console.log('    Time resolution: 10s');
    console.log('    For more data, create credentials.json (see credentials.example.json)');
  }

  console.log('');
  console.log('  Now open airops.html in your browser. Ctrl+C to stop.');
  console.log('');
});
