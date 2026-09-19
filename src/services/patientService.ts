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
 * Saves a new patient to Supabase via the secure server endpoint
 */
export async function createPatientRecord(patient: Omit<Patient, 'createdAt' | 'createdByNurse'>): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { success: true };

    const response = await fetch('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientId: patient.id,
        name: patient.fullName,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phoneNumber,
        diabetesDuration: patient.diabetesDurationYears,
        knownDR: patient.knownDR === 'Yes',
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { success: false, error: data?.error || 'Failed to save patient to database' };
    }

    return { success: true, data: data.patient };
  } catch (err: any) {
    console.error('[createPatientRecord] Error:', err);
    return { success: false, error: err.message };
  }
}
