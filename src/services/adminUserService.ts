import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserAccount, UserRole } from '../types';

export interface CreateAdminUserPayload {
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  password?: string;
  status?: 'Active' | 'Inactive';
}

export interface CreateAdminUserResult {
  success: boolean;
  user?: UserAccount;
  error?: string;
  code?: string;
}

/**
 * Creates a new system user securely via the privileged server-side endpoint.
 *
 * Security guarantees:
 * - Uses the caller's active Supabase session token (Bearer token).
 * - Never requires or exposes the service_role key to the browser.
 * - Authenticates that the caller possesses the ADMIN role before creation.
 * - Creates user in auth.users and public.profiles with identical UUID.
 * - Automatically rolls back auth.users if profile insertion fails.
 */
export async function createAdminUser(
  payload: CreateAdminUserPayload
): Promise<CreateAdminUserResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase is not configured. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      return {
        success: false,
        error: 'Active administrator session required. Please log in again.',
      };
    }

    const token = sessionData.session.access_token;

    // 1. Primary path: Full-Stack application endpoint
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          password: payload.password,
          status: payload.status || 'Active',
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        return {
          success: true,
          user: data.user,
        };
      }

      // If the response is not a 404, the server handled the request and returned an error
      if (response.status !== 404 && data?.error) {
        return {
          success: false,
          error: data.error,
          code: data.code,
        };
      }
    } catch (networkErr: any) {
      console.warn('[AdminUserService] Local API route unreachable, attempting Edge Function fallback...', networkErr);
    }

    // 2. Secondary fallback: Supabase Edge Function (if deployed directly to Supabase)
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-user', {
        body: {
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          password: payload.password,
          status: payload.status || 'Active',
        },
      });

      if (!edgeError && edgeData?.success) {
        return {
          success: true,
          user: edgeData.user,
        };
      }

      if (edgeError || edgeData?.error) {
        const errorMsg = edgeData?.error || edgeError?.message || 'Failed to create user.';
        return {
          success: false,
          error: errorMsg,
        };
      }
    } catch {
      // Both routes failed
    }

    return {
      success: false,
      error:
        'Unable to reach the administrative user creation service. Please ensure the backend server or create-user Edge Function is running.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error while creating user.',
    };
  }
}

/**
 * Fetches all registered system users from Supabase public.profiles.
 */
export async function fetchAdminUsers(): Promise<{ success: boolean; users?: UserAccount[]; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    // Try backend API first
    if (token) {
      try {
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.users)) {
            return { success: true, users: data.users };
          }
        }
      } catch {
        // Fallback to client query
      }
    }

    // Fallback: Direct query on public.profiles using client session
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const formatted: UserAccount[] = (profiles || []).map((p) => {
      const rawRole = String(p.role || 'nurse').toLowerCase() as UserRole;
      let title = 'Ophthalmologist';
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

    return { success: true, users: formatted };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch users' };
  }
}

/**
 * Updates a user's status in Supabase public.profiles.
 */
export async function updateAdminUserStatus(
  userId: string,
  newStatus: 'Active' | 'Inactive'
): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (token) {
      try {
        const res = await fetch(`/api/admin/users/${userId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) return true;
      } catch {
        // Fallback to direct client update
      }
    }

    const dbStatus = newStatus === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
    const { error } = await supabase
      .from('profiles')
      .update({ status: dbStatus })
      .eq('id', userId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Permanently deletes a user and associated application records.
 * Invokes the secure server-side DELETE /api/admin/users/:id endpoint.
 */
export async function deleteAdminUser(
  userId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    let { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData?.session?.access_token;

    // If no access token in memory/storage, attempt session refresh
    if (!token) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      token = refreshData?.session?.access_token;
    }

    if (!token) {
      return {
        success: false,
        error: 'Authentication session expired. Please log in again to delete users.',
      };
    }

    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId.trim())}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || `Failed to delete user (${res.status})`,
      };
    }

    return {
      success: true,
      message: data.message || 'User permanently deleted successfully.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while contacting user deletion service.',
    };
  }
}

