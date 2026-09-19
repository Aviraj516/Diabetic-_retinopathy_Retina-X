import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve Supabase environment variables statically for Vite client bundles,
// with graceful fallback for Node.js / CLI execution
export const supabaseUrl = (
  (typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_URL as string) : '') ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') ||
  ''
).trim();

export const supabaseAnonKey = (
  (typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_ANON_KEY as string) : '') ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') ||
  ''
).trim();

/**
 * Returns true if valid Supabase URL and anon key have been configured.
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseAnonKey.includes('placeholder') &&
    !supabaseAnonKey.includes('PASTE_YOUR')
  );
};

if (!isSupabaseConfigured()) {
  console.error(
    '[RETINA-X Configuration Error] Missing or invalid VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'
  );
}

/**
 * Single canonical Supabase client instance for RETINA-X.
 * Configured with persistent local sessions and automatic token refresh.
 *
 * SECURITY NOTE:
 * Uses ONLY the public anon key (safe for browser client-side code).
 * Never import or use the service_role key in frontend code.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'retinax_supabase_auth_token',
    },
  }
);
