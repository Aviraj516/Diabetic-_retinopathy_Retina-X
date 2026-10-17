import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { GlaucomaScreeningRecord } from '../types';

export interface ScreeningApiResult {
  success: boolean;
  screenings?: any[];
  screening?: any;
  error?: string;
  pdfUrl?: string;
}

function formatSupabaseSessionRecord(s: any) {
  const patRaw = s.patients;
  const pat = Array.isArray(patRaw) ? patRaw[0] : (patRaw || {});
  const resRaw = s.screening_results;
  const res = Array.isArray(resRaw) ? resRaw[0] : (resRaw || {});
  const artRaw = s.screening_artifacts;
  const artList = Array.isArray(artRaw) ? artRaw : (artRaw ? [artRaw] : []);

  let dateStr = '';
  if (s.created_at) {
    try {
      const dt = new Date(s.created_at);
      dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      dateStr = String(s.created_at).slice(0, 10);
    }
  }

  const probVal = res.probability;
  const conf = probVal != null ? Math.round(Number(probVal) * 100) : 85;

  const artifactsDict: Record<string, string> = {};
  for (const a of artList) {
    if (a.artifact_type) {
      artifactsDict[a.artifact_type] = `/api/screenings/${s.id}/artifacts/${a.artifact_type}`;
    }
  }

  const modelOut = res.model_output || {};
  const measurements = res.measurements || {};
  const screeningType = s.screening_type || 'cataract';
  const verdict = res.verdict || 'NORMAL';
  const severity = res.severity || (verdict === 'CATARACT' ? 'Suspected Cataract' : 'Normal');

  return {
    id: s.id,
    session_id: s.id,
    patientId: pat.patient_id || pat.id || s.patient_id,
    patientDbId: pat.id || s.patient_id,
    patientName: pat.name || 'Patient information unavailable',
    patientAge: pat.age || 50,
    patientGender: pat.gender || 'Other',
    patientPhone: pat.phone || '',
    eye: s.eye_side || 'Right Eye',
    eyeSide: s.eye_side || 'Right Eye',
    screeningType: screeningType,
    screening_type: screeningType,
    status: String(s.status).toUpperCase() === 'COMPLETED' ? 'Completed' : 'Review',
    date: dateStr,
    createdAt: dateStr,
    created_at: s.created_at,
    drSeverity: severity,
    drSeverityLevel: severity,
    cataractPrediction: verdict,
    glaucomaPrediction: verdict,
    verdict: verdict,
    diagnosis: severity,
    severity: severity,
    confidence: conf,
    confidenceScore: conf,
    probability: probVal,
    recommendation: res.recommendations || '',
    clinicalSummary: res.clinical_summary || '',
    imageOriginal: artifactsDict.original || artifactsDict.original_fundus || `/api/screenings/${s.id}/artifacts/original`,
    imageEyeDetection: artifactsDict.eye_box || `/api/screenings/${s.id}/artifacts/eye_box`,
    imageAnalyzedRegion: artifactsDict.analyzed_region || `/api/screenings/${s.id}/artifacts/analyzed_region`,
    imageOpacityEvidence: artifactsDict.opacity_evidence || `/api/screenings/${s.id}/artifacts/opacity_evidence`,
    imageGradCam: artifactsDict.gradcam || artifactsDict.combined || `/api/screenings/${s.id}/artifacts/gradcam`,
    imageWorkflow: artifactsDict.workflow || artifactsDict.combined || `/api/screenings/${s.id}/artifacts/workflow`,
    imageXai: artifactsDict.xai || artifactsDict.gradcam || `/api/screenings/${s.id}/artifacts/xai`,
    imageLesions: artifactsDict.lesions || `/api/screenings/${s.id}/artifacts/lesions`,
    imageAnatomy: artifactsDict.anatomy || `/api/screenings/${s.id}/artifacts/anatomy`,
    imageCombined: artifactsDict.combined || `/api/screenings/${s.id}/artifacts/combined`,
    artifacts: artifactsDict,
    measurements: measurements,
    quantitativeAnalysis: measurements.quantitativeAnalysis || modelOut.quantitativeAnalysis,
    anatomyData: measurements.anatomy || modelOut.anatomy,
    lesionData: measurements.lesions || modelOut.lesions,
    model_output: modelOut,
    result: {
      diagnosis: severity,
      severity: severity,
      confidence: probVal != null ? Number(probVal) : 0.85,
      verdict: verdict,
      cataract: modelOut.cataract,
      glaucoma: modelOut.glaucoma,
      measurements: measurements,
      clinicalSummary: res.clinical_summary,
      artifacts: artifactsDict,
    },
  };
}

/**
 * Fetch all screenings (optionally filtered by type) from the Supabase-backed API
 * with direct Supabase client fallback if the API is slow or times out.
 */
export async function fetchScreenings(type?: string): Promise<any[]> {
  let list: any[] = [];
  try {
    const url = type ? `/api/screenings?type=${encodeURIComponent(type)}` : '/api/screenings';
    let headers: Record<string, string> = {};

    if (isSupabaseConfigured()) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch (authErr) {
        console.warn('[fetchScreenings] Could not retrieve session token:', authErr);
      }
    }

    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = await response.json();
        list = (data.screenings || []) as any[];
      }
    } catch (fetchErr) {
      console.warn('[screeningService] /api/screenings unreachable, trying direct Supabase query:', fetchErr);
    }

    // Direct Supabase fallback if API returned empty or failed (mirrors patientService.ts)
    if (list.length === 0 && isSupabaseConfigured()) {
      let query = supabase
        .from('screening_sessions')
        .select('*, patients(*), screening_results(*), screening_artifacts(*)')
        .order('created_at', { ascending: false });

      if (type) {
        query = query.eq('screening_type', type);
      }

      const { data: directSessions, error: directErr } = await query;
      if (!directErr && directSessions && directSessions.length > 0) {
        list = directSessions.map((s: any) => formatSupabaseSessionRecord(s));
      }
    }

    return list;
  } catch (err) {
    console.error('[screeningService] Failed to fetch screenings:', err);
    return [];
  }
}


/**
 * Fetch single screening session by ID with freshly signed artifact URLs.
 */
export async function fetchScreeningById(id: string): Promise<GlaucomaScreeningRecord | null> {
  if (!id) return null;
  try {
    let headers: Record<string, string> = {};

    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`/api/screenings/${encodeURIComponent(id)}`, { headers });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.screening as GlaucomaScreeningRecord;
  } catch (err) {
    console.error('[screeningService] Failed to fetch screening by ID:', err);
    return null;
  }
}

/**
 * Upload generated report PDF to Supabase Storage and register artifact.
 */
export async function uploadReportPdf(
  screeningId: string,
  pdfBase64: string,
  doctorId?: string,
  patientId?: string
): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
  try {
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`/api/screenings/${encodeURIComponent(screeningId)}/report-pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pdfBase64, doctorId, patientId }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      return { success: false, error: data?.error || 'Failed to upload report PDF' };
    }

    return { success: true, pdfUrl: data.pdfUrl };
  } catch (err: any) {
    console.error('[screeningService] Error uploading PDF artifact:', err);
    return { success: false, error: err.message };
  }
}
