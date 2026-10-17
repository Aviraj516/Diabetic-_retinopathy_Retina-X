/**
 * RETINA-X Frontend ML Service
 * Sends retinal images to the Express ML proxy → Python inference server.
 * Returns structured results for Quality, DR Severity, TRINAY, and XAI.
 */

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface ImageInfo {
  filename: string;
  fileSize: string;
  resolution: string;
  width: number;
  height: number;
}

export interface QualityResult {
  quality: 'Good' | 'Borderline' | 'Ungradable';
  confidence: Record<string, number>;
  features: {
    sharpness: number;
    brightness: number;
    illumination: number;
    contrast: number;
    noise: number;
    fov: number;
  };
}

export interface SeverityResult {
  drSeverity: string;
  drSeverityLevel: string;
  confidence: number;
  recommendation: string;
  probabilities: Record<string, number>;
}

export interface LesionInfo {
  detected: boolean;
  regions: number;
  pixels: number;
}

export interface AnatomyData {
  blood_vessels: { pixels: number; detected: boolean; density?: number; macular_density?: number; branches?: number };
  optic_disc: { pixels: number; detected: boolean; pixels_orig?: number; center?: [number, number]; center_orig?: [number, number]; diameter_model_px?: number; diameter_orig_px?: number };
  fovea: { x: number; y: number; x_orig?: number; y_orig?: number; disc_distance?: number; disc_distance_orig_px?: number; disc_distance_dd?: number; coordinate_system?: string; plausible?: boolean };
  macula: { detected: boolean; estimated?: boolean; is_segmented?: boolean; method?: string; radius_px?: number; radius_orig_px?: number };
  retinal_background: { detected: boolean };
  diagnostic?: Record<string, any>;
  measurements?: Record<string, any>;
}

export interface TrinayResult {
  anatomy: AnatomyData;
  lesions: Record<string, LesionInfo>;
  findings: string[];
  visualizations: {
    canonical: string;  // base64 PNG
    anatomy: string;
    debug_anatomy?: string;
    lesion: string;
    combined: string;
  };
}

export interface XaiResult {
  vessel: string | null;
  optic_disc: string | null;
  fovea: string | null;
  anatomy_combined: string;
  lesion_combined: string;
  combined: string;
  lesions: Record<string, string>; // "MA" | "HE" | "EX" | "SE" → base64
}

export interface MLAnalysisResult {
  imageInfo: ImageInfo;
  quality: QualityResult;
  stopped: boolean;
  stopReason?: string;
  severity?: SeverityResult;
  trinay?: TrinayResult;
  xai?: XaiResult;
  xaiError?: string;
  error?: string;
  reportId?: string;
  // Backend-persisted Supabase screening session id (set by /api/ml/analyze
  // after persisting to screening_sessions). The DR flow uses it as the local
  // record id so refetch/realtime dedups by id and counts stay in sync.
  screening_id?: string;
  screening_session_id?: string;
  patient_db_id?: string;
  persisted?: boolean;
}

// ----------------------------------------------------------------
// API call
// ----------------------------------------------------------------

const ML_API_BASE = '/api/ml';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 180000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => {
    try {
      controller.abort(new DOMException('ML model analysis timed out while processing image.', 'TimeoutError'));
    } catch {
      controller.abort();
    }
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (
      err.name === 'AbortError' ||
      err.name === 'TimeoutError' ||
      err.message?.toLowerCase().includes('aborted') ||
      err.message?.toLowerCase().includes('signal')
    ) {
      throw new Error('Analysis timed out while models were processing. Please retry.');
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Upload a retinal image and run the full ML pipeline.
 * Returns structured results including quality, severity, TRINAY, and XAI.
 */
export async function analyzeRetinalImage(
  file: File,
  options?: {
    patientId?: string;
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    patientPhone?: string;
    eyeSide?: string;
  }
): Promise<MLAnalysisResult> {
  const form = new FormData();
  form.append('image', file, file.name);

  const headers: Record<string, string> = {};

  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (err) {
    console.warn('[mlService] Supabase session retrieval warning:', err);
  }

  if (options?.patientId) {
    form.append('patientId', options.patientId);
    form.append('patient_id', options.patientId);
    headers['x-patient-id'] = options.patientId;
  }
  if (options?.patientName) {
    form.append('patientName', options.patientName);
    form.append('patient_name', options.patientName);
    headers['x-patient-name'] = options.patientName;
  }
  if (options?.patientAge) {
    form.append('patientAge', String(options.patientAge));
    headers['x-patient-age'] = String(options.patientAge);
  }
  if (options?.patientGender) {
    form.append('patientGender', options.patientGender);
    headers['x-patient-gender'] = options.patientGender;
  }
  if (options?.patientPhone) {
    form.append('patientPhone', options.patientPhone);
    headers['x-patient-phone'] = options.patientPhone;
  }
  if (options?.eyeSide) {
    form.append('eyeSide', options.eyeSide);
    form.append('eye', options.eyeSide);
    headers['x-eye-side'] = options.eyeSide;
  }

  const response = await fetchWithTimeout(`${ML_API_BASE}/analyze`, {
    method: 'POST',
    headers,
    body: form,
  }, 180000);

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(`ML server error: ${errMsg}`);
  }

  return response.json() as Promise<MLAnalysisResult>;
}

/**
 * Check if the ML server is reachable and all models are loaded.
 */
export async function checkMLHealth(): Promise<{ status: string; device: string; models: Record<string, boolean> }> {
  const response = await fetchWithTimeout(`${ML_API_BASE}/health`, {}, 5000);
  if (!response.ok) {
    throw new Error('ML server is not reachable');
  }
  return response.json();
}

/**
 * Build a data URL from a base64-encoded PNG string returned by the ML server.
 */
export function b64ToPngUrl(b64: string): string {
  return `data:image/png;base64,${b64}`;
}

export interface TrinayAskResponse {
  answer: string;
  sources?: string[];
  modelUsed?: string;
  audio_b64?: string | null;
  audio_format?: string | null;
}

/**
 * Send a question to TRINAY RAG backend along with the current image case context.
 */
export async function askTrinay(
  question: string,
  currentCase?: Record<string, any> | null,
  language: string = 'English',
  speak: boolean = false
): Promise<TrinayAskResponse> {
  const response = await fetchWithTimeout(`${ML_API_BASE}/trinay/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      current_case: currentCase,
      language,
      speak,
    }),
  }, 60000);

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch { /* ignore */ }
    throw new Error(`TRINAY RAG error: ${errMsg}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    throw new Error(`Server response error (${response.status}): Expected JSON but received HTML/text. Ensure backend server is running.`);
  }

  return response.json();
}

// ----------------------------------------------------------------
// Cataract 5-Stage ML Pipeline API
// ----------------------------------------------------------------

export interface CataractMLResult {
  imageInfo: ImageInfo;
  quality: {
    status: 'GOOD' | 'BAD';
    isGood: boolean;
    goodProbability: number;
    badProbability: number;
    threshold: number;
  };
  status: 'COMPLETE' | 'IMAGE_QUALITY_INSUFFICIENT' | 'NO_EYE_DETECTED';
  message?: string;
  eyeDetection?: {
    detected: boolean;
    confidence: number;
    box: [number, number, number, number];
    roiBox?: [number, number, number, number];
  };
  irisLocalization?: {
    detected: boolean;
    areaPixels: number;
    diameterPx?: number;
    center?: [number, number];
  };
  pupilLocalization?: {
    detected: boolean;
    areaPixels: number;
    diameterPx?: number;
    center?: [number, number];
    pupilIrisRatio?: number;
  };
  cataract?: {
    prediction: 'NORMAL' | 'CATARACT';
    cataractProbability: number;
    normalProbability: number;
    confidence: number;
    threshold: number;
    severityGrade: string;
    clinicalRecommendation: string;
    quantitativeAnalysis?: {
      analyzedRegionAreaPx?: number;
      opacityEvidenceAreaPx?: number;
      opacityEvidencePercentage?: number;
      cataractProbabilityPct?: number;
      normalProbabilityPct?: number;
      evidenceIntensity?: 'LOW' | 'MODERATE' | 'HIGH';
      evidenceCoveragePct?: number;
      evidenceMethod?: string;
      highEvidencePx?: number;
      moderateEvidencePx?: number;
      lowEvidencePx?: number;
    };
  };
  screening_id?: string;
  session_id?: string;
  id?: string;
  quantitativeAnalysis?: {
    analyzedRegionAreaPx?: number;
    opacityEvidenceAreaPx?: number;
    opacityEvidencePercentage?: number;
    cataractProbabilityPct?: number;
    normalProbabilityPct?: number;
    // AI Evidence Intensity derived from the CURRENT screening's evidence map
    // (same tier masks as overlay + pixel counts). NOT clinical severity.
    evidenceIntensity?: 'LOW' | 'MODERATE' | 'HIGH';
    evidenceCoveragePct?: number;
    evidenceMethod?: string;
    highEvidencePx?: number;
    moderateEvidencePx?: number;
    lowEvidencePx?: number;
    centralVsPeripheralDistribution?: string;
    disclaimer?: string;
  };
  artifacts?: Record<string, string>;
  visualizations?: {
    original?: string;
    analyzedRegion?: string;
    opacityEvidenceMap?: string;
    eyeDetection?: string;
    iris?: string;
    pupil?: string;
    anatomy?: string;
    gradcam?: string;
    gradcamOverlay?: string;
    gradcamRoi?: string;
    workflow?: string;
    xai?: string;
  };
  error?: string;
}

/**
 * Upload an anterior eye image and run the real 5-stage cataract ML pipeline:
 * 1. Image Quality (MobileNetV3-Small) -> STOP if bad
 * 2. Eye Detection (YOLO11n) -> orange bounding box
 * 3. Iris Localization (U-Net) -> green boundary
 * 4. Pupil Localization (U-Net) -> cyan boundary
 * 5. Cataract Classification (EfficientNet-V2-S + CBAM)
 * + Real Grad-CAM & 6-panel workflow visualizations.
 */
export async function analyzeCataractImage(
  file: File,
  options?: {
    screeningId?: string;
    patientId?: string;
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    patientPhone?: string;
    eyeSide?: string;
  }
): Promise<CataractMLResult> {
  const form = new FormData();
  form.append('image', file, file.name);
  if (options?.screeningId) {
    form.append('screeningId', options.screeningId);
  }

  const headers: Record<string, string> = {};

  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (err) {
    console.warn('[mlService] Supabase session retrieval warning:', err);
  }

  if (options?.patientId) {
    form.append('patientId', options.patientId);
    form.append('patient_id', options.patientId);
    headers['x-patient-id'] = options.patientId;
  }
  if (options?.patientName) {
    form.append('patientName', options.patientName);
    form.append('patient_name', options.patientName);
    headers['x-patient-name'] = options.patientName;
  }
  if (options?.patientAge) {
    form.append('patientAge', String(options.patientAge));
    headers['x-patient-age'] = String(options.patientAge);
  }
  if (options?.patientGender) {
    form.append('patientGender', options.patientGender);
    headers['x-patient-gender'] = options.patientGender;
  }
  if (options?.patientPhone) {
    form.append('patientPhone', options.patientPhone);
    headers['x-patient-phone'] = options.patientPhone;
  }
  if (options?.eyeSide) {
    form.append('eyeSide', options.eyeSide);
    form.append('eye', options.eyeSide);
    headers['x-eye-side'] = options.eyeSide;
  }

  const response = await fetchWithTimeout(`${ML_API_BASE}/cataract/analyze`, {
    method: 'POST',
    headers,
    body: form,
  }, 180000);

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(`Cataract pipeline error: ${errMsg}`);
  }

  return response.json() as Promise<CataractMLResult>;
}

/**
 * Quality check only for an eye image.
 */
export async function checkCataractQuality(file: File): Promise<{
  status: 'GOOD' | 'RETAKE_IMAGE';
  is_good: boolean;
  good_probability: number;
  bad_probability: number;
  threshold: number;
}> {
  const form = new FormData();
  form.append('image', file, file.name);

  const response = await fetchWithTimeout(`${ML_API_BASE}/cataract/quality`, {
    method: 'POST',
    body: form,
  }, 60000);

  if (!response.ok) {
    throw new Error(`Cataract quality check error: HTTP ${response.status}`);
  }

  return response.json();
}

// ----------------------------------------------------------------
// Glaucoma 4-Stage ML Pipeline API
// ----------------------------------------------------------------

export interface GlaucomaMLResult {
  imageInfo: ImageInfo;
  quality: QualityResult;
  status: 'COMPLETE' | 'IMAGE_QUALITY_INSUFFICIENT' | 'SEGMENTATION_UNGRADABLE' | 'INCONCLUSIVE' | 'ERROR';
  screeningStatus?: string;
  segmentationStatus?: string;
  message?: string;
  discCupSegmentation?: {
    status?: string;
    validationStatus?: string;
    isValid?: boolean;
    discDetected: boolean;
    cupDetected: boolean;
    cupInsideDisc?: boolean;
    discPath?: string;
    cupPath?: string;
    verticalCDR: number;
    horizontalCDR: number;
    areaCDR: number;
    rimArea?: number;
    cdrFeatures: {
      status?: string;
      vertical_cdr: number;
      horizontal_cdr: number;
      area_cdr: number;
      disc_area: number;
      cup_area: number;
      rim_area?: number;
      disc_width: number;
      disc_height: number;
      cup_width: number;
      cup_height: number;
      cup_inside_ratio: number;
      disc_x?: number;
      disc_y?: number;
      cup_x?: number;
      cup_y?: number;
    };
  };
  vesselSegmentation?: {
    detected: boolean;
    pixels: number;
    density: number;
  };
  glaucoma?: {
    prediction: 'NORMAL' | 'GLAUCOMA_SUSPECT' | 'INCONCLUSIVE' | 'UNGRADABLE';
    glaucomaProbability: number;
    normalProbability: number;
    confidence: number;
    glaucomaFlag: boolean;
    clinicalRecommendation: string;
    shapImportance: Record<string, number>;
  };
  screening_id?: string;
  screening_session_id?: string;
  patient_db_id?: string;
  artifacts?: Record<string, string>;
  signedVisualizations?: {
    original?: string;
    opticNerve?: string;
    rim?: string;
    retinalAnatomy?: string;
    gradcam?: string;
    workflow?: string;
  };
  visualizations?: {
    original?: string;
    opticNerve?: string;
    rim?: string;
    retinalAnatomy?: string;
    gradcam?: string;
    workflow?: string;
  };
  bokehInteractiveHtml?: string;
  error?: string;
}

/**
 * Upload a retinal fundus image and run the real 4-stage glaucoma ML pipeline:
 * 1. Image Quality (Random Forest 6-feature)
 * 2. Optic Disc & Cup Segmentation (Attention U-Net) -> 10 CDR morphological features
 * 3. Retinal Blood Vessel Segmentation (EfficientNet-B0 U-Net)
 * 4. Glaucoma Classification (Random Forest) + SHAP feature attribution + Grad-CAM heatmap
 * + 4-panel clinical workflow visualization & interactive Bokeh analysis.
 *
 * Automatically attaches authenticated JWT and patient identifiers for seamless Supabase storage and table persistence.
 */
export async function analyzeGlaucomaImage(
  file: File,
  options?: {
    patientId?: string;
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    patientPhone?: string;
    eyeSide?: string;
    screeningId?: string;
  }
): Promise<GlaucomaMLResult> {
  const form = new FormData();
  form.append('image', file, file.name);
  if (options?.screeningId) {
    form.append('screeningId', options.screeningId);
  }

  const headers: Record<string, string> = {};

  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (isSupabaseConfigured()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (err) {
    console.warn('[mlService] Supabase session retrieval warning:', err);
  }

  if (options?.patientId) {
    form.append('patientId', options.patientId);
    form.append('patient_id', options.patientId);
    headers['x-patient-id'] = options.patientId;
  }
  if (options?.patientName) {
    form.append('patientName', options.patientName);
    form.append('patient_name', options.patientName);
    headers['x-patient-name'] = options.patientName;
  }
  if (options?.patientAge) {
    form.append('patientAge', String(options.patientAge));
    headers['x-patient-age'] = String(options.patientAge);
  }
  if (options?.patientGender) {
    form.append('patientGender', options.patientGender);
    headers['x-patient-gender'] = options.patientGender;
  }
  if (options?.patientPhone) {
    form.append('patientPhone', options.patientPhone);
    headers['x-patient-phone'] = options.patientPhone;
  }
  if (options?.eyeSide) {
    form.append('eyeSide', options.eyeSide);
    form.append('eye', options.eyeSide);
    headers['x-eye-side'] = options.eyeSide;
  }
  if (options?.screeningId) {
    form.append('screeningId', options.screeningId);
    headers['x-screening-id'] = options.screeningId;
  }

  const response = await fetchWithTimeout(`${ML_API_BASE}/glaucoma/analyze`, {
    method: 'POST',
    headers,
    body: form,
  }, 180000);

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(`Glaucoma pipeline error: ${errMsg}`);
  }

  return response.json() as Promise<GlaucomaMLResult>;
}

/**
 * Quality check only for a glaucoma fundus image.
 */
export async function checkGlaucomaQuality(file: File): Promise<QualityResult> {
  const form = new FormData();
  form.append('image', file, file.name);

  const response = await fetchWithTimeout(`${ML_API_BASE}/glaucoma/quality`, {
    method: 'POST',
    body: form,
  }, 60000);

  if (!response.ok) {
    throw new Error(`Glaucoma quality check error: HTTP ${response.status}`);
  }

  return response.json();
}


