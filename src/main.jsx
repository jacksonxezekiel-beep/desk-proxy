import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './DeskApp_1.jsx';

const root = createRoot(document.getElementById('root'));

// Shown to the public when the site is switched OFF (SITE_PUBLIC="off").
function ComingSoon() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#07080C', color: '#E9ECF3', fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 22px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#F2C572,#D99A2B)', color: '#120C02', fontWeight: 800, fontSize: 26 }}>▲</div>
        <div style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 800, fontSize: 34, letterSpacing: '-.02em' }}>THE DESK</div>
        <div style={{ color: '#E8B04B', fontFamily: 'monospace', fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', marginTop: 10 }}>Launching soon</div>
        <p style={{ color: '#8A93A5', maxWidth: 420, margin: '18px auto 0', fontSize: 15, lineHeight: 1.6 }}>Your trading command center is getting its finishing touches. Check back shortly.</p>
      </div>
    </div>
  );
}

// Decide what to render: the full app, or the "coming soon" page.
// The owner unlocks the full app anytime by visiting  /?key=YOUR_OWNER_KEY  once.
async function boot() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('key')) localStorage.setItem('desk_owner_key', p.get('key'));
    if (p.has('logout')) localStorage.removeItem('desk_owner_key');
  } catch (e) {}

  let show = true; // fail-open: a config hiccup must never black out the site
  try {
    let key = '';
    try { key = localStorage.getItem('desk_owner_key') || ''; } catch (e) {}
    const r = await fetch('/api/config?key=' + encodeURIComponent(key));
    if (r.ok) { const j = await r.json(); show = (j.public !== false) || j.owner === true; }
  } catch (e) { show = true; }

  root.render(show
    ? <React.StrictMode><App /></React.StrictMode>
    : <ComingSoon />);
}
boot();
