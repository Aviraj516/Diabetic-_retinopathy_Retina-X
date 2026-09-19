import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const patientRouter = express.Router();

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
    return { error: 'SUPABASE_URL is not configured on the server.' };
  }

  if (!serviceRoleKey) {
    return {
      error: 'SUPABASE_SERVICE_ROLE_KEY environment variable is missing on the server.',
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

// Helper to authenticate caller and return authenticated user and profile
interface AuthResult {
  error?: { status: number; message: string };
  user?: {
    id: string;
    email?: string;
    role: 'ADMIN' | 'NURSE' | 'SPECIALIST';
  };
}

async function authenticateCaller(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<AuthResult> {
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

  // Retrieve trusted role from public.profiles
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status, email')
    .eq('id', callerUser.id)
    .maybeSingle();

  const rawRole = String(
    profileRow?.role ||
    callerUser.user_metadata?.role ||
    ''
  ).toUpperCase();

  const role: 'ADMIN' | 'NURSE' | 'SPECIALIST' =
    rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'SPECIALIST' ? 'SPECIALIST' : 'NURSE';

  return {
    user: {
      id: callerUser.id,
      email: callerUser.email,
      role,
    },
  };
}

/**
 * DELETE /api/patients/:id
 * Permanently deletes a patient and ALL associated records:
 * - screenings
 * - screening_findings
 * - screening_evidence
 * - referrals
 * - specialist_reviews
 * - reports
 *
 * Authorization rules:
 * - ADMIN: Global deletion authority across all patients.
 * - NURSE: Authorized to delete patients they created/manage.
 * - SPECIALIST: Not authorized to delete patients (403 Forbidden).
 */
patientRouter.delete('/:id', async (req: Request, res: Response) => {
  const patientParamId = req.params.id?.trim();
  if (!patientParamId) {
    return res.status(400).json({
      success: false,
      error: 'Patient identifier is required.',
    });
  }

  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || 'Database configuration error.',
    });
  }

  const auth = await authenticateCaller(req, supabaseAdmin);
  if (auth.error || !auth.user) {
    return res.status(auth.error?.status || 401).json({
      success: false,
      error: auth.error?.message || 'Authentication required.',
    });
  }

  const caller = auth.user;

  // Specialists do not have patient deletion permissions
  if (caller.role === 'SPECIALIST') {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Specialists are not authorized to delete patient records.',
    });
  }

  try {
    // 1. Locate the target patient row in public.patients (supports UUID or patient_id like 'PX-1001')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientParamId);
    let patientQuery = supabaseAdmin.from('patients').select('*');
    if (isUuid) {
      patientQuery = patientQuery.or(`id.eq.${patientParamId},patient_id.eq.${patientParamId}`);
    } else {
      patientQuery = patientQuery.eq('patient_id', patientParamId);
    }

    const { data: patientRow, error: findError } = await patientQuery.maybeSingle();

    if (findError) {
      console.error('[Delete Patient] Error locating patient:', findError);
      return res.status(500).json({
        success: false,
        error: `Database error querying patient: ${findError.message}`,
      });
    }

    // If patient row exists in Supabase, verify authorization and perform cascading removal
    if (patientRow) {
      // If caller is NURSE, verify ownership / authorization
      if (caller.role === 'NURSE') {
        const isCreator = !patientRow.created_by || patientRow.created_by === caller.id;
        if (!isCreator) {
          // Check if this nurse performed any screening on this patient
          const { data: nurseScreening } = await supabaseAdmin
            .from('screenings')
            .select('id')
            .eq('patient_id', patientRow.id)
            .eq('nurse_id', caller.id)
            .limit(1);

          if (!nurseScreening || nurseScreening.length === 0) {
            return res.status(403).json({
              success: false,
              error: 'Access Denied: You are not authorized to delete this patient record.',
            });
          }
        }
      }

      const patientDbId = patientRow.id;

      // 2. Identify all screenings belonging to this patient
      const { data: patientScreenings, error: screenErr } = await supabaseAdmin
        .from('screenings')
        .select('id')
        .eq('patient_id', patientDbId);

      if (screenErr) {
        console.error('[Delete Patient] Error querying screenings:', screenErr);
      }

      const screeningIds = (patientScreenings || []).map((s) => s.id);

      // 3. Delete dependent grandchild records first (findings & evidence)
      if (screeningIds.length > 0) {
        const { error: fErr } = await supabaseAdmin
          .from('screening_findings')
          .delete()
          .in('screening_id', screeningIds);
        if (fErr) console.error('[Delete Patient] Error deleting findings:', fErr);

        const { error: eErr } = await supabaseAdmin
          .from('screening_evidence')
          .delete()
          .in('screening_id', screeningIds);
        if (eErr) console.error('[Delete Patient] Error deleting evidence:', eErr);

        const { error: rptScreenErr } = await supabaseAdmin
          .from('reports')
          .delete()
          .in('screening_id', screeningIds);
        if (rptScreenErr) console.error('[Delete Patient] Error deleting reports by screening:', rptScreenErr);

        const { error: revScreenErr } = await supabaseAdmin
          .from('specialist_reviews')
          .delete()
          .in('screening_id', screeningIds);
        if (revScreenErr) console.error('[Delete Patient] Error deleting reviews by screening:', revScreenErr);

        const { error: refScreenErr } = await supabaseAdmin
          .from('referrals')
          .delete()
          .in('screening_id', screeningIds);
        if (refScreenErr) console.error('[Delete Patient] Error deleting referrals by screening:', refScreenErr);

        // Delete screenings
        const { error: scrErr } = await supabaseAdmin
          .from('screenings')
          .delete()
          .in('id', screeningIds);
        if (scrErr) console.error('[Delete Patient] Error deleting screenings:', scrErr);
      }

      // 4. Delete any reports, specialist reviews, or referrals directly referencing patient_id
      const { error: rptPatErr } = await supabaseAdmin
        .from('reports')
        .delete()
        .eq('patient_id', patientDbId);
      if (rptPatErr) console.error('[Delete Patient] Error deleting reports by patient:', rptPatErr);

      const { error: revPatErr } = await supabaseAdmin
        .from('specialist_reviews')
        .delete()
        .eq('patient_id', patientDbId);
      if (revPatErr) console.error('[Delete Patient] Error deleting reviews by patient:', revPatErr);

      const { error: refPatErr } = await supabaseAdmin
        .from('referrals')
        .delete()
        .eq('patient_id', patientDbId);
      if (refPatErr) console.error('[Delete Patient] Error deleting referrals by patient:', refPatErr);

      // 5. Finally delete the patient row
      const { error: pDelErr } = await supabaseAdmin
        .from('patients')
        .delete()
        .eq('id', patientDbId);

      if (pDelErr) {
        console.error('[Delete Patient] Error deleting patient row:', pDelErr);
        return res.status(500).json({
          success: false,
          error: `Failed to delete patient row: ${pDelErr.message}`,
        });
      }

      console.log(`[Delete Patient] Successfully purged patient ${patientRow.patient_id} (${patientDbId}) and all child records.`);
    }

    return res.json({
      success: true,
      message: 'Patient and all associated records permanently deleted.',
      deletedId: patientParamId,
    });
  } catch (err: any) {
    console.error('[Delete Patient] Unexpected exception:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'An unexpected error occurred during patient deletion.',
    });
  }
});

/**
 * POST /api/patients
 * Creates a patient in public.patients with proper server-side authentication
 */
patientRouter.post('/', async (req: Request, res: Response) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || 'Database configuration error.',
    });
  }

  const auth = await authenticateCaller(req, supabaseAdmin);
  if (auth.error || !auth.user) {
    return res.status(auth.error?.status || 401).json({
      success: false,
      error: auth.error?.message || 'Authentication required.',
    });
  }

  const {
    patientId,
    name,
    age,
    gender,
    phone,
    diabetesDuration,
    knownDR,
  } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Patient name is required.',
    });
  }

  try {
    const { data: insertedPatient, error: insertError } = await supabaseAdmin
      .from('patients')
      .insert([
        {
          patient_id: patientId || `PX-${Date.now().toString().slice(-4)}`,
          name: name.trim(),
          age: Number(age) || 45,
          gender: gender || 'Male',
          phone: phone || '',
          diabetes_duration: Number(diabetesDuration) || 0,
          known_dr: Boolean(knownDR),
          created_by: auth.user.id,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({
        success: false,
        error: insertError.message,
      });
    }

    return res.json({
      success: true,
      patient: insertedPatient,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create patient.',
    });
  }
});

/**
 * GET /api/patients
 * Retrieves patient records from Supabase
 */
patientRouter.get('/', async (req: Request, res: Response) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || 'Database configuration error.',
    });
  }

  const auth = await authenticateCaller(req, supabaseAdmin);
  if (auth.error || !auth.user) {
    return res.status(auth.error?.status || 401).json({
      success: false,
      error: auth.error?.message || 'Authentication required.',
    });
  }

  try {
    const { data: patientsList, error: pErr } = await supabaseAdmin
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (pErr) {
      return res.status(500).json({
        success: false,
        error: pErr.message,
      });
    }

    return res.json({
      success: true,
      patients: patientsList || [],
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});
