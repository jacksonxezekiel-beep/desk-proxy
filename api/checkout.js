// api/checkout.js — starts a Stripe Checkout for a 7-day free trial subscription.
// The browser sends the logged-in user's Supabase token; we verify it, find or
// create their Stripe customer, and return a Stripe-hosted checkout URL.
//
// Env vars needed:
//   STRIPE_SECRET_KEY        sk_...   (from Stripe -> Developers -> API keys)
//   STRIPE_PRICE_MONTHLY     price_...(the $19.99/mo recurring price id)
//   STRIPE_PRICE_YEARLY      price_...(the $199.99/yr recurring price id)
//   SUPABASE_URL             https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  (server-only secret; Supabase -> Settings -> API)
//   APP_URL                  https://your-domain (defaults to the request origin)

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Payments are not set up yet (missing Stripe/Supabase keys).' });
  }

  // 1) identify the user from their Supabase access token
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !userData || !userData.user) return res.status(401).json({ error: 'Session invalid — sign in again.' });
  const user = userData.user;

  const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  const price = body.plan === 'yearly' ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
  if (!price) return res.status(503).json({ error: 'Plan price not configured yet.' });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const origin = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    // reuse a Stripe customer if we stored one, else create
    let customer;
    const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (sub && sub.stripe_customer_id) customer = sub.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customer, status: 'none' }, { onConflict: 'user_id' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_period_days: 7, metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Checkout failed.' });
  }
}
