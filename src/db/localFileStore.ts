import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import type { CbtSystemState } from '../types/cbt.ts';
import {
  createInitialFallbackState,
  handleClientFallbackRequest,
  LocalStateAdapter,
} from '../utils/clientCbtFallback.ts';

function resolveLocalDbFilePath(): string {
  if (process.env.LOCAL_DB_PATH) {
    return path.resolve(process.env.LOCAL_DB_PATH);
  }
  if (process.env.VERCEL) {
    return path.join('/tmp', 'mazcodeid-cbt-db.json');
  }
  return path.resolve(process.cwd(), 'data', 'mazcodeid-cbt-db.json');
}

let cachedState: CbtSystemState | null = null;

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadLocalFileDbState(): CbtSystemState {
  if (cachedState) {
    return cachedState;
  }

  const dbFilePath = resolveLocalDbFilePath();
  try {
    if (fs.existsSync(dbFilePath)) {
      const raw = fs.readFileSync(dbFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as CbtSystemState;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        cachedState = parsed;
        return cachedState;
      }
    }
  } catch (err) {
    console.warn('Warning: gagal membaca file database lokal, membuat ulang dari snapshot:', err);
  }

  const initial = createInitialFallbackState();
  saveLocalFileDbState(initial);
  return initial;
}

export function saveLocalFileDbState(nextState: CbtSystemState): void {
  cachedState = nextState;
  const dbFilePath = resolveLocalDbFilePath();
  try {
    ensureDir(dbFilePath);
    const tmpPath = `${dbFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(nextState), 'utf-8');
    fs.renameSync(tmpPath, dbFilePath);
  } catch (err) {
    console.error('Gagal menyimpan database file lokal:', err);
  }
}

const fileAdapter: LocalStateAdapter = {
  load: loadLocalFileDbState,
  save: saveLocalFileDbState,
};

export function handleLocalFileApiRequest(req: Request, res: Response): void {
  const cleanPath = req.originalUrl.split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  // Check snapshot binary/dataUrl retrieval for <img> tags
  const snapImgMatch = /^\/api\/cbt\/snapshots\/(\d+)\/image$/.exec(cleanPath);
  if (snapImgMatch && method === 'GET') {
    const id = Number(snapImgMatch[1]);
    const state = loadLocalFileDbState();
    const snap = state.snapshots.find((s) => s.id === id);
    if (!snap || !snap.imageDataUrl) {
      res.status(404).json({ error: 'Snapshot tidak ditemukan.' });
      return;
    }
    const dataMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(
      snap.imageDataUrl
    );
    if (dataMatch) {
      res.setHeader('Content-Type', dataMatch[1]);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(dataMatch[2], 'base64'));
      return;
    }
    res.redirect(snap.imageDataUrl);
    return;
  }

  // Protected routes check Authorization Bearer header (same contract as requireAuth)
  const isPublicRoute =
    cleanPath === '/api/public/website-settings' ||
    cleanPath === '/api/auth/institutional-login' ||
    cleanPath === '/api/auth/student-login' ||
    cleanPath === '/api/health';

  if (!isPublicRoute) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ') || authHeader.length < 15) {
      res.status(401).json({ error: 'Sesi otentikasi tidak ditemukan.' });
      return;
    }
  }

  try {
    const result = handleClientFallbackRequest(
      cleanPath,
      method,
      req.body,
      fileAdapter
    );
    res.json(result);
  } catch (err: any) {
    const isAuthRoute = cleanPath.startsWith('/api/auth/');
    res.status(isAuthRoute ? 401 : 400).json({
      error: err?.message || 'Gagal memproses permintaan di database lokal.',
    });
  }
}
