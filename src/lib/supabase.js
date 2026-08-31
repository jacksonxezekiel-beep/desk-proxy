import { createClient } from '@supabase/supabase-js';

// These are PUBLIC values (safe in the browser). Set them in Vercel as:
//   VITE_SUPABASE_URL       = https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY  = eyJ...   (the "anon public" key)
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseReady = !!(url && anon);
export const supabase = supabaseReady ? createClient(url, anon) : null;
