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
  callback: (err: Error | null, status: number, data: Buffer) => void
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

  req.setTimeout(25000, () => {
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
  req.setTimeout(25000, () => {
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

    proxyRaw('/ml/analyze', body, contentType, (err, status, data) => {
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
// TRINAY RAG & Voice Proxies
// --------------------------------------------------------------------------
mlRouter.post('/trinay/ask', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/json';

    proxyRaw('/ml/trinay/ask', body, contentType, (err, status, data) => {
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

mlRouter.post('/voice/stt', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'audio/wav';

    proxyRaw('/ml/voice/stt', body, contentType, (err, status, data) => {
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

mlRouter.post('/voice/tts', async (req: Request, res: Response) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers['content-type'] || 'application/json';

    proxyRaw('/ml/voice/tts', body, contentType, (err, status, data) => {
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

