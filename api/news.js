// api/news.js — Vercel serverless function
// Real market headlines from Finnhub (real source names + real article URLs),
// with the API key kept SERVER-SIDE.
//
// Request:  GET /api/news?region=all           (region: all | us | uk-eu | asia | other | crypto)
// Response: { "items": [ { time, impact, title, summary, source, url, tag } ], "asOf": 1699... }
//
// Env var required:  FINNHUB_KEY = your Finnhub API key
//
// Note on "impact": Finnhub's news feed does not carry an importance rating. We
// derive a transparent, keyword-based tier (high/medium/low) purely so the app's
// red/orange/yellow grouping keeps working. It is a heuristic, not an official
// classification — do not treat it as authoritative.

const NEWS = 'https://finnhub.io/api/v1/news';

const cache = new Map(); // category -> { items, exp }
const TTL_MS = 60000;

// Finnhub segments general market news vs crypto. Country-level segmentation is
// not offered on the free feed, so non-crypto regions share the general feed;
// the region is still passed through so you can refine later.
function categoryFor(region) {
  return region === 'crypto' ? 'crypto' : 'general';
}

const HIGH = /\b(fed|fomc|rate (cut|hike|decision)|inflation|cpi|ppi|jobs report|payrolls|recession|tariff|war|crash|central bank|ecb|boe|default|downgrade|bankruptcy)\b/i;
const MED  = /\b(earnings|guidance|revenue|merger|acquisition|ipo|lawsuit|sec |downgrade|upgrade|layoff|oil|opec|yields|treasury|gdp|unemployment)\b/i;

function tierFor(text) {
  if (HIGH.test(text)) return 'high';
  if (MED.test(text)) return 'medium';
  return 'low';
}

function tagFor(text) {
  if (/\bfed|fomc|rate|central bank\b/i.test(text)) return 'Fed';
  if (/\bearnings|revenue|guidance\b/i.test(text)) return 'Earnings';
  if (/\bmerger|acquisition|deal\b/i.test(text)) return 'M&A';
  if (/\boil|opec|energy|gas\b/i.test(text)) return 'Energy';
  if (/\bbitcoin|crypto|ethereum\b/i.test(text)) return 'Crypto';
  if (/\bwar|election|geopolit|tariff\b/i.test(text)) return 'Geopolitics';
  return 'Markets';
}

function hhmm(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return d.toISOString().slice(11, 16); // HH:MM in UTC; the app localises display separately
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.FINNHUB_KEY;
  if (!key) return res.status(500).json({ error: 'FINNHUB_KEY is not set on the server.' });

  const region = (req.query.region || 'all').toString();
  const category = categoryFor(region);

  const hit = cache.get(category);
  if (hit && hit.exp > Date.now()) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ items: hit.items, asOf: Date.now(), cached: true });
  }

  try {
    const r = await fetch(`${NEWS}?category=${category}&token=${key}`, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`finnhub ${r.status}`);
    const raw = await r.json();
    const items = (Array.isArray(raw) ? raw : [])
      .filter((n) => n && n.headline && n.url)
      .slice(0, 40)
      .map((n) => {
        const blob = `${n.headline} ${n.summary || ''}`;
        return {
          time: hhmm(n.datetime),
          impact: tierFor(blob),
          title: String(n.headline).slice(0, 180),
          summary: String(n.summary || '').slice(0, 300),
          source: String(n.source || 'Finnhub').slice(0, 40),
          url: String(n.url),
          tag: tagFor(blob),
        };
      });
    cache.set(category, { items, exp: Date.now() + TTL_MS });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ items, asOf: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream news provider failed. Try again shortly.' });
  }
}
