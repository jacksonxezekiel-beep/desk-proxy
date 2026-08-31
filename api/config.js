// api/config.js — Vercel serverless function
// Tells the app whether the site is public, and whether this visitor is the owner
// (so you can preview the full site while it's switched off to everyone else).
//
// Controlled by two environment variables in Vercel:
//   SITE_PUBLIC  = "on"  -> everyone sees the app   (default)
//                  "off" -> public sees "coming soon"; only the owner sees the app
//   OWNER_KEY    = your secret preview key. Visit  /?key=YOUR_KEY  once to unlock
//                  owner preview on your device.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const isPublic = (process.env.SITE_PUBLIC || 'on').toLowerCase() !== 'off';
  const owner = !!(process.env.OWNER_KEY && req.query.key && String(req.query.key) === process.env.OWNER_KEY);
  return res.status(200).json({ public: isPublic, owner });
}
