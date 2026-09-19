import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

export interface SupabaseConnectionStatus {
  configured: boolean;
  connected: boolean;
  message: string;
  url?: string;
  error?: string;
}

/**
 * Tests connectivity between the RETINA-X frontend application and the Supabase backend.
 *
 * This performs a non-destructive session check and ping against the Supabase instance
 * using the configured VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return {
      configured: false,
      connected: false,
      message: 'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are not configured.',
    };
  }

  try {
    const url = supabaseUrl.replace(/\/+$/, '');
    const key = supabaseAnonKey;

    // Non-destructive auth session check
    const { error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      return {
        configured: true,
        connected: false,
        message: `Supabase session error: ${sessionError.message}`,
        error: sessionError.message,
      };
    }

    // Actual network ping to the Supabase Auth service
    const healthRes = await fetch(`${url}/auth/v1/health`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!healthRes.ok) {
      return {
        configured: true,
        connected: false,
        message: `Supabase Auth health check returned status ${healthRes.status}: ${healthRes.statusText}`,
        error: `HTTP ${healthRes.status} ${healthRes.statusText}`,
      };
    }

    return {
      configured: true,
      connected: true,
      message: 'Successfully connected to Supabase project.',
      url,
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      message: `Failed to reach Supabase backend: ${err?.message || 'Unknown network error'}`,
      error: err?.message,
    };
  }
}

// Expose the shared client through the service layer
export { supabase, isSupabaseConfigured };
