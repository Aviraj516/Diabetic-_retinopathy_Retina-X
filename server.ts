import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { adminUserRouter } from './server/api/adminUsers';
import { patientRouter } from './server/api/patientService';
import { authRouter } from './server/api/authService';
import { mlRouter } from './server/api/mlService';

dotenv.config();

let mlProcess: ChildProcess | null = null;

function checkMLServerHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5001/ml/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureMLServerRunning() {
  const isRunning = await checkMLServerHealth();
  if (isRunning) {
    console.log('[RETINA-X ML Server] Already running on http://127.0.0.1:5001');
    return;
  }

  const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
  const scriptPath = path.join(process.cwd(), 'ml_server.py');

  console.log(`[RETINA-X ML Server] Starting Python ML server (${pythonCmd} ${scriptPath})...`);
  mlProcess = spawn(pythonCmd, [scriptPath], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  mlProcess.on('error', (err) => {
    console.error('[RETINA-X ML Server] Failed to start Python process:', err.message);
  });

  mlProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(`[RETINA-X ML Server] Python process exited with code ${code}`);
    }
    mlProcess = null;
  });

  const cleanup = () => {
    if (mlProcess) {
      try {
        mlProcess.kill('SIGTERM');
      } catch { /* ignore */ }
      mlProcess = null;
    }
  };

  process.on('SIGINT', () => { cleanup(); process.exit(); });
  process.on('SIGTERM', () => { cleanup(); process.exit(); });
  process.on('exit', cleanup);
}

async function startServer() {
  await ensureMLServerRunning();

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'RETINA-X Medical AI Platform' });
  });

  // Authentication helper router
  app.use('/api/auth', authRouter);

  // Admin user management router
  app.use('/api/admin', adminUserRouter);

  // Patient management router (Nurse / Admin / Specialist access controlled)
  app.use('/api/patients', patientRouter);

  // ML inference proxy (forwards image uploads to Python ML server on port 5001)
  app.use('/api/ml', mlRouter);

  // Vite middleware for development vs static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RETINA-X Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
