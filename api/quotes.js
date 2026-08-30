// api/quotes.js — Vercel serverless function
// Real-time-ish US stock quotes from Finnhub, with the API key kept SERVER-SIDE.
// The browser calls THIS endpoint (no key); this function calls Finnhub with the key.
//
// Request:  GET /api/quotes?symbols=AAPL,MSFT,SPY
// Response: { "quotes": { "AAPL": { "px": 231.4, "prev": 229.8, "chg": 0.70, "at": "..." } }, "asOf": 1699... }
//
// Env var required (set in Vercel dashboard → Settings → Environment Variables):
//   FINNHUB_KEY = your Finnhub API key

const FINNHUB = 'https://finnhub.io/api/v1/quote';

// Small in-memory cache. Serverless instances are reused while warm, so this
// meaningfully cuts Finnhub calls under load; it is best-effort, never relied on.
const cache = new Map(); // symbol -> { data, exp }
const TTL_MS = 8000;

// Bound how many upstream requests we fan out per invocation so the free-tier
// 60-calls/min limit is respected even if someone asks for a huge symbol list.
const MAX_SYMBOLS = 40;
const CONCURRENCY = 6;

function cleanSymbol(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9.^-]/g, '').slice(0, 12);
}

async function fetchOne(symbol, key) {
  const hit = cache.get(symbol);
  if (hit && hit.exp > Date.now()) return hit.data;
  const url = `${FINNHUB}?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`finnhub ${r.status}`);
  const j = await r.json();
  // Finnhub /quote: c=current, pc=previous close, dp=percent change, t=unix ts.
  // c===0 with pc===0 means "unknown symbol" — skip it rather than reporting $0.
  if (!(j && Number(j.c) > 0)) return null;
  const px = Number(j.c);
  const prev = Number(j.pc) > 0 ? Number(j.pc) : null;
  let chg = Number.isFinite(Number(j.dp)) ? Number(j.dp) : null;
  if ((chg == null || Math.abs(chg) > 60) && prev) chg = ((px - prev) / prev) * 100;
  const at = j.t ? new Date(j.t * 1000).toISOString() : '';
  const data = { px, prev, chg, at };
  cache.set(symbol, { data, exp: Date.now() + TTL_MS });
  return data;
}

// Simple concurrency-limited map so we never open 40 sockets at once.
async function pool(items, limit, worker) {
  const out = {};
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      const sym = items[idx];
      try { const d = await worker(sym); if (d) out[sym] = d; }
      catch (_) { /* skip this symbol, keep the rest */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

export default async function handler(req, res) {
  // CORS: allow the browser app (any origin) to read this. Tighten to your own
  // domain in production by replacing '*' with 'https://your-app.vercel.app'.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.FINNHUB_KEY;
  if (!key) return res.status(500).json({ error: 'FINNHUB_KEY is not set on the server.' });

  const raw = (req.query.symbols || '').toString();
  const symbols = [...new Set(raw.split(',').map(cleanSymbol).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if (!symbols.length) return res.status(400).json({ error: 'Pass ?symbols=AAPL,MSFT' });

  try {
    const quotes = await pool(symbols, CONCURRENCY, (s) => fetchOne(s, key));
    // Let the browser/CDN reuse the response briefly to smooth out bursts.
    res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=20');
    return res.status(200).json({ quotes, asOf: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream quote provider failed. Try again shortly.' });
  }
}
