import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { hasDatabaseConfig, getConnectionString, pool } from './src/db/index.ts';
import { handleLocalFileApiRequest } from './src/db/localFileStore.ts';
import {
  ensureSeeded,
  authenticateWithCredentials,
  authenticateStudentByNimAndName,
  getOrCreateUser,
  getFullSystemState,
  createWebsiteSettingRecord,
  updateWebsiteSettingRecord,
  deleteWebsiteSettingRecord,
  createFacultyRecord,
  updateFacultyRecord,
  deleteFacultyRecord,
  createStudyProgramRecord,
  updateStudyProgramRecord,
  deleteStudyProgramRecord,
  createClassRecord,
  updateClassRecord,
  deleteClassRecord,
  createCourseRecord,
  updateCourseRecord,
  deleteCourseRecord,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  createStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
  importStudentsBatch,
  createQuestionRecord,
  importQuestionRecords,
  updateQuestionRecord,
  deleteQuestionRecord,
  createExamRecord,
  updateExamConfig,
  deleteExamRecord,
  startOrResumeExamSession,
  recordExamSnapshot,
  getSnapshotImageData,
  deleteSnapshotRecord,
  purgeSnapshotRecords,
  recordViolationEvent,
  saveStudentAnswer,
  finalizeExamSubmission,
  updateEssayScoreAndVerifyResult,
  verifyViolationRecord,
} from './src/db/repository.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

export const app = express();
const httpServer = createServer(app);

// Increase payload limit for webcam base64 snapshots & website photo uploads
app.use(express.json({ limit: '20mb' }));

// Serve compressed snapshot files directly from disk with browser caching
const uploadsDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }));

// Prevent Vercel Edge/browser caching on dynamic CBT API JSON responses
app.use('/api', (req, res, next) => {
  if (!req.path.endsWith('/image')) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// Lightweight health check without exposing secrets
app.get('/api/health', async (_req, res) => {
  const conn = getConnectionString();
  const configured = hasDatabaseConfig();
  let dbReachable = false;
  if (configured) {
    try {
      await pool.query('SELECT 1');
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }
  const mode = configured
    ? conn?.includes('supabase')
      ? 'supabase'
      : 'postgres'
    : process.env.VERCEL
      ? 'browser-fallback'
      : 'local-file-db';
  res.json({ ok: true, mode, dbReachable });
});

// Automatic database routing:
// - If Supabase / PostgreSQL env vars are set -> uses PostgreSQL (Supabase/Cloud SQL)
// - On personal Node.js hosting without Supabase env vars -> uses persistent local JSON file DB (./data/mazcodeid-cbt-db.json)
// - On Vercel without DB env vars -> triggers client browser fallback cleanly
app.use('/api', (req, res, next) => {
  if (!hasDatabaseConfig()) {
    if (process.env.VERCEL) {
      return res.status(503).json({
        vercelFallbackRequired: true,
        error: 'Database eksternal belum dikonfigurasi pada environment ini.',
      });
    }
    return handleLocalFileApiRequest(req, res);
  }
  next();
});

let wss: WebSocketServer | null = null;
if (!process.env.VERCEL) {
  wss = new WebSocketServer({
    server: httpServer,
    path: '/ws-proctoring',
  });

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'proctoring:connected',
        payload: { status: 'Real-Time Proctoring Channel Active' },
        timestamp: new Date().toISOString(),
      })
    );
  });
}

const broadcastEvent = (type: string, payload: unknown) => {
  if (!wss) return;
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

function registerRoutes() {
  // Public endpoint to get active website identity/photo for Login Portal
  app.get('/api/public/website-settings', async (_req, res) => {
    try {
      const state = await getFullSystemState();
      const activeSetting =
        state.websiteSettings.find((w) => w.isActive) ||
        state.websiteSettings[0];
      res.json({
        activeSetting,
        allSettings: state.websiteSettings,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Gagal memuat identitas website.',
      });
    }
  });

  // Credential login endpoint (validates username/email and password against PostgreSQL)
  app.post('/api/auth/institutional-login', async (req, res) => {
    try {
      await ensureSeeded();
      const { email, password } = req.body || {};
      const user = await authenticateWithCredentials(email, password);
      const token = `unikma-session:${user.uid}:${user.email}:${user.roleName}`;
      res.json({ user, token });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.toLowerCase().includes('database')) {
        return res.status(503).json({
          vercelFallbackRequired: true,
          error: msg,
        });
      }
      res.status(401).json({
        error: msg || 'Email atau kata sandi tidak valid.',
      });
    }
  });

  // Student login endpoint (validates NIM + Nama Lengkap against PostgreSQL students table)
  app.post('/api/auth/student-login', async (req, res) => {
    try {
      await ensureSeeded();
      const { nim, fullName } = req.body || {};
      const { user, student } = await authenticateStudentByNimAndName(
        nim,
        fullName
      );
      const token = `unikma-session:${user.uid}:${user.email}:${user.roleName}`;
      res.json({ user, student, token });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.toLowerCase().includes('database')) {
        return res.status(503).json({
          vercelFallbackRequired: true,
          error: msg,
        });
      }
      res.status(401).json({
        error:
          msg ||
          'Kombinasi NIM dan Nama Lengkap mahasiswa tidak valid.',
      });
    }
  });

  // Sync Firebase OAuth user with PostgreSQL database
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid || `uid-${Date.now()}`;
      const email = req.user?.email || 'muhtyasyugi@unikma.ac.id';
      const preferredRole =
        req.body?.preferredRole || (req.user as any)?.role || 'admin';
      const fullName = req.body?.fullName || (req.user as any)?.name;

      const user = await getOrCreateUser(uid, email, preferredRole, fullName);
      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // Main system state endpoint
  app.get('/api/cbt/state', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const state = await getFullSystemState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat data CBT.' });
    }
  });

  // CRUD Website Settings (Foto, Nama Website, Tagline, Universitas, dll)
  app.post(
    '/api/cbt/website-settings',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const created = await createWebsiteSettingRecord(req.body);
        broadcastEvent('state:refresh', { entity: 'website_settings' });
        res.json(created);
      } catch (error: any) {
        res.status(500).json({
          error: error.message || 'Gagal menambah pengaturan website.',
        });
      }
    }
  );

  app.put(
    '/api/cbt/website-settings/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateWebsiteSettingRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'website_settings' });
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({
          error: error.message || 'Gagal memperbarui pengaturan website.',
        });
      }
    }
  );

  app.delete(
    '/api/cbt/website-settings/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteWebsiteSettingRecord(id);
        broadcastEvent('state:refresh', { entity: 'website_settings' });
        res.json(result);
      } catch (error: any) {
        res.status(500).json({
          error: error.message || 'Gagal menghapus pengaturan website.',
        });
      }
    }
  );

  // CRUD Faculties
  app.post('/api/cbt/faculties', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createFacultyRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'faculties' });
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan fakultas.' });
    }
  });

  app.put(
    '/api/cbt/faculties/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateFacultyRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'faculties' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui fakultas.' });
      }
    }
  );

  app.delete(
    '/api/cbt/faculties/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteFacultyRecord(id);
        broadcastEvent('state:refresh', { entity: 'faculties' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus fakultas.' });
      }
    }
  );

  // CRUD Study Programs
  app.post(
    '/api/cbt/study-programs',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const created = await createStudyProgramRecord(req.body);
        broadcastEvent('state:refresh', { entity: 'study_programs' });
        res.json(created);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Gagal menyimpan prodi.' });
      }
    }
  );

  app.put(
    '/api/cbt/study-programs/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateStudyProgramRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'study_programs' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui prodi.' });
      }
    }
  );

  app.delete(
    '/api/cbt/study-programs/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteStudyProgramRecord(id);
        broadcastEvent('state:refresh', { entity: 'study_programs' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus prodi.' });
      }
    }
  );

  // CRUD Classes (Data Master Kelas & Semester)
  app.post('/api/cbt/classes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createClassRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'classes' });
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan kelas.' });
    }
  });

  app.put(
    '/api/cbt/classes/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateClassRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'classes' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui kelas.' });
      }
    }
  );

  app.delete(
    '/api/cbt/classes/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteClassRecord(id);
        broadcastEvent('state:refresh', { entity: 'classes' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus kelas.' });
      }
    }
  );

  // CRUD Courses (Mata Kuliah)
  app.post('/api/cbt/courses', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createCourseRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'courses' });
      res.json(created);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal menyimpan mata kuliah.' });
    }
  });

  app.put(
    '/api/cbt/courses/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateCourseRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'courses' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui mata kuliah.' });
      }
    }
  );

  app.delete(
    '/api/cbt/courses/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteCourseRecord(id);
        broadcastEvent('state:refresh', { entity: 'courses' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus mata kuliah.' });
      }
    }
  );

  // CRUD Users (Manajemen Pengguna)
  app.post('/api/cbt/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createUserAccount(req.body);
      broadcastEvent('state:refresh', { entity: 'users' });
      res.json(created);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal menambah pengguna.' });
    }
  });

  app.put('/api/cbt/users/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await updateUserAccount(id, req.body);
      broadcastEvent('state:refresh', { entity: 'users' });
      res.json(updated);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal memperbarui pengguna.' });
    }
  });

  app.delete(
    '/api/cbt/users/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteUserAccount(id);
        broadcastEvent('state:refresh', { entity: 'users' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus pengguna.' });
      }
    }
  );

  // CRUD Data Mahasiswa (Dedicated menu Mahasiswa)
  app.post('/api/cbt/students', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createStudentRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'students' });
      res.json(created);
    } catch (error: any) {
      res
        .status(400)
        .json({ error: error.message || 'Gagal menambahkan data mahasiswa.' });
    }
  });

  app.put(
    '/api/cbt/students/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateStudentRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'students' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(400)
          .json({ error: error.message || 'Gagal memperbarui data mahasiswa.' });
      }
    }
  );

  app.delete(
    '/api/cbt/students/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteStudentRecord(id);
        broadcastEvent('state:refresh', { entity: 'students' });
        res.json(result);
      } catch (error: any) {
        res
          .status(400)
          .json({ error: error.message || 'Gagal menghapus data mahasiswa.' });
      }
    }
  );

  app.post(
    '/api/cbt/students/import',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
          return res
            .status(400)
            .json({ error: 'Tidak ada data mahasiswa untuk diimpor.' });
        }
        const summary = await importStudentsBatch(items);
        broadcastEvent('state:refresh', { entity: 'students' });
        res.json(summary);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal mengimpor data mahasiswa.' });
      }
    }
  );

  // CRUD Questions (Bank Soal)
  app.post('/api/cbt/questions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createQuestionRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'questions' });
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan soal.' });
    }
  });

  app.put(
    '/api/cbt/questions/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateQuestionRecord(id, req.body);
        broadcastEvent('state:refresh', { entity: 'questions' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui soal.' });
      }
    }
  );

  app.post(
    '/api/cbt/questions/import',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { items } = req.body;
        const createdList = Array.isArray(items)
          ? await importQuestionRecords(items)
          : [];
        broadcastEvent('state:refresh', { entity: 'questions' });
        res.json({ importedCount: createdList.length, items: createdList });
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal mengimpor soal.' });
      }
    }
  );

  app.delete(
    '/api/cbt/questions/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteQuestionRecord(id);
        broadcastEvent('state:refresh', { entity: 'questions' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus soal.' });
      }
    }
  );

  // CRUD Exams
  app.post('/api/cbt/exams', requireAuth, async (req: AuthRequest, res) => {
    try {
      const created = await createExamRecord(req.body);
      broadcastEvent('state:refresh', { entity: 'exams' });
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal membuat ujian.' });
    }
  });

  app.patch(
    '/api/cbt/exams/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const updated = await updateExamConfig(id, req.body);
        broadcastEvent('state:refresh', { entity: 'exams' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui ujian.' });
      }
    }
  );

  app.put('/api/cbt/exams/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await updateExamConfig(id, req.body);
      broadcastEvent('state:refresh', { entity: 'exams' });
      res.json(updated);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal memperbarui ujian.' });
    }
  });

  app.delete(
    '/api/cbt/exams/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const result = await deleteExamRecord(id);
        broadcastEvent('state:refresh', { entity: 'exams' });
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menghapus ujian.' });
      }
    }
  );

  // Exam Sessions & Proctoring
  app.post(
    '/api/cbt/sessions/start',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const session = await startOrResumeExamSession(req.body);
        broadcastEvent('session:updated', session);
        res.json(session);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memulai sesi ujian.' });
      }
    }
  );

  const handleRecordSnapshot = async (req: AuthRequest, res: express.Response) => {
    try {
      const snapshot = await recordExamSnapshot(req.body);
      broadcastEvent('snapshot:captured', snapshot);
      res.json(snapshot);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal menyimpan snapshot.' });
    }
  };

  app.post('/api/cbt/sessions/snapshot', requireAuth, handleRecordSnapshot);
  app.post('/api/cbt/snapshots', requireAuth, handleRecordSnapshot);

  // Lazy-load image endpoint (no requireAuth so <img> tags load directly; supports legacy data: URLs & disk files)
  app.get('/api/cbt/snapshots/:id/image', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'ID snapshot tidak valid.' });
      }
      const imgData = await getSnapshotImageData(id);
      if (!imgData) {
        return res.status(404).json({ error: 'Snapshot tidak ditemukan.' });
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (imgData.filePath) {
        return res.sendFile(imgData.filePath, (err) => {
          if (err && !res.headersSent) {
            res.status(404).json({ error: 'File gambar snapshot tidak ditemukan.' });
          }
        });
      }
      if (imgData.buffer && imgData.mimeType) {
        res.setHeader('Content-Type', imgData.mimeType);
        return res.send(imgData.buffer);
      }
      if (imgData.redirectUrl) {
        return res.redirect(imgData.redirectUrl);
      }
      return res.status(404).json({ error: 'Gambar snapshot tidak tersedia.' });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal memuat gambar snapshot.' });
    }
  });

  app.delete('/api/cbt/snapshots/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const result = await deleteSnapshotRecord(id);
      broadcastEvent('state:refresh', { entity: 'snapshots' });
      res.json(result);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal menghapus snapshot.' });
    }
  });

  app.post('/api/cbt/snapshots/purge', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await purgeSnapshotRecords(req.body || {});
      broadcastEvent('state:refresh', { entity: 'snapshots' });
      res.json(result);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal membersihkan snapshot.' });
    }
  });

  const handleRecordViolation = async (req: AuthRequest, res: express.Response) => {
    try {
      const outcome = await recordViolationEvent(req.body);
      broadcastEvent('violation:detected', outcome);
      res.json(outcome);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal mencatat pelanggaran.' });
    }
  };

  app.post('/api/cbt/sessions/violation', requireAuth, handleRecordViolation);
  app.post('/api/cbt/violations', requireAuth, handleRecordViolation);

  const handleSaveAnswer = async (req: AuthRequest, res: express.Response) => {
    try {
      const saved = await saveStudentAnswer(req.body);
      broadcastEvent('answer:saved', {
        sessionId: req.body.sessionId,
        questionId: req.body.questionId,
      });
      res.json(saved);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || 'Gagal menyimpan jawaban.' });
    }
  };

  app.post('/api/cbt/sessions/answer', requireAuth, handleSaveAnswer);
  app.post('/api/cbt/sessions/autosave', requireAuth, handleSaveAnswer);

  app.post(
    '/api/cbt/sessions/submit',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const result = await finalizeExamSubmission(req.body);
        broadcastEvent('exam:submitted', result.result);
        res.json(result);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal mengumpulkan ujian.' });
      }
    }
  );

  app.patch(
    '/api/cbt/results/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const resultId = Number(req.params.id);
        const updated = await updateEssayScoreAndVerifyResult({
          resultId,
          ...req.body,
        });
        broadcastEvent('state:refresh', { entity: 'results' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal memperbarui nilai.' });
      }
    }
  );

  app.post(
    '/api/cbt/results/grade-essay',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const resultId = Number(req.body?.resultId);
        if (!resultId) {
          return res.json({ saved: true });
        }
        const updated = await updateEssayScoreAndVerifyResult({
          resultId,
          essayScore: Number(req.body?.essayScore) || 0,
          verificationStatus:
            req.body?.verificationStatus || 'Sudah Diverifikasi',
          isPublished: req.body?.isPublished ?? true,
        });
        broadcastEvent('state:refresh', { entity: 'results' });
        res.json(updated);
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Gagal menyimpan nilai esai.' });
      }
    }
  );

  const handleVerifyViolation = async (req: AuthRequest, res: express.Response) => {
    try {
      const violationId = Number(req.params.id);
      const updated = await verifyViolationRecord({
        violationId,
        ...req.body,
      });
      broadcastEvent('state:refresh', { entity: 'violations' });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Gagal memverifikasi pelanggaran.',
      });
    }
  };

  app.patch('/api/cbt/violations/:id', requireAuth, handleVerifyViolation);
  app.post('/api/cbt/violations/:id/verify', requireAuth, handleVerifyViolation);
}

registerRoutes();

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const cwdDist = path.join(process.cwd(), 'dist');
    const fileDirDist = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'dist'
    );
    const distPath = fs.existsSync(cwdDist) ? cwdDist : fileDirDist;
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MazCodeID SMART CBT Server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
