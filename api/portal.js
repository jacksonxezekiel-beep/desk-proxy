// api/portal.js — opens Stripe's Billing Portal so a subscriber can update their
// card, view invoices, or cancel. Returns a URL the app redirects to.
// Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL (optional)

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Billing is not set up yet.' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData || !userData.user) return res.status(401).json({ error: 'Session invalid.' });

  const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userData.user.id).maybeSingle();
  if (!sub || !sub.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet.' });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const origin = process.env.APP_URL || `https://${req.headers.host}`;
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: origin });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
