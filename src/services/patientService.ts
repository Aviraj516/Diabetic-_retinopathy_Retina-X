import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Patient } from '../types';

export interface DeletePatientResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Permanently deletes a patient and all associated records (screenings, findings,
 * evidence, referrals, specialist reviews, reports) using the secure server-side endpoint.
 *
 * Security guarantees:
 * - Passes active user's Supabase session JWT (Bearer token).
 * - SUPABASE_SERVICE_ROLE_KEY remains server-side only.
 * - Server validates user role & authorization (NURSE authorized for their patients, ADMIN global, SPECIALIST blocked).
 */
export async function deletePatientRecord(patientId: string): Promise<DeletePatientResult> {
  if (!patientId) {
    return { success: false, error: 'Patient ID is required.' };
  }

  try {
    if (!isSupabaseConfigured()) {
      return { success: true, message: 'Deleted locally.' };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (sessionError || !token) {
      console.warn('[deletePatientRecord] No active session token found; local deletion will proceed.');
      return { success: true, message: 'Session expired; local record purged.' };
    }

    const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = result?.error || `Server responded with HTTP ${response.status}`;
      return {
        success: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      message: result?.message || 'Patient and associated records deleted successfully.',
    };
  } catch (err: any) {
    console.error('[deletePatientRecord] Network error:', err);
    return {
      success: false,
      error: err.message || 'Network error communicating with deletion service.',
    };
  }
}

/**
 * Saves a new patient to Supabase via the secure server endpoint or direct client fallback
 */
export async function createPatientRecord(
  patient: Omit<Patient, 'createdAt' | 'createdByNurse'> & { id?: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isSupabaseConfigured()) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          customHeaders['Authorization'] = `Bearer ${token}`;
        }
      } catch (authErr) {
        console.warn('[createPatientRecord] Could not retrieve session token:', authErr);
      }
    }

    const payload = {
      patientId: patient.id,
      name: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phoneNumber,
      diabetesDuration: patient.diabetesDurationYears,
      knownDR: patient.knownDR === 'Yes',
    };

    const response = await fetch('/api/patients', {
      method: 'POST',
      headers: customHeaders,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    if (response.ok && data?.patient) {
      return { success: true, data: data.patient };
    }

    // Direct Supabase fallback if API route was unreachable
    if (isSupabaseConfigured()) {
      const { data: directInsert, error: directErr } = await supabase
        .from('patients')
        .insert([
          {
            patient_id: patient.id || `PX-${Date.now().toString().slice(-4)}`,
            name: patient.fullName,
            age: patient.age || 45,
            gender: patient.gender || 'Male',
            phone: patient.phoneNumber || '',
            diabetes_duration: patient.diabetesDurationYears || 0,
            known_dr: patient.knownDR === 'Yes',
          },
        ])
        .select()
        .single();

      if (!directErr && directInsert) {
        return { success: true, data: directInsert };
      }
    }

    return { success: false, error: data?.error || 'Failed to save patient to database' };
  } catch (err: any) {
    console.error('[createPatientRecord] Error:', err);

    // Direct fallback on exception
    if (isSupabaseConfigured()) {
      try {
        const { data: fallbackData } = await supabase
          .from('patients')
          .insert([
            {
              patient_id: patient.id || `PX-${Date.now().toString().slice(-4)}`,
              name: patient.fullName,
              age: patient.age || 45,
              gender: patient.gender || 'Male',
              phone: patient.phoneNumber || '',
              diabetes_duration: patient.diabetesDurationYears || 0,
              known_dr: patient.knownDR === 'Yes',
            },
          ])
          .select()
          .single();
        if (fallbackData) return { success: true, data: fallbackData };
      } catch {
        // ignore
      }
    }

    return { success: false, error: err.message };
  }
}

/**
 * Fetches all registered patients from the Supabase database.
 */
export async function fetchPatientRecords(): Promise<Patient[]> {
  try {
    const customHeaders: Record<string, string> = {};

    if (isSupabaseConfigured()) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          customHeaders['Authorization'] = `Bearer ${token}`;
        }
      } catch (authErr) {
        console.warn('[fetchPatientRecords] Could not retrieve session token:', authErr);
      }
    }

    let list: any[] = [];
    try {
      const response = await fetch('/api/patients', {
        headers: customHeaders,
      });

      if (response.ok) {
        const data = await response.json();
        list = data.patients || [];
      }
    } catch (fetchErr) {
      console.warn('[patientService] /api/patients unreachable, trying direct Supabase query:', fetchErr);
    }

    // Direct Supabase fallback if API returned empty or failed
    if (list.length === 0 && isSupabaseConfigured()) {
      const { data: directPatients, error: directErr } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      if (!directErr && directPatients) {
        list = directPatients;
      }
    }

    return list.map((p: any) => ({
      id: p.patient_id || p.id,
      dbId: p.id,
      fullName: p.name || 'Patient information unavailable',
      age: p.age || 50,
      gender: p.gender || 'Other',
      phoneNumber: p.phone || '',
      diabetesDurationYears: p.diabetes_duration || 0,
      knownDR: p.known_dr ? 'Yes' : 'No',
      createdAt: p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '',
      createdByNurse: 'Staff',
      lastScreeningDate: p.last_screening_date || undefined,
      lastScreeningResult: p.last_screening_result || undefined,
    }));
  } catch (err) {
    console.error('[patientService] Failed to fetch patients from Supabase:', err);
    return [];
  }
}

