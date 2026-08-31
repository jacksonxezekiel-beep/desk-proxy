import React, { useState, useEffect } from 'react';
import { supabase, supabaseReady } from './lib/supabase.js';

/* ============================================================================
   The Gate decides what a visitor sees, in this order:
     1. Site switched OFF + not the owner        -> "Launching soon"
     2. Owner preview (?key=OWNER_KEY)            -> full app (bypasses login)
     3. Not logged in                             -> Login / Sign up
     4. Logged in, no active/trial subscription   -> Paywall (start trial)
     5. Logged in + trialing/active               -> full app
   The 246 KB trading app (App) is never touched - it only mounts once access
   is granted, so all of this lives outside it.
   ========================================================================== */

const C = {
  bg: '#07080C', panel: '#101319', line: '#20242F', line2: '#2C3341',
  ink: '#E9ECF3', mut: '#8A93A5', gold: '#E8B04B', up: '#2FD483', dn: '#F45B69',
  ui: 'Inter, system-ui, sans-serif', disp: 'Archivo, sans-serif', mono: 'IBM Plex Mono, monospace',
};
const center = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg, color: C.ink, fontFamily: C.ui, padding: 24 };
const card = { width: '100%', maxWidth: 400, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: '28px 26px', boxShadow: '0 30px 70px -30px rgba(0,0,0,.8)' };
const mk = { width: 52, height: 52, borderRadius: 13, margin: '0 auto 16px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#F2C572,#D99A2B)', color: '#120C02', fontWeight: 800, fontSize: 22 };
const label = { fontFamily: C.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mut, display: 'block', margin: '14px 0 6px' };
const input = { width: '100%', background: '#0B0D12', border: `1px solid ${C.line2}`, borderRadius: 9, padding: '11px 13px', color: C.ink, fontSize: 14, fontFamily: C.ui, outline: 'none' };
const btnP = { width: '100%', marginTop: 18, padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#F2C572,#D99A2B)', color: '#150E02', fontWeight: 700, fontSize: 14, fontFamily: C.ui };
const link = { color: C.gold, cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', fontSize: 13, fontFamily: C.ui };

function Brand({ sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 6 }}>
      <div style={mk}>▲</div>
      <div style={{ fontFamily: C.disp, fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>THE DESK</div>
      {sub && <div style={{ color: C.gold, fontFamily: C.mono, fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function Loading() {
  return <div style={center}><div style={{ color: C.mut, fontFamily: C.mono, fontSize: 13 }}>Loading…</div></div>;
}

function ComingSoon() {
  return (
    <div style={center}><div style={{ textAlign: 'center' }}>
      <div style={mk}>▲</div>
      <div style={{ fontFamily: C.disp, fontWeight: 800, fontSize: 34, letterSpacing: '-.02em' }}>THE DESK</div>
      <div style={{ color: C.gold, fontFamily: C.mono, fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', marginTop: 10 }}>Launching soon</div>
      <p style={{ color: C.mut, maxWidth: 420, margin: '18px auto 0', fontSize: 15, lineHeight: 1.6 }}>Your trading command center is getting its finishing touches. Check back shortly.</p>
    </div></div>
  );
}

// Shown only if the app is deployed before the Supabase keys are set.
function NotConfigured() {
  return (
    <div style={center}><div style={card}>
      <Brand sub="Setup pending" />
      <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, marginTop: 12, textAlign: 'center' }}>
        Accounts aren't switched on yet. Add the Supabase keys (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) in Vercel and redeploy.
      </p>
    </div></div>
  );
}

function Auth() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setMsg('Account created. If asked, check your email to confirm, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        // onAuthStateChange in the Gate will take over from here.
      }
    } catch (e2) { setErr(e2.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={center}><div style={card}>
      <Brand sub={mode === 'signup' ? 'Create your account' : 'Welcome back'} />
      <form onSubmit={submit}>
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        <label style={label}>Password</label>
        <input style={input} type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" minLength={6} required />
        {err && <div style={{ color: C.dn, fontSize: 13, marginTop: 12 }}>{err}</div>}
        {msg && <div style={{ color: C.up, fontSize: 13, marginTop: 12 }}>{msg}</div>}
        <button style={{ ...btnP, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16, color: C.mut, fontSize: 13 }}>
        {mode === 'signup'
          ? <>Already have an account? <button style={link} onClick={() => { setMode('signin'); setErr(''); }}>Sign in</button></>
          : <>New here? <button style={link} onClick={() => { setMode('signup'); setErr(''); }}>Create an account</button></>}
      </div>
    </div></div>
  );
}

function Paywall({ session, onSignOut }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const checkout = async (plan) => {
    setErr(''); setBusy(plan);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ plan }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || 'Could not start checkout.');
      window.location.href = j.url; // Stripe-hosted checkout
    } catch (e) { setErr(e.message); setBusy(''); }
  };

  const plan = (id, name, price, per, note, best) => (
    <button onClick={() => checkout(id)} disabled={!!busy}
      style={{ textAlign: 'left', background: '#0B0D12', border: `1px solid ${best ? 'rgba(232,176,75,.5)' : C.line2}`, borderRadius: 12, padding: '16px 18px', cursor: 'pointer', color: C.ink, position: 'relative' }}>
      {best && <span style={{ position: 'absolute', top: -9, right: 14, background: C.gold, color: '#150E02', fontFamily: C.mono, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>Best value</span>}
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mut }}>{name}</div>
      <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 600, marginTop: 4 }}>{price}<span style={{ fontSize: 13, color: C.mut }}> {per}</span></div>
      <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>{note}</div>
      <div style={{ marginTop: 10, color: C.gold, fontFamily: C.mono, fontSize: 11 }}>{busy === id ? 'Starting…' : 'Start 7-day free trial →'}</div>
    </button>
  );

  return (
    <div style={center}><div style={{ ...card, maxWidth: 460 }}>
      <Brand sub="Choose your plan" />
      <p style={{ color: C.mut, fontSize: 13.5, textAlign: 'center', margin: '4px 0 18px' }}>7 days free, then it's yours. Cancel anytime.</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {plan('monthly', 'Monthly', '$19.99', '/mo', 'Full access, billed monthly.', false)}
        {plan('yearly', 'Yearly', '$199.99', '/yr', 'Two months free vs monthly.', true)}
      </div>
      {err && <div style={{ color: C.dn, fontSize: 13, marginTop: 14, textAlign: 'center' }}>{err}</div>}
      <div style={{ textAlign: 'center', marginTop: 18, color: C.mut, fontSize: 12.5 }}>
        Signed in as {session.user.email} · <button style={link} onClick={onSignOut}>Sign out</button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, color: '#5B6270', fontSize: 11, lineHeight: 1.5 }}>
        Payments are handled securely by Stripe. Market data is informational, not financial advice.
      </div>
    </div></div>
  );
}

export default function Gate({ children }) {
  const [phase, setPhase] = useState('loading'); // loading | comingsoon | notconfigured | auth | paywall | app
  const [session, setSession] = useState(null);

  // owner sign-out helper passed to the paywall
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setSession(null); setPhase('auth'); };

  // 1) resolve on/off + owner, then hand off to auth
  useEffect(() => {
    let alive = true;
    (async () => {
      // capture / clear owner key from URL
      try {
        const p = new URLSearchParams(location.search);
        if (p.get('key')) localStorage.setItem('desk_owner_key', p.get('key'));
        if (p.has('logout')) localStorage.removeItem('desk_owner_key');
      } catch (e) {}
      let isPublic = true, owner = false;
      try {
        let key = '';
        try { key = localStorage.getItem('desk_owner_key') || ''; } catch (e) {}
        const r = await fetch('/api/config?key=' + encodeURIComponent(key));
        if (r.ok) { const j = await r.json(); isPublic = j.public !== false; owner = j.owner === true; }
      } catch (e) {}
      if (!alive) return;
      if (owner) { setPhase('app'); return; }          // owner always gets in
      if (!isPublic) { setPhase('comingsoon'); return; }
      if (!supabaseReady) { setPhase('notconfigured'); return; }
      // 2) auth state
      const { data } = await supabase.auth.getSession();
      handleSession(data && data.session);
      supabase.auth.onAuthStateChange((_e, s) => handleSession(s));
    })();
    return () => { alive = false; };
  }, []);

  async function handleSession(s) {
    setSession(s || null);
    if (!s) { setPhase('auth'); return; }
    // 3) subscription check — read the user's row (RLS lets them read their own)
    try {
      const { data } = await supabase.from('subscriptions').select('status').eq('user_id', s.user.id).maybeSingle();
      const ok = data && ['trialing', 'active', 'past_due'].includes(data.status);
      setPhase(ok ? 'app' : 'paywall');
    } catch (e) { setPhase('paywall'); }
  }

  if (phase === 'loading') return <Loading />;
  if (phase === 'comingsoon') return <ComingSoon />;
  if (phase === 'notconfigured') return <NotConfigured />;
  if (phase === 'auth') return <Auth />;
  if (phase === 'paywall') return <Paywall session={session} onSignOut={signOut} />;
  return children; // 'app'
}
