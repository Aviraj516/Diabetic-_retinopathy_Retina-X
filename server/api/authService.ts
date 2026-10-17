import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

export const authRouter = Router();

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (
    !url ||
    !serviceRoleKey ||
    url.includes('placeholder') ||
    serviceRoleKey.includes('PASTE_YOUR') ||
    serviceRoleKey.includes('placeholder')
  ) {
    return null;
  }

  try {
    return createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch {
    return null;
  }
}

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Email or User ID is required.' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const trimmedInput = identifier.trim().toLowerCase();
    const inputPass = password.trim();
    const supabaseAdmin = getSupabaseAdmin();

    const anonUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

    if (!anonUrl || !anonKey) {
      return res.status(503).json({
        success: false,
        error: 'Authentication database service unavailable.',
      });
    }

    // 1. Resolve identifier to an email
    let targetEmail = trimmedInput;
    if (!targetEmail.includes('@')) {
      if (supabaseAdmin) {
        // Look up by username or ID in profiles
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .or(`email.ilike.${trimmedInput}@%,id.eq.${trimmedInput},full_name.ilike.${trimmedInput}`)
          .maybeSingle();

        const profileRecord = profile as { email?: string } | null;
        if (profileRecord?.email) {
          targetEmail = profileRecord.email.toLowerCase();
        } else {
          targetEmail = `${trimmedInput}@gmail.com`;
        }
      } else {
        targetEmail = `${trimmedInput}@gmail.com`;
      }
    }

    // 2. Perform real database authentication via Supabase Auth bcrypt password hash verification
    const authClient = createClient(anonUrl, anonKey);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: targetEmail,
      password: inputPass,
    });

    if (authError || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/user ID or password.',
      });
    }

    // 3. Generate secure magic link token for client-side session creation if admin key available
    if (supabaseAdmin) {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: targetEmail,
      });

      if (!linkErr && linkData?.properties?.hashed_token) {
        return res.json({
          success: true,
          email: targetEmail,
          token_hash: linkData.properties.hashed_token,
          session: authData.session,
        });
      }
    }

    return res.json({
      success: true,
      email: targetEmail,
      session: authData.session,
    });
  } catch (err: any) {
    console.error('[Auth Service Exception]', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during authentication. Please try again.',
    });
  }
});
