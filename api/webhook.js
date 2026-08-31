// api/webhook.js — Stripe tells us when a subscription starts, renews, or ends.
// We verify the signature and mirror the status into Supabase so the app knows
// who has access. Point a Stripe webhook at  /api/webhook  and copy its signing
// secret into STRIPE_WEBHOOK_SECRET.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Stripe needs the raw body to verify the signature, so disable Vercel's parser.
export const config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).end('not configured');
  }
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).end(`Webhook signature failed: ${e.message}`);
  }

  try {
    const t = event.type;
    if (t === 'customer.subscription.created' || t === 'customer.subscription.updated' || t === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = (sub.metadata && sub.metadata.user_id) || null;
      const patch = {
        stripe_customer_id: sub.customer,
        stripe_subscription_id: sub.id,
        status: t === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      };
      if (userId) await admin.from('subscriptions').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
      else await admin.from('subscriptions').update(patch).eq('stripe_customer_id', sub.customer);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).end(e.message);
  }
}
