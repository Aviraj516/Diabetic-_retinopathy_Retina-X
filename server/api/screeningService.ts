import express, { type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const screeningRouter = express.Router();

const STORAGE_BUCKET = 'medical-screenings';

// Helper to get administrative Supabase client using server-side service role key
export function getSupabaseAdminClient(): { client?: SupabaseClient; error?: string } {
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

// Helper to authenticate request and get caller information
export async function authenticateCaller(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<{ error?: { status: number; message: string }; user?: { id: string; email?: string; role: string } }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Check if there is a session or fallback for development/demo
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

  return {
    user: {
      id: callerUser.id,
      email: callerUser.email,
      role: rawRole || 'NURSE',
    },
  };
}

/**
 * Resolve or retrieve a patient's UUID primary key from public.patients
 */
export async function resolvePatientDbId(
  supabaseAdmin: SupabaseClient,
  patientIdentifier: string | undefined,
  doctorId: string,
  patientMeta?: { name?: string; age?: number; gender?: string; phone?: string }
): Promise<string> {
  const cleanId = (patientIdentifier || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

  if (isUuid) {
    const { data: existing } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();
    if (existing?.id) return existing.id;
  }

  if (cleanId) {
    const { data: existingByCode } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('patient_id', cleanId)
      .maybeSingle();
    if (existingByCode?.id) return existingByCode.id;
  }

  // If not found by ID/code, find any existing patient or create a new one
  const { data: firstPatient } = await supabaseAdmin
    .from('patients')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (firstPatient?.id && !cleanId) {
    return firstPatient.id;
  }

  // Create new patient record
  const newCode = cleanId || `PX-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: createdPatient, error: createErr } = await supabaseAdmin
    .from('patients')
    .insert({
      patient_id: newCode,
      name: patientMeta?.name || 'Patient information unavailable',
      age: patientMeta?.age || 55,
      gender: patientMeta?.gender || 'Other',
      phone: patientMeta?.phone || '',
      created_by: doctorId,
    })
    .select('id')
    .single();

  if (createErr || !createdPatient) {
    console.error('[Screening Service] Failed to create patient record:', createErr);
    if (firstPatient?.id) return firstPatient.id;
    throw new Error(`Failed to resolve or create patient: ${createErr?.message}`);
  }

  return createdPatient.id;
}

/**
 * Persist glaucoma screening run:
 * 1. Upload artifacts (base64 PNGs) to Supabase Storage 'medical-screenings'
 * 2. Insert public.screening_sessions record
 * 3. Insert public.screening_artifacts records
 * 4. Insert public.screening_results record (with review_status: 'pending_review')
 * 5. Generate signed URLs for artifacts
 */
export async function persistGlaucomaScreening(
  supabaseAdmin: SupabaseClient,
  doctorId: string,
  patientDbId: string,
  eyeSide: string,
  mlResult: any
): Promise<{
  sessionId: string;
  signedArtifacts: Record<string, string>;
  screeningRecord: any;
}> {
  // 1. Create screening session row
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin
    .from('screening_sessions')
    .insert({
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: 'glaucoma',
      eye_side: eyeSide || 'Right Eye',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (sessionErr || !sessionRow) {
    console.error('[Screening Service] Error inserting screening_sessions:', sessionErr);
    throw new Error(`Database error creating screening session: ${sessionErr?.message}`);
  }

  const sessionId = sessionRow.id;
  const signedArtifacts: Record<string, string> = {};

  // 2. Map of visualizations from Python ML server to allowed artifact_types in screening_artifacts
  const artifactMapping: Array<{
    artifactType: 'original_fundus' | 'optic_disc_cup' | 'vessel_segmentation' | 'gradcam' | 'combined_xai';
    base64Data?: string;
    keyName: string;
  }> = [
    {
      artifactType: 'original_fundus',
      base64Data: mlResult.visualizations?.original,
      keyName: 'original',
    },
    {
      artifactType: 'optic_disc_cup',
      base64Data: mlResult.visualizations?.opticNerve,
      keyName: 'opticNerve',
    },
    {
      artifactType: 'vessel_segmentation',
      base64Data: mlResult.visualizations?.retinalAnatomy,
      keyName: 'retinalAnatomy',
    },
    {
      artifactType: 'gradcam',
      base64Data: mlResult.visualizations?.gradcam,
      keyName: 'gradcam',
    },
    {
      artifactType: 'combined_xai',
      base64Data: mlResult.visualizations?.workflow,
      keyName: 'workflow',
    },
  ];

    const localTargetDir = path.join(process.cwd(), 'uploads', 'screening_results', sessionId);
    try {
      fs.mkdirSync(localTargetDir, { recursive: true });
    } catch {}

    await Promise.all(
      artifactMapping.map(async (item) => {
        if (!item.base64Data) return;

        try {
          let rawB64 = item.base64Data;
          if (rawB64.includes(',')) {
            rawB64 = rawB64.split(',')[1];
          }
          const buffer = Buffer.from(rawB64, 'base64');

          // 1. Save locally to disk immediately
          try {
            fs.writeFileSync(path.join(localTargetDir, `${item.artifactType}.png`), buffer);
            if (item.keyName !== item.artifactType) {
              fs.writeFileSync(path.join(localTargetDir, `${item.keyName}.png`), buffer);
            }
            if (item.artifactType === 'original_fundus') {
              fs.writeFileSync(path.join(localTargetDir, 'original.png'), buffer);
            }
            if (item.artifactType === 'optic_disc_cup') {
              fs.writeFileSync(path.join(localTargetDir, 'optic_nerve.png'), buffer);
              fs.writeFileSync(path.join(localTargetDir, 'opticNerve.png'), buffer);
            }
            if (item.artifactType === 'vessel_segmentation') {
              fs.writeFileSync(path.join(localTargetDir, 'vessels.png'), buffer);
              fs.writeFileSync(path.join(localTargetDir, 'retinalAnatomy.png'), buffer);
            }
            if (item.artifactType === 'gradcam') {
              fs.writeFileSync(path.join(localTargetDir, 'gradcam.png'), buffer);
              fs.writeFileSync(path.join(localTargetDir, 'xai.png'), buffer);
            }
            if (item.artifactType === 'combined_xai') {
              fs.writeFileSync(path.join(localTargetDir, 'workflow.png'), buffer);
              fs.writeFileSync(path.join(localTargetDir, 'combined.png'), buffer);
            }
          } catch (diskErr) {
            console.warn(`[Screening Service] Local disk write warning for ${item.artifactType}:`, diskErr);
          }

          // Default fallback signed artifact to local API endpoint
          signedArtifacts[item.keyName] = `/api/screenings/${sessionId}/artifacts/${item.keyName}`;
          signedArtifacts[item.artifactType] = `/api/screenings/${sessionId}/artifacts/${item.artifactType}`;

          const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;

          // Upload to Supabase Storage bucket 'medical-screenings'
          const { error: uploadErr } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, buffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (uploadErr) {
            console.warn(`[Screening Service] Warning uploading artifact ${item.artifactType}:`, uploadErr.message);
          }

          // Insert record into public.screening_artifacts
          const { error: artDbErr } = await supabaseAdmin
            .from('screening_artifacts')
            .insert({
              screening_session_id: sessionId,
              doctor_id: doctorId,
              patient_id: patientDbId,
              artifact_type: item.artifactType,
              bucket_id: STORAGE_BUCKET,
              storage_path: storagePath,
              mime_type: 'image/png',
              file_size_bytes: buffer.length,
              eye_side: eyeSide || 'Right Eye',
            });

          if (artDbErr) {
            console.warn(`[Screening Service] Warning recording artifact row ${item.artifactType}:`, artDbErr.message);
          }

          // Generate signed URL valid for 24 hours (86400s)
          const { data: signedData } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, 86400);

          if (signedData?.signedUrl) {
            signedArtifacts[item.keyName] = signedData.signedUrl;
            signedArtifacts[item.artifactType] = signedData.signedUrl;
          }
        } catch (e: any) {
          console.error(`[Screening Service] Error processing artifact ${item.artifactType}:`, e);
        }
      })
    );

  // 3. Insert screening result record
  const isUngradable =
    (mlResult as any).status === 'IMAGE_QUALITY_INSUFFICIENT' ||
    (mlResult as any).status === 'SEGMENTATION_UNGRADABLE' ||
    (mlResult as any).status === 'INCONCLUSIVE' ||
    mlResult.glaucoma?.prediction === 'INCONCLUSIVE' ||
    (mlResult.glaucoma as any)?.prediction === 'UNGRADABLE';

  const isSuspect = !isUngradable && Boolean(mlResult.glaucoma?.glaucomaFlag || mlResult.glaucoma?.prediction === 'GLAUCOMA_SUSPECT');
  const probability = mlResult.glaucoma?.glaucomaProbability || 0;
  const quality = mlResult.quality?.quality || 'Good';

  const measurements = {
    vertical_cdr: mlResult.discCupSegmentation?.verticalCDR || 0,
    horizontal_cdr: mlResult.discCupSegmentation?.horizontalCDR || 0,
    area_cdr: mlResult.discCupSegmentation?.areaCDR || 0,
    cdr_features: mlResult.discCupSegmentation?.cdrFeatures || {},
    vessel_density: mlResult.vesselSegmentation?.density || 0,
    quality_features: mlResult.quality?.features || {},
  };

  const modelOutput = {
    glaucoma: mlResult.glaucoma || {},
    discCupSegmentation: mlResult.discCupSegmentation || {},
    vesselSegmentation: mlResult.vesselSegmentation || {},
    quality: mlResult.quality || {},
  };

  const clinicalSummary =
    mlResult.glaucoma?.clinicalRecommendation ||
    (isUngradable
      ? 'Automated glaucoma screening inconclusive due to ungradable segmentation. Specialist examination advised.'
      : isSuspect
      ? 'Elevated cup-to-disc ratio detected. Dilated ophthalmological examination recommended.'
      : 'Optic nerve head morphology within normal physiologic parameters.');

  const recommendations = {
    triage: isUngradable
      ? 'Specialist Evaluation Required'
      : isSuspect
      ? 'Refer to Specialist / Glaucoma Clinic'
      : 'Annual Routine Screening',
    follow_up_period: isUngradable ? '1-2 weeks' : isSuspect ? '2-4 weeks' : '12 months',
    referral_required: isUngradable || isSuspect,
  };

  const { data: resultRow, error: resultErr } = await supabaseAdmin
    .from('screening_results')
    .insert({
      screening_session_id: sessionId,
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: 'glaucoma',
      verdict: isUngradable ? 'INCONCLUSIVE' : isSuspect ? 'GLAUCOMA_SUSPECT' : 'NORMAL',
      probability: probability,
      severity: isUngradable ? 'inconclusive' : isSuspect ? 'suspect' : 'normal',
      image_quality: quality,
      measurements,
      model_output: modelOutput,
      model_name: 'Attention U-Net + Random Forest Glaucoma Pipeline',
      model_version: '1.0.0',
      clinical_summary: clinicalSummary,
      recommendations,
      review_status: 'pending_review',
    })
    .select('*')
    .single();

  if (resultErr) {
    console.error('[Screening Service] Error inserting screening_results:', resultErr);
  }

  // 4. Update session status to completed
  await supabaseAdmin
    .from('screening_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow,
    },
  };
}

/**
 * Persist Diabetic Retinopathy screening run:
 * 1. Upload artifacts (original, combined, anatomy, lesions, optic_disc, vessel) to Supabase Storage
 * 2. Insert public.screening_sessions record
 * 3. Insert public.screening_artifacts records
 * 4. Insert public.screening_results record
 * 5. Generate signed URLs for artifacts
 */
export async function persistDRScreening(
  supabaseAdmin: SupabaseClient,
  doctorId: string,
  patientDbId: string,
  eyeSide: string,
  mlResult: any
): Promise<{
  sessionId: string;
  signedArtifacts: Record<string, string>;
  screeningRecord: any;
}> {
  // 1. Create screening session row
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin
    .from('screening_sessions')
    .insert({
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: 'dr',
      eye_side: eyeSide || 'Right Eye',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (sessionErr || !sessionRow) {
    console.error('[Screening Service] Error inserting screening_sessions (DR):', sessionErr);
    throw new Error(`Database error creating screening session: ${sessionErr?.message}`);
  }

  const sessionId = sessionRow.id;
  const signedArtifacts: Record<string, string> = {};

  const drVisualizations = mlResult.trinay?.visualizations || {};
  const drXai = mlResult.xai || {};

  const artifactMapping: Array<{
    artifactType: 'original_fundus' | 'combined_xai' | 'anatomy_map' | 'lesion_overlay' | 'optic_disc_cup' | 'vessel_segmentation' | 'gradcam';
    base64Data?: string;
    keyName: string;
  }> = [
    {
      artifactType: 'original_fundus',
      base64Data: drVisualizations.canonical || drXai.original || (typeof mlResult.imageOriginal === 'string' ? mlResult.imageOriginal : undefined),
      keyName: 'original',
    },
    {
      artifactType: 'lesion_overlay',
      base64Data: drVisualizations.lesion,
      keyName: 'lesions',
    },
    {
      artifactType: 'anatomy_map',
      base64Data: drVisualizations.anatomy,
      keyName: 'anatomy',
    },
    {
      artifactType: 'combined_xai',
      base64Data: drVisualizations.combined,
      keyName: 'combined',
    },
    {
      artifactType: 'gradcam',
      base64Data: drXai.combined,
      keyName: 'gradcam',
    },
    {
      artifactType: 'optic_disc_cup',
      base64Data: drXai.optic_disc,
      keyName: 'optic_disc',
    },
    {
      artifactType: 'vessel_segmentation',
      base64Data: drXai.vessel,
      keyName: 'vessel',
    },
  ];

  await Promise.all(
    artifactMapping.map(async (item) => {
      if (!item.base64Data) return;

      try {
        let rawB64 = item.base64Data;
        if (rawB64.includes(',')) {
          rawB64 = rawB64.split(',')[1];
        }
        const buffer = Buffer.from(rawB64, 'base64');
        const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, buffer, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadErr) {
          console.warn(`[Screening Service] Warning uploading DR artifact ${item.artifactType}:`, uploadErr.message);
        }

        await supabaseAdmin
          .from('screening_artifacts')
          .insert({
            screening_session_id: sessionId,
            doctor_id: doctorId,
            patient_id: patientDbId,
            artifact_type: item.artifactType,
            bucket_id: STORAGE_BUCKET,
            storage_path: storagePath,
            mime_type: 'image/png',
            file_size_bytes: buffer.length,
            eye_side: eyeSide || 'Right Eye',
          });

        const { data: signedData } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, 86400);

        if (signedData?.signedUrl) {
          signedArtifacts[item.keyName] = signedData.signedUrl;
          signedArtifacts[item.artifactType] = signedData.signedUrl;
        }
      } catch (e: any) {
        console.error(`[Screening Service] Error processing DR artifact ${item.artifactType}:`, e);
      }
    })
  );

  // 3. Insert screening result record
  const drSeverity = mlResult.severity?.drSeverity || 'No DR';
  const confidence = (mlResult.severity?.confidence || 0) / 100;
  const imageQuality = mlResult.quality?.quality || 'Good';
  const findings = mlResult.trinay?.findings || [];
  const recommendation = mlResult.severity?.recommendation || 'Routine follow-up';

  const measurements = {
    anatomy: mlResult.trinay?.anatomy || {},
    lesions: mlResult.trinay?.lesions || {},
    findings: findings,
    probabilities: mlResult.severity?.probabilities || {},
    quality_features: mlResult.quality?.features || {},
  };

  const modelOutput = {
    imageInfo: mlResult.imageInfo || {},
    quality: mlResult.quality || {},
    severity: mlResult.severity || {},
    trinay: {
      anatomy: mlResult.trinay?.anatomy || {},
      lesions: mlResult.trinay?.lesions || {},
      findings: mlResult.trinay?.findings || [],
    },
    xai: mlResult.xai ? { has_xai: true } : null,
  };

  const clinicalSummary = recommendation || (findings.length > 0 ? findings.join('. ') : 'Screening complete.');

  const recommendations = {
    triage: drSeverity !== 'No DR' ? 'Referral for dilated ophthalmological examination' : 'Annual routine screening',
    follow_up_period: drSeverity === 'No DR' ? '12 months' : '2-4 weeks',
    referral_required: drSeverity !== 'No DR',
  };

  const { data: resultRow, error: resultErr } = await supabaseAdmin
    .from('screening_results')
    .insert({
      screening_session_id: sessionId,
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: 'dr',
      verdict: drSeverity,
      probability: confidence,
      severity: drSeverity,
      image_quality: imageQuality,
      measurements,
      model_output: modelOutput,
      model_name: 'EfficientNet-B0 + TRINAY Multi-Task Anatomy & Lesion Pipeline',
      model_version: '1.0.0',
      clinical_summary: clinicalSummary,
      recommendations,
      review_status: 'pending_review',
    })
    .select('*')
    .single();

  if (resultErr) {
    console.error('[Screening Service] Error inserting DR screening_results:', resultErr);
  }

  // 4. Update session status to completed
  await supabaseAdmin
    .from('screening_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow,
    },
  };
}

/**
 * Persist Cataract screening run:
 * 1. Upload artifacts (original, eye_box, iris, pupil, anatomy, gradcam, workflow) to Supabase Storage
 * 2. Insert public.screening_sessions record
 * 3. Insert public.screening_artifacts records
 * 4. Insert public.screening_results record
 * 5. Generate signed URLs for artifacts
 */
async function uploadWithBoundedRetry(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType = 'image/png',
  retries = 2
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });
      if (!error) return true;
      console.warn(`[Supabase Upload Attempt ${attempt}/${retries} failed] ${storagePath}:`, error.message);
    } catch (e: any) {
      console.warn(`[Supabase Upload Attempt ${attempt}/${retries} error] ${storagePath}:`, e.message);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

export async function persistCataractScreening(
  supabaseAdmin: SupabaseClient,
  doctorId: string,
  patientDbId: string,
  eyeSide: string,
  mlResult: any
): Promise<{
  sessionId: string;
  signedArtifacts: Record<string, string>;
  screeningRecord: any;
}> {
  // Check if session ID was already created (e.g. by Python server or caller)
  const existingCandidateId = mlResult.session_id || mlResult.screening_id || mlResult.id;
  let sessionId = existingCandidateId;
  let sessionRow: any = null;

  if (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    const { data: existingSess } = await supabaseAdmin
      .from('screening_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (existingSess) {
      sessionRow = existingSess;
      sessionId = existingSess.id;
    }
  }

  if (!sessionRow) {
    const { data: insertedRow, error: sessionErr } = await supabaseAdmin
      .from('screening_sessions')
      .insert({
        ...(sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ? { id: sessionId } : {}),
        doctor_id: doctorId,
        patient_id: patientDbId,
        screening_type: 'cataract',
        eye_side: eyeSide || 'Right Eye',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (sessionErr || !insertedRow) {
      console.error('[Screening Service] Error inserting screening_sessions (Cataract):', sessionErr);
      throw new Error(`Database error creating cataract screening session: ${sessionErr?.message}`);
    }
    sessionRow = insertedRow;
    sessionId = sessionRow.id;
  }

  const signedArtifacts: Record<string, string> = {};

  // Ensure local disk storage directory exists for immediate 100% reliable serving
  const localTargetDir = path.join(process.cwd(), 'uploads', 'screening_results', sessionId);
  if (!fs.existsSync(localTargetDir)) {
    fs.mkdirSync(localTargetDir, { recursive: true });
  }

  const catVis = mlResult.visualizations || {};

  const artifactMapping: Array<{
    artifactType: 'original_fundus' | 'eye_box' | 'iris' | 'pupil' | 'anatomy_map' | 'gradcam' | 'combined_xai';
    base64Data?: string;
    keyName: string;
  }> = [
    {
      artifactType: 'original_fundus',
      base64Data: catVis.original,
      keyName: 'original',
    },
    {
      artifactType: 'eye_box',
      base64Data: catVis.eyeDetection,
      keyName: 'eye_box',
    },
    {
      artifactType: 'iris',
      base64Data: catVis.iris,
      keyName: 'iris',
    },
    {
      artifactType: 'pupil',
      base64Data: catVis.pupil,
      keyName: 'pupil',
    },
    {
      artifactType: 'anatomy_map',
      base64Data: catVis.anatomy || catVis.anatomyCombined,
      keyName: 'anatomy',
    },
    {
      artifactType: 'gradcam',
      base64Data: catVis.gradcam,
      keyName: 'gradcam',
    },
    {
      artifactType: 'combined_xai',
      base64Data: catVis.workflow,
      keyName: 'workflow',
    },
  ];

  // Also handle analyzedRegion and opacityEvidenceMap if present
  if (catVis.analyzedRegion) {
    try {
      let raw = catVis.analyzedRegion;
      if (raw.includes(',')) raw = raw.split(',')[1];
      const buf = Buffer.from(raw, 'base64');
      fs.writeFileSync(path.join(localTargetDir, 'analyzed_region.png'), buf);
      fs.writeFileSync(path.join(localTargetDir, 'analyzedRegion.png'), buf);
      signedArtifacts['analyzed_region'] = `/api/screenings/${sessionId}/artifacts/analyzed_region`;
    } catch {}
  }

  if (catVis.opacityEvidenceMap) {
    try {
      let raw = catVis.opacityEvidenceMap;
      if (raw.includes(',')) raw = raw.split(',')[1];
      const buf = Buffer.from(raw, 'base64');
      fs.writeFileSync(path.join(localTargetDir, 'opacity_evidence.png'), buf);
      fs.writeFileSync(path.join(localTargetDir, 'opacityEvidenceMap.png'), buf);
      signedArtifacts['opacity_evidence'] = `/api/screenings/${sessionId}/artifacts/opacity_evidence`;
    } catch {}
  }

  await Promise.all(
    artifactMapping.map(async (item) => {
      if (!item.base64Data) return;

      try {
        let rawB64 = item.base64Data;
        if (rawB64.includes(',')) {
          rawB64 = rawB64.split(',')[1];
        }
        const buffer = Buffer.from(rawB64, 'base64');

        // 1. Save locally to disk immediately
        try {
          fs.writeFileSync(path.join(localTargetDir, `${item.artifactType}.png`), buffer);
          if (item.keyName !== item.artifactType) {
            fs.writeFileSync(path.join(localTargetDir, `${item.keyName}.png`), buffer);
          }
          if (item.artifactType === 'original_fundus') {
            fs.writeFileSync(path.join(localTargetDir, 'original.png'), buffer);
          }
          if (item.artifactType === 'eye_box') {
            fs.writeFileSync(path.join(localTargetDir, 'eyeDetection.png'), buffer);
          }
          if (item.artifactType === 'gradcam') {
            fs.writeFileSync(path.join(localTargetDir, 'xai.png'), buffer);
          }
          if (item.artifactType === 'combined_xai') {
            fs.writeFileSync(path.join(localTargetDir, 'workflow.png'), buffer);
          }
        } catch (diskErr) {
          console.warn(`[Screening Service] Local disk write warning for ${item.artifactType}:`, diskErr);
        }

        // Default signed artifact to local API endpoint
        signedArtifacts[item.keyName] = `/api/screenings/${sessionId}/artifacts/${item.keyName}`;
        signedArtifacts[item.artifactType] = `/api/screenings/${sessionId}/artifacts/${item.artifactType}`;

        // 2. Upload to Supabase Storage with bounded retry
        const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;
        const uploadSuccess = await uploadWithBoundedRetry(
          supabaseAdmin,
          STORAGE_BUCKET,
          storagePath,
          buffer,
          'image/png',
          2
        );

        if (uploadSuccess) {
          await supabaseAdmin
            .from('screening_artifacts')
            .upsert({
              screening_session_id: sessionId,
              doctor_id: doctorId,
              patient_id: patientDbId,
              artifact_type: item.artifactType,
              bucket_id: STORAGE_BUCKET,
              storage_path: storagePath,
              mime_type: 'image/png',
              file_size_bytes: buffer.length,
              eye_side: eyeSide || 'Right Eye',
            });

          const { data: signedData } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, 86400);

          if (signedData?.signedUrl) {
            signedArtifacts[item.keyName] = signedData.signedUrl;
            signedArtifacts[item.artifactType] = signedData.signedUrl;
          }
        }
      } catch (e: any) {
        console.error(`[Screening Service] Error processing Cataract artifact ${item.artifactType}:`, e);
      }
    })
  );

  const isCataract = mlResult.cataract?.prediction === 'CATARACT' || mlResult.prediction === 'CATARACT';
  const cataractProbability = mlResult.cataract?.cataractProbability ?? mlResult.probability ?? 0;
  const imageQuality = mlResult.quality?.isGood ? 'Good' : 'Borderline';

  const measurements = {
    eyeDetection: mlResult.eyeDetection || {},
    irisLocalization: mlResult.irisLocalization || {},
    pupilLocalization: mlResult.pupilLocalization || {},
    quality: mlResult.quality || {},
    quantitativeAnalysis: mlResult.quantitativeAnalysis || {},
  };

  const modelOutput = {
    quality: mlResult.quality || {},
    eyeDetection: mlResult.eyeDetection || {},
    irisLocalization: mlResult.irisLocalization || {},
    pupilLocalization: mlResult.pupilLocalization || {},
    cataract: mlResult.cataract || {},
    quantitativeAnalysis: mlResult.quantitativeAnalysis || {},
  };

  const clinicalSummary = mlResult.cataract?.clinicalRecommendation || (isCataract
    ? 'Anterior segment lens opacification detected. Clinical slit-lamp evaluation recommended.'
    : 'Clear anterior lens structure with normal pupillary reflex.');

  const recommendations = {
    triage: isCataract ? 'Refer to Specialist / Cataract Clinic' : 'Annual Routine Screening',
    follow_up_period: isCataract ? '2-4 weeks' : '12 months',
    referral_required: isCataract,
  };

  const { data: resultRow, error: resultErr } = await supabaseAdmin
    .from('screening_results')
    .upsert({
      screening_session_id: sessionId,
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: 'cataract',
      verdict: isCataract ? 'CATARACT' : 'NORMAL',
      probability: cataractProbability,
      severity: mlResult.cataract?.severityGrade || (isCataract ? 'Suspected Cataract' : 'Normal'),
      image_quality: imageQuality,
      measurements,
      model_output: modelOutput,
      model_name: 'TRINAY Cataract Pipeline (EfficientNet-V2-S)',
      model_version: '2.0.0',
      clinical_summary: clinicalSummary,
      recommendations,
      review_status: 'pending_review',
    })
    .select('*')
    .single();

  if (resultErr) {
    console.error('[Screening Service] Error inserting Cataract screening_results:', resultErr);
  }

  // 4. Update session status to completed
  await supabaseAdmin
    .from('screening_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow,
    },
  };
}

/**
 * GET /api/screenings
 * Returns all screening sessions with joined patients, results, and signed artifact URLs.
 */
screeningRouter.get('/', async (req: Request, res: Response) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({ success: false, error: clientError || 'Database configuration error.' });
  }

  try {
    const typeFilter = req.query.type as string;
    let query = supabaseAdmin
      .from('screening_sessions')
      .select(`
        id,
        doctor_id,
        patient_id,
        screening_type,
        eye_side,
        status,
        started_at,
        completed_at,
        created_at,
        patients (
          id,
          patient_id,
          name,
          age,
          gender,
          phone
        ),
        screening_results (
          id,
          verdict,
          probability,
          severity,
          image_quality,
          model_name,
          model_version,
          clinical_summary,
          recommendations,
          review_status,
          created_at
        ),
        screening_artifacts (
          id,
          artifact_type,
          bucket_id,
          storage_path,
          mime_type,
          file_size_bytes,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (typeFilter) {
      query = query.eq('screening_type', typeFilter);
    }

    // Bound the list payload: heavy JSONB columns (measurements/model_output)
    // are excluded here (detail endpoint serves single records with them).
    // Without a limit + light columns, large workspaces hit Postgres
    // statement timeouts and the UI sees HTTP 500 on /api/screenings.
    query = query.limit(100);

    const { data: sessions, error: fetchErr } = await query;

    if (fetchErr) {
      return res.status(500).json({ success: false, error: fetchErr.message });
    }

    // Process sessions and attach signed URLs for all artifacts
    const enrichedSessions = await Promise.all(
      (sessions || []).map(async (sess: any) => {
        const artifactsList = sess.screening_artifacts || [];
        const signedUrls: Record<string, string> = {};

        for (const art of artifactsList) {
          if (art.storage_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from(art.bucket_id || STORAGE_BUCKET)
              .createSignedUrl(art.storage_path, 86400);
            if (signed?.signedUrl) {
              signedUrls[art.artifact_type] = signed.signedUrl;
            }
          }
        }

        const patientObj = Array.isArray(sess.patients) ? sess.patients[0] : sess.patients;
        const resultObj = Array.isArray(sess.screening_results)
          ? sess.screening_results[0]
          : sess.screening_results;

        return {
          id: sess.id,
          doctorId: sess.doctor_id,
          patientId: patientObj?.patient_id || sess.patient_id,
          patientDbId: sess.patient_id,
          patientName: patientObj?.name || 'Patient information unavailable',
          patientAge: patientObj?.age || 55,
          patientGender: patientObj?.gender || 'Other',
          patientPhone: patientObj?.phone || '',
          screeningType: sess.screening_type,
          eye: sess.eye_side || 'Right Eye',
          status: sess.status,
          date: sess.completed_at
            ? new Date(sess.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : new Date(sess.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          createdAt: sess.created_at,
          completedAt: sess.completed_at,
          result: resultObj,
          artifacts: signedUrls,
          // Mapped fields for direct compatibility with GlaucomaScreeningRecord / ScreeningRecord / CataractScreeningRecord
          drSeverity: resultObj?.severity || resultObj?.verdict || 'No DR',
          confidence: Math.round((resultObj?.probability || 0) * 100),
          cataractPrediction: resultObj?.verdict || 'NORMAL',
          cataractProbability: resultObj?.probability || 0,
          glaucomaPrediction: resultObj?.verdict || 'NORMAL',
          glaucomaProbability: resultObj?.probability || 0,
          glaucomaFlag: resultObj?.verdict === 'GLAUCOMA_SUSPECT',
          verticalCDR: resultObj?.measurements?.vertical_cdr || 0,
          horizontalCDR: resultObj?.measurements?.horizontal_cdr || 0,
          areaCDR: resultObj?.measurements?.area_cdr || 0,
          cdrFeatures: resultObj?.measurements?.cdr_features || {},
          imageQuality: resultObj?.image_quality || 'Good',
          clinicalRecommendation: resultObj?.clinical_summary || '',
          shapImportance: resultObj?.model_output?.glaucoma?.shapImportance || {},
          overallStatus: resultObj?.verdict === 'GLAUCOMA_SUSPECT' || resultObj?.verdict === 'CATARACT' || sess.status === 'Referred' ? 'Referred' : 'Completed',
          imageOriginal: signedUrls['original_fundus'] || signedUrls['original'],
          imageOpticNerve: signedUrls['optic_disc_cup'],
          imageRetinalAnatomy: signedUrls['vessel_segmentation'] || signedUrls['anatomy_map'] || signedUrls['anatomy'],
          imageGradCam: signedUrls['gradcam'] || signedUrls['xai'],
          imageWorkflow: signedUrls['combined_xai'] || signedUrls['workflow'] || signedUrls['combined'],
          imageEyeDetection: signedUrls['eye_box'],
          imageIris: signedUrls['iris'],
          imagePupil: signedUrls['pupil'],
          imageAnatomyCombined: signedUrls['anatomy'] || signedUrls['anatomy_map'],
          imageLesions: signedUrls['lesions'] || signedUrls['lesion_overlay'] || signedUrls['lesion'],
          imageAnatomy: signedUrls['anatomy'] || signedUrls['anatomy_map'] || signedUrls['anatomyCombined'],
          imageCombined: signedUrls['combined'] || signedUrls['combined_xai'] || signedUrls['workflow'],
          reportPdfUrl: signedUrls['report_pdf'],
        };
      })
    );


    return res.json({
      success: true,
      screenings: enrichedSessions,
    });
  } catch (err: any) {
    console.error('[Screening Service] Exception in GET /api/screenings:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/screenings/:id/artifacts/:name
 * Serves an individual screening image artifact with CORS headers.
 * Resolves from local filesystem with comprehensive alias resolution,
 * or falls back to Supabase Storage and caches locally for subsequent requests.
 */
const ARTIFACT_ALIASES: Record<string, string[]> = {
  original: ['original', 'original_fundus', 'canonical'],
  original_fundus: ['original_fundus', 'original', 'canonical'],
  eye_box: ['eye_box', 'eyeDetection', 'eye_detection'],
  eyeDetection: ['eyeDetection', 'eye_box', 'eye_detection'],
  gradcam: ['gradcam', 'xai', 'gradcamOverlay', 'gradcamRoi'],
  xai: ['xai', 'gradcam'],
  workflow: ['workflow', 'combined_xai', 'combined'],
  combined_xai: ['combined_xai', 'combined', 'workflow'],
  combined: ['combined', 'combined_xai', 'workflow'],
  analyzed_region: ['analyzed_region', 'analyzedRegion'],
  analyzedRegion: ['analyzedRegion', 'analyzed_region'],
  opacity_evidence: ['opacity_evidence', 'opacityEvidenceMap'],
  opacityEvidenceMap: ['opacityEvidenceMap', 'opacity_evidence'],
  anatomy: ['anatomy', 'anatomy_map', 'anatomyCombined'],
  anatomy_map: ['anatomy_map', 'anatomy', 'anatomyCombined'],
  lesions: ['lesions', 'lesion', 'lesion_overlay'],
  lesion: ['lesion', 'lesions', 'lesion_overlay'],
  lesion_overlay: ['lesion_overlay', 'lesions', 'lesion'],
  iris: ['iris'],
  pupil: ['pupil'],
  optic_nerve: ['optic_nerve', 'opticNerve', 'optic_disc_cup'],
  opticNerve: ['opticNerve', 'optic_nerve', 'optic_disc_cup'],
  optic_disc_cup: ['optic_disc_cup', 'optic_nerve', 'opticNerve'],
  vessels: ['vessels', 'retinalAnatomy', 'vessel_segmentation'],
  retinalAnatomy: ['retinalAnatomy', 'vessels', 'vessel_segmentation'],
  vessel_segmentation: ['vessel_segmentation', 'vessels', 'retinalAnatomy'],
  report_pdf: ['report.pdf', 'report_pdf.pdf', 'report'],
  'report.pdf': ['report.pdf', 'report_pdf.pdf', 'report'],
};

screeningRouter.get('/:id/artifacts/:name', async (req: Request, res: Response) => {
  const { id, name } = req.params;
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, '');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  const candidateNames = ARTIFACT_ALIASES[cleanName] || [cleanName];
  const extensions = ['.png', '.jpg', '.jpeg', '.pdf', ''];

  // 1. Try local filesystem uploads/screening_results/<cleanId>/<candidate>.*
  const targetDir = path.join(process.cwd(), 'uploads', 'screening_results', cleanId);
  if (fs.existsSync(targetDir)) {
    for (const cName of candidateNames) {
      for (const ext of extensions) {
        const candidate = path.join(targetDir, cName + ext);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const isPdf = candidate.endsWith('.pdf');
          const isJpg = candidate.endsWith('.jpg') || candidate.endsWith('.jpeg');
          const mime = isPdf ? 'application/pdf' : isJpg ? 'image/jpeg' : 'image/png';
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(candidate);
        }
      }
    }
  }

  // 1b. Check sibling directories in uploads/screening_results for potential alias match
  const resultsRoot = path.join(process.cwd(), 'uploads', 'screening_results');
  if (fs.existsSync(resultsRoot)) {
    const allDirs = fs.readdirSync(resultsRoot);
    for (const d of allDirs) {
      if (d === cleanId || d.includes(cleanId) || cleanId.includes(d)) {
        const candidateDir = path.join(resultsRoot, d);
        if (fs.statSync(candidateDir).isDirectory()) {
          for (const cName of candidateNames) {
            for (const ext of extensions) {
              const candidate = path.join(candidateDir, cName + ext);
              if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                const isPdf = candidate.endsWith('.pdf');
                const isJpg = candidate.endsWith('.jpg') || candidate.endsWith('.jpeg');
                const mime = isPdf ? 'application/pdf' : isJpg ? 'image/jpeg' : 'image/png';
                res.setHeader('Content-Type', mime);
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(candidate);
              }
            }
          }
        }
      }
    }
  }

  // 2. Fallback: Query Supabase Storage via screening_artifacts
  try {
    const { client: supabaseAdmin } = getSupabaseAdminClient();
    if (supabaseAdmin) {
      const { data: artRows } = await supabaseAdmin
        .from('screening_artifacts')
        .select('*')
        .eq('screening_session_id', cleanId);

      const matched = (artRows || []).find((a: any) =>
        candidateNames.includes(a.artifact_type)
      );

      if (matched && matched.storage_path) {
        const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage
          .from(matched.bucket_id || STORAGE_BUCKET)
          .download(matched.storage_path);

        if (!dlErr && fileBlob) {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          // Cache locally to disk so subsequent requests are immediate
          try {
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            const ext = matched.mime_type === 'application/pdf' ? '.pdf' : '.png';
            fs.writeFileSync(path.join(targetDir, `${cleanName}${ext}`), buffer);
          } catch {}

          res.setHeader('Content-Type', matched.mime_type || 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(buffer);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Artifact Proxy Warning] ${cleanId}/${cleanName}:`, err.message);
  }

  return res.status(404).json({ error: `Artifact ${cleanName} not found for screening ${cleanId}` });
});

/**
 * GET /api/screenings/:id
 * Retrieves a single screening session with signed artifact URLs and robust fallbacks.
 */
screeningRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({ success: false, error: clientError || 'Database configuration error.' });
  }

  try {
    const { data: sess, error: fetchErr } = await supabaseAdmin
      .from('screening_sessions')
      .select(`
        id,
        doctor_id,
        patient_id,
        screening_type,
        eye_side,
        status,
        started_at,
        completed_at,
        created_at,
        patients (
          id,
          patient_id,
          name,
          age,
          gender,
          phone
        ),
        screening_results (
          id,
          verdict,
          probability,
          severity,
          image_quality,
          measurements,
          model_output,
          model_name,
          model_version,
          clinical_summary,
          recommendations,
          review_status,
          created_at
        ),
        screening_artifacts (
          id,
          artifact_type,
          bucket_id,
          storage_path,
          mime_type,
          file_size_bytes,
          created_at
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !sess) {
      return res.status(404).json({ success: false, error: fetchErr?.message || 'Screening not found.' });
    }

    const artifactsList = sess.screening_artifacts || [];
    const signedUrls: Record<string, string> = {};

    for (const art of artifactsList) {
      if (art.storage_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from(art.bucket_id || STORAGE_BUCKET)
          .createSignedUrl(art.storage_path, 86400);
        if (signed?.signedUrl) {
          signedUrls[art.artifact_type] = signed.signedUrl;
        }
      }
    }

    // Always provide reliable local API artifact URLs as fallbacks
    const reliableArtifacts: Record<string, string> = {
      original: signedUrls['original'] || signedUrls['original_fundus'] || `/api/screenings/${sess.id}/artifacts/original`,
      original_fundus: signedUrls['original_fundus'] || signedUrls['original'] || `/api/screenings/${sess.id}/artifacts/original_fundus`,
      eye_box: signedUrls['eye_box'] || `/api/screenings/${sess.id}/artifacts/eye_box`,
      analyzed_region: signedUrls['analyzed_region'] || `/api/screenings/${sess.id}/artifacts/analyzed_region`,
      opacity_evidence: signedUrls['opacity_evidence'] || `/api/screenings/${sess.id}/artifacts/opacity_evidence`,
      gradcam: signedUrls['gradcam'] || `/api/screenings/${sess.id}/artifacts/gradcam`,
      workflow: signedUrls['workflow'] || signedUrls['combined_xai'] || `/api/screenings/${sess.id}/artifacts/workflow`,
      combined_xai: signedUrls['combined_xai'] || signedUrls['combined'] || `/api/screenings/${sess.id}/artifacts/combined`,
      combined: signedUrls['combined'] || signedUrls['combined_xai'] || `/api/screenings/${sess.id}/artifacts/combined`,
      xai: signedUrls['xai'] || signedUrls['gradcam'] || `/api/screenings/${sess.id}/artifacts/xai`,
      anatomy: signedUrls['anatomy'] || signedUrls['anatomy_map'] || `/api/screenings/${sess.id}/artifacts/anatomy`,
      anatomy_map: signedUrls['anatomy_map'] || signedUrls['anatomy'] || `/api/screenings/${sess.id}/artifacts/anatomy`,
      optic_disc_cup: signedUrls['optic_disc_cup'] || `/api/screenings/${sess.id}/artifacts/optic_disc_cup`,
      vessel_segmentation: signedUrls['vessel_segmentation'] || `/api/screenings/${sess.id}/artifacts/vessel_segmentation`,
      lesions: signedUrls['lesions'] || signedUrls['lesion_overlay'] || `/api/screenings/${sess.id}/artifacts/lesions`,
      lesion_overlay: signedUrls['lesion_overlay'] || signedUrls['lesions'] || `/api/screenings/${sess.id}/artifacts/lesions`,
      report_pdf: signedUrls['report_pdf'] || `/api/screenings/${sess.id}/artifacts/report.pdf`,
      ...signedUrls,
    };

    const patientObj = Array.isArray(sess.patients) ? sess.patients[0] : sess.patients;
    const resultObj = Array.isArray(sess.screening_results)
      ? sess.screening_results[0]
      : sess.screening_results;

    const quant = resultObj?.measurements?.quantitativeAnalysis || resultObj?.model_output?.quantitativeAnalysis || {};

    const screeningData = {
      id: sess.id,
      doctorId: sess.doctor_id,
      patientId: patientObj?.patient_id || sess.patient_id,
      patientDbId: sess.patient_id,
      patientName: patientObj?.name || 'Patient information unavailable',
      patientAge: patientObj?.age || 55,
      patientGender: patientObj?.gender || 'Other',
      patientPhone: patientObj?.phone || '',
      screeningType: sess.screening_type,
      eye: sess.eye_side || 'Right Eye',
      status: sess.status,
      date: sess.completed_at
        ? new Date(sess.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : new Date(sess.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      createdAt: sess.created_at,
      completedAt: sess.completed_at,
      result: resultObj,
      artifacts: reliableArtifacts,
      // DR Mappings
      drSeverity: resultObj?.severity || resultObj?.verdict || 'No DR',
      confidence: Math.round((resultObj?.probability || 0) * 100),
      findings: resultObj?.measurements?.findings || [],
      recommendation: resultObj?.clinical_summary || '',
      // Cataract Mappings
      cataractPrediction: resultObj?.verdict || 'NORMAL',
      cataractProbability: resultObj?.probability || 0,
      normalProbability: typeof quant.normalProbability === 'number'
        ? quant.normalProbability
        : (1 - (resultObj?.probability || 0)),
      eyeDetected: Boolean(resultObj?.measurements?.eyeDetection?.detected),
      eyeConfidence: resultObj?.measurements?.eyeDetection?.confidence || 0,
      irisDetected: Boolean(resultObj?.measurements?.irisLocalization?.detected),
      pupilDetected: Boolean(resultObj?.measurements?.pupilLocalization?.detected),
      quantitativeAnalysis: quant,
      // Glaucoma Mappings
      glaucomaPrediction: resultObj?.verdict || 'NORMAL',
      glaucomaProbability: resultObj?.probability || 0,
      glaucomaFlag: resultObj?.verdict === 'GLAUCOMA_SUSPECT',
      verticalCDR: resultObj?.measurements?.vertical_cdr || 0,
      horizontalCDR: resultObj?.measurements?.horizontal_cdr || 0,
      areaCDR: resultObj?.measurements?.area_cdr || 0,
      cdrFeatures: resultObj?.measurements?.cdr_features || {},
      imageQuality: resultObj?.image_quality || 'Good',
      clinicalRecommendation: resultObj?.clinical_summary || '',
      shapImportance: resultObj?.model_output?.glaucoma?.shapImportance || {},
      overallStatus: resultObj?.verdict === 'GLAUCOMA_SUSPECT' || resultObj?.verdict === 'CATARACT' || sess.status === 'Referred' ? 'Referred' : 'Completed',
      // Artifact URLs guaranteed to be non-empty and non-giant
      imageOriginal: reliableArtifacts.original,
      imageOpticNerve: reliableArtifacts.optic_disc_cup,
      imageRetinalAnatomy: reliableArtifacts.vessel_segmentation,
      imageGradCam: reliableArtifacts.gradcam,
      imageWorkflow: reliableArtifacts.workflow,
      imageEyeDetection: reliableArtifacts.eye_box,
      imageIris: reliableArtifacts.iris || `/api/screenings/${sess.id}/artifacts/iris`,
      imagePupil: reliableArtifacts.pupil || `/api/screenings/${sess.id}/artifacts/pupil`,
      imageAnatomyCombined: reliableArtifacts.anatomy,
      imageAnalyzedRegion: reliableArtifacts.analyzed_region,
      imageOpacityEvidence: reliableArtifacts.opacity_evidence,
      imageLesions: reliableArtifacts.lesions,
      imageAnatomy: reliableArtifacts.anatomy,
      imageCombined: reliableArtifacts.combined_xai,
      reportPdfUrl: reliableArtifacts.report_pdf,
    };

    return res.json({
      success: true,
      screening: screeningData,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/screenings/:id/report-pdf
 * Uploads generated PDF report or serves existing PDF for exact requested screening.
 */
screeningRouter.post('/:id/report-pdf', async (req: Request, res: Response) => {
  const { id } = req.params;
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();

  try {
    const { pdfBase64, doctorId, patientId } = req.body || {};
    const localDir = path.join(process.cwd(), 'uploads', 'screening_results', cleanId);
    const localPdfPath = path.join(localDir, 'report.pdf');

    if (pdfBase64) {
      let rawB64 = pdfBase64;
      if (rawB64.includes(',')) {
        rawB64 = rawB64.split(',')[1];
      }
      const pdfBuffer = Buffer.from(rawB64, 'base64');

      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(localPdfPath, pdfBuffer);

      if (supabaseAdmin) {
        const { data: sess } = await supabaseAdmin
          .from('screening_sessions')
          .select('id, doctor_id, patient_id')
          .eq('id', cleanId)
          .maybeSingle();

        const targetDoctorId = sess?.doctor_id || doctorId || 'unknown-doctor';
        const targetPatientId = sess?.patient_id || patientId || 'unknown-patient';
        const storagePath = `${targetDoctorId}/${targetPatientId}/${cleanId}/report_pdf.pdf`;

        await uploadWithBoundedRetry(supabaseAdmin, STORAGE_BUCKET, storagePath, pdfBuffer, 'application/pdf', 2);

        await supabaseAdmin
          .from('screening_artifacts')
          .upsert({
            screening_session_id: cleanId,
            doctor_id: targetDoctorId,
            patient_id: targetPatientId,
            artifact_type: 'report_pdf',
            bucket_id: STORAGE_BUCKET,
            storage_path: storagePath,
            mime_type: 'application/pdf',
            file_size_bytes: pdfBuffer.length,
          });

        const { data: signed } = await supabaseAdmin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, 86400);

        return res.json({
          success: true,
          pdfUrl: signed?.signedUrl || `/api/screenings/${cleanId}/artifacts/report.pdf`,
          storagePath,
        });
      }

      return res.json({
        success: true,
        pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`,
      });
    }

    // If pdfBase64 was not provided, check if local PDF exists
    if (fs.existsSync(localPdfPath)) {
      return res.json({
        success: true,
        pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`,
      });
    }

    // Return reference to local artifact endpoint for on-demand rendering
    return res.json({
      success: true,
      pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
