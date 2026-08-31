// api/ai.js — Vercel serverless function
// Secure proxy for the app's AI features (Research, market-impact, calendar).
// The browser POSTs a Messages API body here; this function adds the SERVER-SIDE
// Anthropic key + headers and forwards to Anthropic, then returns the raw JSON.
// The API key is never exposed to the browser.
//
// Env vars:
//   ANTHROPIC_API_KEY  (required)  your key from console.anthropic.com
//   ANTHROPIC_MODEL    (optional)  model id; defaults below. If you ever see a
//                                  "model not found" error, set this to a model
//                                  your account can use (e.g. claude-sonnet-4-5).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Friendly, actionable message the app surfaces in its AI tabs.
    return res.status(503).json({
      error: 'AI features are not set up yet. Add an ANTHROPIC_API_KEY environment variable in your Vercel project settings, then redeploy.',
      setup: true,
    });
  }

  // Vercel parses JSON bodies automatically; fall back to manual parse just in case.
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch (_) { body = {}; }
  }

  // Only forward the fields the Messages API expects. The model is forced to a
  // known-good value on the server so a stale client model id can't break calls.
  const payload = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 1024, 4096),
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  if (body.system) payload.system = body.system;
  if (Array.isArray(body.tools)) payload.tools = body.tools;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    // Pass Anthropic's status through so the client's retry/backoff logic still works.
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: { message: 'Could not reach the AI service. Try again shortly.' } });
  }
}
