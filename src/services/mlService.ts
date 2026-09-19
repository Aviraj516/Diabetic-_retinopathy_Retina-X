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
  blood_vessels: { pixels: number; detected: boolean };
  optic_disc: { pixels: number; detected: boolean };
  fovea: { x: number; y: number };
  macula: { detected: boolean };
  retinal_background: { detected: boolean };
}

export interface TrinayResult {
  anatomy: AnatomyData;
  lesions: Record<string, LesionInfo>;
  findings: string[];
  visualizations: {
    canonical: string;  // base64 PNG
    anatomy: string;
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
}

// ----------------------------------------------------------------
// API call
// ----------------------------------------------------------------

const ML_API_BASE = '/api/ml';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Upload a retinal image and run the full ML pipeline.
 * Returns structured results including quality, severity, TRINAY, and XAI.
 */
export async function analyzeRetinalImage(file: File): Promise<MLAnalysisResult> {
  const form = new FormData();
  form.append('image', file, file.name);

  const response = await fetchWithTimeout(`${ML_API_BASE}/analyze`, {
    method: 'POST',
    body: form,
  }, 60000);

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
  }, 20000);

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

/**
 * Transcribe speech audio blob locally using Faster-Whisper.
 */
export async function transcribeSpeech(audioBlob: Blob, language: string = 'English'): Promise<string> {
  const url = `${ML_API_BASE}/voice/stt?language=${encodeURIComponent(language)}`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/wav' },
    body: audioBlob,
  }, 20000);

  if (!response.ok) {
    throw new Error(`STT error: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

/**
 * Synthesize speech audio payload from text using Piper / macOS TTS.
 */
export async function synthesizeSpeech(text: string, language: string = 'English'): Promise<string | null> {
  const response = await fetchWithTimeout(`${ML_API_BASE}/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  }, 15000);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.audio_b64 || null;
}

