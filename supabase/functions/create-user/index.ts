// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code runs in Supabase Edge Functions environment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing or invalid Authorization header.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Verify caller session
    const {
      data: { user: callerUser },
      error: callerError,
    } = await supabaseAdmin.auth.getUser(token);

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: Invalid or expired admin session token.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Verify caller has ADMIN role from public.profiles
    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', callerUser.id)
      .maybeSingle();

    const callerRole = String(
      profileRow?.role ||
      callerUser.user_metadata?.role ||
      (callerUser.email?.toLowerCase().includes('admin') ? 'ADMIN' : '')
    ).toUpperCase();

    if (callerRole !== 'ADMIN') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Only users with the ADMIN role can provision system users.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Parse and validate body
    const body = await req.json().catch(() => ({}));
    const { fullName, email, phone, role, password, status } = body;

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Full name is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const rawRole = String(role || 'nurse').trim().toUpperCase();
    const allowedRoles = ['ADMIN', 'NURSE', 'SPECIALIST'];
    if (!allowedRoles.includes(rawRole)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid role. Allowed roles: Admin, Nurse, Specialist.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const initialPassword =
      typeof password === 'string' && password.trim().length > 0 ? password.trim() : 'password';

    if (initialPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 6 characters long.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .ilike('email', trimmedEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `A user account with email "${trimmedEmail}" already exists in the system.`,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Create user in Supabase Authentication (auth.users)
    const { data: createdAuth, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        name: fullName.trim(),
        phone: phone ? String(phone).trim() : '',
        role: rawRole,
        status: status || 'Active',
      },
    });

    if (authError || !createdAuth?.user) {
      const msg = authError?.message || 'Failed to create authentication user.';
      const isDuplicate = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');
      return new Response(
        JSON.stringify({
          success: false,
          error: isDuplicate
            ? `A user with email "${trimmedEmail}" already exists in Supabase Authentication.`
            : msg,
        }),
        { status: isDuplicate ? 409 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newUserId = createdAuth.user.id;

    // 5. Create corresponding record in public.profiles with SAME UUID
    const newProfileRecord = {
      id: newUserId,
      full_name: fullName.trim(),
      email: trimmedEmail,
      phone: phone ? String(phone).trim() : null,
      role: rawRole,
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      created_at: new Date().toISOString(),
    };

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert([newProfileRecord]);

    if (profileInsertError) {
      // Roll back created auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch (rollbackErr) {
        console.error('Failed to rollback auth.users after profile insertion error:', rollbackErr);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create profile record in public.profiles: ${profileInsertError.message}. Authentication account was safely rolled back.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let title = 'Primary Healthcare Worker';
    if (rawRole === 'ADMIN') title = 'Hospital System Administrator';
    if (rawRole === 'SPECIALIST') title = 'Consultant Ophthalmologist';

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          name: fullName.trim(),
          email: trimmedEmail,
          role: rawRole.toLowerCase(),
          title,
          phone: phone ? String(phone).trim() : '',
          status: status === 'Inactive' ? 'Inactive' : 'Active',
          createdAt: new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          avatarLetter: fullName.trim().charAt(0).toUpperCase() || 'U',
        },
        message: `User account for ${fullName.trim()} created successfully!`,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
