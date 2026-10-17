/**
 * RETINA-X ML API Route
 * Proxies image uploads from the React frontend to the Python ML inference
 * server running at ML_SERVER_URL (default: http://127.0.0.1:5001).
 *
 * Uses multer for multipart parsing, then re-posts to Python with node-fetch.
 */

import { Router, Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import * as stream from 'stream';
import {
  getSupabaseAdminClient,
  resolvePatientDbId,
  persistGlaucomaScreening,
  persistDRScreening,
  persistCataractScreening,
} from './screeningService';

export const mlRouter = Router();

const ML_SERVER_URL = (process.env.ML_SERVER_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

// --------------------------------------------------------------------------
// Simple raw-body pass-through proxy
// We read the body as Buffer, then re-POST to the Python server with
// the original Content-Type so the Flask server sees the multipart data.
// --------------------------------------------------------------------------

function proxyRaw(
  pythonPath: string,
  body: Buffer,
  contentType: string,
  callback: (err: Error | null, status: number, data: Buffer) => void,
  timeoutMs = 180000
) {
  const urlObj = new URL(ML_SERVER_URL + pythonPath);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options: http.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': body.length,
    },
  };

  const req = lib.request(options, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => callback(null, res.statusCode || 500, Buffer.concat(chunks)));
  });

  req.setTimeout(timeoutMs, () => {
    req.destroy(new Error('ML server connection timed out'));
  });

  req.on('error', (e) => callback(e, 500, Buffer.from('{}')));
  req.write(body);
  req.end();
}

function proxyGet(
  pythonPath: string,
  callback: (err: Error | null, status: number, data: Buffer) => void
) {
  const urlObj = new URL(ML_SERVER_URL + pythonPath);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options: http.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname,
    method: 'GET',
  };

  const req = lib.request(options, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => callback(null, res.statusCode || 500, Buffer.concat(chunks)));
  });
  req.setTimeout(60000, () => {
    req.destroy(new Error('ML server connection timed out'));
  });
  req.on('error', (e) => callback(e, 500, Buffer.from('{}')));
  req.end();
}

// --------------------------------------------------------------------------
// Buffer raw request body
// --------------------------------------------------------------------------
function bufferBody(req: Request): Promise<Buffer> {
  if (req.body && Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  }
  if (req.readableEnded) {
    return Promise.resolve(Buffer.from([]));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// --------------------------------------------------------------------------
// Health check
// --------------------------------------------------------------------------
mlRouter.get('/health', (req: Request, res: Response) => {
  proxyGet('/ml/health', (err, status, data) => {
    if (err) {
      res.status(503).json({ error: 'ML server unreachable', detail: err.message });
      return;
    }
    try {
      res.status(status).json(JSON.parse(data.toString()));
    } catch {
      res.status(status).send(data);
    }
  });
});

// --------------------------------------------------------------------------
// Full analysis: quality → severity → TRINAY → XAI
// --------------------------------------------------------------------------
mlRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Extract patient & eye metadata from headers/query
    const patientIdentifier = (req.headers['x-patient-id'] as string) || (req.query.patient_id as string);
    const patientName = (req.headers['x-patient-name'] as string) || (req.query.patient_name as string);
    const patientAge = Number(req.headers['x-patient-age'] || req.query.patient_age) || 55;
    const patientGender = (req.headers['x-patient-gender'] as string) || (req.query.patient_gender as string) || 'Other';
    const patientPhone = (req.headers['x-patient-phone'] as string) || (req.query.patient_phone as string) || '';
    const eyeSide = (req.headers['x-eye-side'] as string) || (req.query.eye_side as string) || 'Right Eye';

    proxyRaw('/ml/analyze', body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }

      // If DR screening ML completed successfully, persist to Supabase Storage & DB
      if (status === 200 && parsed && parsed.severity) {
        const { client: supabaseAdmin } = getSupabaseAdminClient();
        if (supabaseAdmin) {
          try {
            let doctorId: string | null = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.replace(/^Bearer\s+/i, '').trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }

            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .limit(1)
                .maybeSingle();
              doctorId = firstProfile?.id || '00000000-0000-0000-0000-000000000000';
            }

            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );

            const persisted = await persistDRScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );

            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;

            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                combined: persisted.signedArtifacts.combined,
                anatomy: persisted.signedArtifacts.anatomy,
                lesions: persisted.signedArtifacts.lesions,
                optic_disc: persisted.signedArtifacts.optic_disc,
                vessel: persisted.signedArtifacts.vessel,
              };
            }
          } catch (persistErr: any) {
            console.error('[ML Proxy] Error persisting DR screening to Supabase:', persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }

      res.status(status).json(parsed);
    }, 180000);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------------------------------
// Quality only
// --------------------------------------------------------------------------
mlRouter.post('/quality', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    proxyRaw('/ml/quality', body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------------------------------
// Cataract 5-Stage ML Pipeline Proxies
// --------------------------------------------------------------------------
mlRouter.post('/cataract/analyze', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Extract patient & eye metadata from headers/query
    const patientIdentifier = (req.headers['x-patient-id'] as string) || (req.query.patient_id as string);
    const patientName = (req.headers['x-patient-name'] as string) || (req.query.patient_name as string);
    const patientAge = Number(req.headers['x-patient-age'] || req.query.patient_age) || 55;
    const patientGender = (req.headers['x-patient-gender'] as string) || (req.query.patient_gender as string) || 'Other';
    const patientPhone = (req.headers['x-patient-phone'] as string) || (req.query.patient_phone as string) || '';
    const eyeSide = (req.headers['x-eye-side'] as string) || (req.query.eye_side as string) || 'Right Eye';

    proxyRaw('/ml/cataract/analyze', body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }

      // If Cataract screening ML completed successfully, persist to Supabase Storage & DB
      if (status === 200 && parsed && (parsed.status === 'COMPLETE' || parsed.cataract)) {
        const { client: supabaseAdmin } = getSupabaseAdminClient();
        if (supabaseAdmin) {
          try {
            let doctorId: string | null = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.replace(/^Bearer\s+/i, '').trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }

            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .limit(1)
                .maybeSingle();
              doctorId = firstProfile?.id || '00000000-0000-0000-0000-000000000000';
            }

            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );

            const persisted = await persistCataractScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );

            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;

            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                eyeDetection: persisted.signedArtifacts.eye_box,
                iris: persisted.signedArtifacts.iris,
                pupil: persisted.signedArtifacts.pupil,
                anatomy: persisted.signedArtifacts.anatomy,
                gradcam: persisted.signedArtifacts.gradcam,
                workflow: persisted.signedArtifacts.workflow,
              };
            }
          } catch (persistErr: any) {
            console.error('[ML Proxy] Error persisting cataract screening to Supabase:', persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }

      res.status(status).json(parsed);
    }, 180000);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

mlRouter.post('/cataract/quality', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    proxyRaw('/ml/cataract/quality', body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    }, 20000);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------------------------------
// Glaucoma 4-Stage ML Pipeline Proxies (with Supabase DB & Storage Persistence)
// --------------------------------------------------------------------------
mlRouter.post('/glaucoma/analyze', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Extract patient & eye metadata from headers/query
    const patientIdentifier = (req.headers['x-patient-id'] as string) || (req.query.patient_id as string);
    const patientName = (req.headers['x-patient-name'] as string) || (req.query.patient_name as string);
    const patientAge = Number(req.headers['x-patient-age'] || req.query.patient_age) || 55;
    const patientGender = (req.headers['x-patient-gender'] as string) || (req.query.patient_gender as string) || 'Other';
    const patientPhone = (req.headers['x-patient-phone'] as string) || (req.query.patient_phone as string) || '';
    const eyeSide = (req.headers['x-eye-side'] as string) || (req.query.eye_side as string) || 'Right Eye';

    proxyRaw('/ml/glaucoma/analyze', body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }

      // If screening ML completed successfully, persist to Supabase Storage & DB
      if (status === 200 && parsed && parsed.status === 'COMPLETE') {
        const { client: supabaseAdmin } = getSupabaseAdminClient();
        if (supabaseAdmin) {
          try {
            // Identify authenticated doctor / operator
            let doctorId: string | null = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.replace(/^Bearer\s+/i, '').trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }

            // If not authenticated, query first profile/user or fallback
            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .limit(1)
                .maybeSingle();
              doctorId = firstProfile?.id || '00000000-0000-0000-0000-000000000000';
            }

            // Resolve patient UUID in public.patients
            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );

            // Persist screening session, artifacts, results, and generate signed URLs
            const persisted = await persistGlaucomaScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );

            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;

            // Enrich visualizations with direct signed URLs
            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                opticNerve: persisted.signedArtifacts.opticNerve,
                retinalAnatomy: persisted.signedArtifacts.retinalAnatomy,
                gradcam: persisted.signedArtifacts.gradcam,
                workflow: persisted.signedArtifacts.workflow,
              };
            }
          } catch (persistErr: any) {
            console.error('[ML Proxy] Error persisting glaucoma screening to Supabase:', persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }

      res.status(status).json(parsed);
    }, 180000);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

mlRouter.post('/glaucoma/quality', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    proxyRaw('/ml/glaucoma/quality', body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: 'ML server error', detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    }, 20000);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------------------------------
// TRINAY RAG & Voice Proxies
// --------------------------------------------------------------------------
import { GoogleGenAI } from '@google/genai';

mlRouter.post('/trinay/ask', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    let parsedBody;
    try {
      parsedBody = JSON.parse(body.toString());
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    const { question, current_case, language, speak } = parsedBody;

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables' });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `You are TRINAY, an advanced AI ophthalmology assistant. 
    A user is asking a question: "${question}"
    The language you must reply in is: ${language || 'English'}
    
    Here is the context of their current medical case (if any):
    ${current_case ? JSON.stringify(current_case, null, 2) : 'No specific case context provided.'}
    
    Please provide a helpful, medically sound (but clear for patients if applicable), and accurate response. 
    Always reply in the requested language. Do NOT use markdown code blocks for the final response if possible, just natural text with formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({
      answer: response.text,
      sources: ['TRINAY Native AI Agent'],
      modelUsed: 'gemini-2.5-flash',
      audio_b64: null,
      audio_format: null
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

