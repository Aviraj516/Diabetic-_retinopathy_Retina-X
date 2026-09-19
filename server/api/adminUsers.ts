import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const adminUserRouter = express.Router();

// Helper to get administrative Supabase client using server-side service role key
function getSupabaseAdminClient(): { client?: SupabaseClient; error?: string } {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();

  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();

  if (!supabaseUrl) {
    return { error: 'SUPABASE_URL (or VITE_SUPABASE_URL) is not configured on the server.' };
  }

  if (!serviceRoleKey) {
    return {
      error:
        'SUPABASE_SERVICE_ROLE_KEY environment variable is missing on the server. Please add your Supabase Service Role Key to the server environment variables.',
    };
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { client };
}

// Helper to authenticate request and verify that the caller is a RETINA-X Admin
async function authenticateAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<{ error?: { status: number; message: string }; userId?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: {
        status: 401,
        message: 'Authorization header with Bearer token is required.',
      },
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      error: {
        status: 401,
        message: 'Empty authentication token provided.',
      },
    };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      error: {
        status: 401,
        message: 'Invalid or expired authentication session. Please log in again.',
      },
    };
  }

  const callerUser = userData.user;

  // Verify Admin role in public.profiles first, then fallback to user_metadata
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status')
    .eq('id', callerUser.id)
    .maybeSingle();

  const callerRole = String(
    profileRow?.role ||
    callerUser.user_metadata?.role ||
    ''
  ).toUpperCase();

  if (callerRole !== 'ADMIN') {
    return {
      error: {
        status: 403,
        message: 'Access Denied: Only users with the ADMIN role can perform this operation.',
      },
    };
  }

  return { userId: callerUser.id };
}

/**
 * POST /api/admin/create-user
 * Secure administrative endpoint to provision a new user in Supabase:
 * 1. Verifies caller has valid session and ADMIN role.
 * 2. Creates user in auth.users via Supabase Admin API.
 * 3. Creates corresponding row in public.profiles using the exact same UUID.
 * 4. Rolls back auth.users if public.profiles insertion fails.
 */
adminUserRouter.post('/create-user', async (req: Request, res: Response) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || 'Supabase admin client initialization failed.',
        code: 'MISSING_SERVICE_ROLE_KEY',
      });
    }

    // Authenticate and authorize admin
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message,
      });
    }

    const { fullName, email, phone, role, password, status } = req.body || {};

    // Validate inputs
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide full name.',
      });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email / user ID.',
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.',
      });
    }

    const rawRole = String(role || 'nurse').trim().toUpperCase();
    const allowedRoles = ['ADMIN', 'NURSE', 'SPECIALIST'];
    if (!allowedRoles.includes(rawRole)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role specified. Allowed roles: Admin, Nurse, Specialist.',
      });
    }

    const initialPassword = (
      typeof password === 'string' && password.trim().length > 0 ? password.trim() : 'password'
    );

    if (initialPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.',
      });
    }

    // Check if user already exists in profiles table
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .ilike('email', trimmedEmail)
      .maybeSingle();

    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: `A user account with email "${trimmedEmail}" already exists in the system.`,
        code: 'USER_EXISTS',
      });
    }

    // Step A: Create user in Supabase Authentication (auth.users)
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
      const msg = authError?.message || 'Authentication user creation failed.';
      const isDuplicate =
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('exists') ||
        msg.toLowerCase().includes('unique');

      return res.status(isDuplicate ? 409 : 400).json({
        success: false,
        error: isDuplicate
          ? `A user with email "${trimmedEmail}" already exists in Supabase Authentication.`
          : msg,
        code: isDuplicate ? 'USER_EXISTS' : 'AUTH_CREATION_FAILED',
      });
    }

    const newUserId = createdAuth.user.id;

    // Step B: Create corresponding record in public.profiles using SAME UUID as auth.users.id
    const isInactive = String(status || '').toUpperCase() === 'INACTIVE' || status === 'Inactive';
    const newProfileRecord = {
      id: newUserId,
      full_name: fullName.trim(),
      email: trimmedEmail,
      phone: phone ? String(phone).trim() : null,
      role: rawRole,
      status: isInactive ? 'INACTIVE' : 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert([newProfileRecord]);

    if (profileInsertError) {
      // Step F: Safe rollback - delete newly created Auth user so no orphaned records exist
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch (rollbackErr) {
        console.error('Failed to rollback auth.users after profile insertion failure:', rollbackErr);
      }

      return res.status(500).json({
        success: false,
        error: `Failed to create user record in public.profiles: ${profileInsertError.message}. Authentication record was safely rolled back.`,
        code: 'PROFILE_CREATION_FAILED',
      });
    }

    let title = 'Primary Healthcare Worker';
    if (rawRole === 'ADMIN') title = 'Hospital System Administrator';
    if (rawRole === 'SPECIALIST') title = 'Consultant Ophthalmologist';

    return res.status(201).json({
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
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || 'Unknown error'}`,
    });
  }
});

/**
 * GET /api/admin/users
 * Returns list of system users from public.profiles for authenticated Admin.
 */
adminUserRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || 'Supabase admin client initialization failed.',
        code: 'MISSING_SERVICE_ROLE_KEY',
      });
    }

    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message,
      });
    }

    const { data: profiles, error: selectError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (selectError) {
      return res.status(500).json({
        success: false,
        error: `Failed to query profiles: ${selectError.message}`,
      });
    }

    const formattedUsers = (profiles || []).map((p) => {
      const rawRole = String(p.role || 'nurse').toLowerCase();
      let title = 'Primary Healthcare Worker';
      if (rawRole === 'admin') title = 'Hospital System Administrator';
      if (rawRole === 'specialist') title = 'Consultant Ophthalmologist';

      const name = p.full_name || p.email?.split('@')[0] || 'User';

      const isInactive = String(p.status || '').toUpperCase() === 'INACTIVE';
      return {
        id: p.id,
        name,
        email: p.email,
        role: rawRole,
        title,
        phone: p.phone || '',
        status: isInactive ? 'Inactive' : 'Active',
        createdAt: p.created_at
          ? new Date(p.created_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'Recent',
        avatarLetter: name.charAt(0).toUpperCase() || 'U',
      };
    });

    return res.json({ success: true, users: formattedUsers });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || 'Unknown error'}`,
    });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Updates user status in public.profiles.
 */
adminUserRouter.patch('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || 'Supabase admin client initialization failed.',
        code: 'MISSING_SERVICE_ROLE_KEY',
      });
    }

    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message,
      });
    }

    const { id } = req.params;
    const { status } = req.body || {};

    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be "Active" or "Inactive".',
      });
    }

    const dbStatus = status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ status: dbStatus })
      .eq('id', id);

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: `Failed to update user status: ${updateError.message}`,
      });
    }

    return res.json({ success: true, id, status });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || 'Unknown error'}`,
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Secure administrative endpoint to delete a user from RETINA-X:
 * 1. Verifies caller has valid session and ADMIN role.
 * 2. Prevents self-deletion by the requesting administrator.
 * 3. Cleans up any dependent database records across RETINA-X tables.
 * 4. Removes user from public.profiles.
 * 5. Permanently deletes the user from Supabase Auth (auth.users).
 */
adminUserRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || 'Supabase admin client initialization failed.',
        code: 'MISSING_SERVICE_ROLE_KEY',
      });
    }

    // 1. Authenticate and verify ADMIN role
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message,
      });
    }

    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Target user ID is required.',
      });
    }

    const trimmedId = id.trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmedId);

    // Fetch user from Auth safely without throwing on non-UUID
    let targetAuthUser: any = null;
    if (isUUID) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(trimmedId);
        if (!error && data) {
          targetAuthUser = data;
        }
      } catch (authErr) {
        console.warn('[Admin API] getUserById exception:', authErr);
      }
    }

    // Verify target user in Profiles (by UUID or email)
    let profileCheck: any = null;
    if (isUUID) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', trimmedId)
        .maybeSingle();
      profileCheck = data;
    } else {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('email', trimmedId.toLowerCase())
        .maybeSingle();
      profileCheck = data;
    }

    const targetUserId = profileCheck?.id || targetAuthUser?.user?.id || trimmedId;
    const targetEmail = (targetAuthUser?.user?.email || profileCheck?.email || '').toLowerCase();

    // 2. Prevent self-deletion by the requesting administrator
    if (
      authResult.userId?.toLowerCase() === targetUserId?.toLowerCase() ||
      authResult.userId?.toLowerCase() === trimmedId.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        error: 'You cannot delete your own account.',
      });
    }

    // 3. Verify target user exists in Auth or Profiles
    if (!targetAuthUser?.user && !profileCheck) {
      return res.status(404).json({
        success: false,
        error: 'User not found or has already been deleted.',
      });
    }

    // 5. Clean up all dependent records in proper reverse-dependency order using resolved UUID
    // A. Clean up screenings where user is nurse
    const { data: userScreenings } = await supabaseAdmin
      .from('screenings')
      .select('id')
      .eq('nurse_id', targetUserId);

    const screeningIds = (userScreenings || []).map((s: any) => s.id);
    if (screeningIds.length > 0) {
      await supabaseAdmin.from('screening_findings').delete().in('screening_id', screeningIds);
      await supabaseAdmin.from('screening_evidence').delete().in('screening_id', screeningIds);
      await supabaseAdmin.from('reports').delete().in('screening_id', screeningIds);
      await supabaseAdmin.from('specialist_reviews').delete().in('screening_id', screeningIds);
      await supabaseAdmin.from('referrals').delete().in('screening_id', screeningIds);
      await supabaseAdmin.from('screenings').delete().in('id', screeningIds);
    }

    // B. Clean up specialist reviews and referrals associated with this user
    await supabaseAdmin.from('specialist_reviews').delete().eq('specialist_id', targetUserId);
    await supabaseAdmin.from('referrals').delete().eq('specialist_id', targetUserId);
    await supabaseAdmin.from('referrals').delete().eq('nurse_id', targetUserId);
    await supabaseAdmin.from('reports').delete().eq('generated_by', targetUserId);

    // C. Clean up patients created by this user and their associated screenings
    const { data: userPatients } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('created_by', targetUserId);

    const patientIds = (userPatients || []).map((p: any) => p.id);
    if (patientIds.length > 0) {
      const { data: patientScreenings } = await supabaseAdmin
        .from('screenings')
        .select('id')
        .in('patient_id', patientIds);

      const pScreeningIds = (patientScreenings || []).map((s: any) => s.id);
      if (pScreeningIds.length > 0) {
        await supabaseAdmin.from('screening_findings').delete().in('screening_id', pScreeningIds);
        await supabaseAdmin.from('screening_evidence').delete().in('screening_id', pScreeningIds);
        await supabaseAdmin.from('reports').delete().in('screening_id', pScreeningIds);
        await supabaseAdmin.from('specialist_reviews').delete().in('screening_id', pScreeningIds);
        await supabaseAdmin.from('referrals').delete().in('screening_id', pScreeningIds);
        await supabaseAdmin.from('screenings').delete().in('id', pScreeningIds);
      }
      await supabaseAdmin.from('patients').delete().in('id', patientIds);
    }

    // 6. Delete from public.profiles
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', targetUserId);

    if (profileDeleteError) {
      console.error('[Delete User] Error deleting profile:', profileDeleteError);
    }

    // 7. Delete from auth.users using Supabase Admin API
    const authIdToDelete = targetAuthUser?.user?.id || (isUUID ? targetUserId : null);
    if (authIdToDelete) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authIdToDelete);
      if (authDeleteError && !authDeleteError.message?.toLowerCase().includes('not found')) {
        return res.status(500).json({
          success: false,
          error: `Failed to delete authentication user: ${authDeleteError.message}`,
        });
      }
    }

    return res.json({
      success: true,
      message: `User ${profileCheck?.full_name || targetEmail || targetUserId} and all associated records permanently deleted.`,
      deletedId: targetUserId,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || 'Unknown error'}`,
    });
  }
});
