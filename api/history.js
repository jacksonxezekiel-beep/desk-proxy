// api/history.js — Vercel serverless function
// Accurate price + period returns for a ticker, so the Research tab never shows
// "n/a" for day/week/month/YTD/1y/5y. Real sources:
//   - live price + previous close: Finnhub (same key as /api/quotes)
//   - daily history for week..5y: Yahoo Finance chart API, falling back to Stooq CSV
//     (both keyless). A browser User-Agent is sent because some hosts block the
//     default serverless agent.
//
// Request:  GET /api/history?symbol=AAPL
// Response: { symbol, price, prevClose, asOf, source, returns: { day, week, month, ytd, year1, year5 } }

const FINNHUB = 'https://finnhub.io/api/v1/quote';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cleanSymbol(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9.^-]/g, '').slice(0, 12);
}
const pct = (from, to) => (from > 0 && to > 0) ? ((to - from) / from) * 100 : null;
const fmtPct = (v) => v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(v <= -10 || v >= 100 ? 0 : 1) + '%';

// Daily closes, ascending by date, as [{date:'YYYY-MM-DD', close:Number}].
async function yahooHistory(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6y&interval=1d`;
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) return null;
    const ts = res.timestamp;
    const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    const rows = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
      .filter(x => Number.isFinite(x.close));
    return rows.length > 5 ? rows : null;
  } catch (_) { return null; }
}
async function stooqHistory(symbol) {
  const bases = [symbol.toLowerCase(), symbol.toLowerCase() + '.us'];
  for (const s of bases) {
    try {
      const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`, { headers: { 'User-Agent': UA, 'Accept': 'text/csv' } });
      if (!r.ok) continue;
      const text = await r.text();
      if (!/^Date,/i.test(text)) continue;
      const rows = text.trim().split('\n').slice(1)
        .map(line => { const c = line.split(','); return { date: c[0], close: parseFloat(c[4]) }; })
        .filter(x => x.date && Number.isFinite(x.close));
      if (rows.length > 5) return rows;
    } catch (_) {}
  }
  return null;
}

function closeOnOrBefore(rows, targetISO) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].date <= targetISO) return rows[i].close;
  return null;
}
const shiftDays = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return res.status(400).json({ error: 'Pass ?symbol=AAPL' });

  // 1) live price + previous close from Finnhub (for the day move)
  let price = null, prevClose = null, at = '';
  const key = process.env.FINNHUB_KEY;
  if (key) {
    try {
      const r = await fetch(`${FINNHUB}?symbol=${encodeURIComponent(symbol)}&token=${key}`);
      if (r.ok) {
        const j = await r.json();
        if (j && Number(j.c) > 0) { price = Number(j.c); prevClose = Number(j.pc) > 0 ? Number(j.pc) : null; if (j.t) at = new Date(j.t * 1000).toISOString(); }
      }
    } catch (_) {}
  }

  // 2) daily history: Yahoo first, then Stooq
  let source = 'yahoo';
  let rows = await yahooHistory(symbol);
  if (!rows) { rows = await stooqHistory(symbol); source = rows ? 'stooq' : 'none'; }

  const ret = { day: 'n/a', week: 'n/a', month: 'n/a', ytd: 'n/a', year1: 'n/a', year5: 'n/a' };
  if (price && prevClose) ret.day = fmtPct(pct(prevClose, price));

  if (rows && rows.length) {
    const last = rows[rows.length - 1];
    const latest = price || last.close;
    const lastISO = last.date;
    if (ret.day === 'n/a' && rows.length >= 2) ret.day = fmtPct(pct(rows[rows.length - 2].close, latest));
    ret.week = fmtPct(pct(closeOnOrBefore(rows, shiftDays(lastISO, 7)), latest));
    ret.month = fmtPct(pct(closeOnOrBefore(rows, shiftDays(lastISO, 30)), latest));
    ret.year1 = fmtPct(pct(closeOnOrBefore(rows, shiftDays(lastISO, 365)), latest));
    ret.year5 = fmtPct(pct(closeOnOrBefore(rows, shiftDays(lastISO, 365 * 5)), latest));
    const yr = new Date(lastISO + 'T00:00:00Z').getUTCFullYear();
    ret.ytd = fmtPct(pct(closeOnOrBefore(rows, (yr - 1) + '-12-31'), latest));
    if (!price) price = last.close;
  }

  // Cache only real results; don't cache an all-n/a miss for long.
  const good = ret.week !== 'n/a' || (price && prevClose);
  res.setHeader('Cache-Control', good ? 's-maxage=300, stale-while-revalidate=600' : 's-maxage=10');
  return res.status(200).json({ symbol, price, prevClose, asOf: at || Date.now(), source, returns: ret });
}
