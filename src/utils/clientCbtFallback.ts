import { CbtSystemState, QuestionOptionRecord, StudentRecord, UserRecord } from '../types/cbt.ts';
import initialSeedSnapshot from '../db/initialSeedSnapshot.json';
import {
  computeGradeLetter,
  computeWarningLevel,
  evaluateExamSubmission,
  matchesStudentCredentials,
} from './cbtLogic.ts';

const STORAGE_KEY = 'mazcodeid_cbt_vercel_state_v2';

const DEFAULT_HERO_IMG =
  '/src/assets/images/unikma_campus_hero_1794677775495.jpg';

export interface ParsedHttpResponse {
  isJson: boolean;
  status: number;
  ok: boolean;
  data: any;
  rawText: string;
}

export async function safeParseJsonResponse(res: Response): Promise<ParsedHttpResponse> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      isJson: false,
      status: res.status,
      ok: res.ok,
      data: null,
      rawText,
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    return {
      isJson: typeof parsed === 'object' && parsed !== null,
      status: res.status,
      ok: res.ok,
      data: parsed,
      rawText,
    };
  } catch {
    return {
      isJson: false,
      status: res.status,
      ok: res.ok,
      data: null,
      rawText,
    };
  }
}

export function shouldUseClientFallback(parsed: ParsedHttpResponse): boolean {
  if (!parsed.isJson) return true;
  if (
    parsed.status === 404 ||
    parsed.status === 502 ||
    parsed.status === 503 ||
    parsed.status === 504
  ) {
    return true;
  }
  if (parsed.data?.vercelFallbackRequired === true) {
    return true;
  }
  if (parsed.status === 500) {
    const errText = String(parsed.data?.error || '').toLowerCase();
    if (
      errText.includes('gagal menginisialisasi sistem database') ||
      errText.includes('econnrefused') ||
      errText.includes('enotfound') ||
      errText.includes('connection terminated') ||
      errText.includes('database')
    ) {
      return true;
    }
  }
  return false;
}

export function createInitialFallbackState(): CbtSystemState {
  return JSON.parse(JSON.stringify(initialSeedSnapshot)) as CbtSystemState;
}

function loadFallbackState(): CbtSystemState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialFallbackState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialFallbackState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as CbtSystemState;
    // Ensure super admin always exists
    const hasAdmin = parsed.users?.some(
      (u) => u.email.toLowerCase() === 'muhtyasyugi@unikma.ac.id'
    );
    if (!hasAdmin) {
      parsed.users = [
        ...(parsed.users || []),
        ...createInitialFallbackState().users,
      ];
    }
    return parsed;
  } catch {
    return createInitialFallbackState();
  }
}

function saveFallbackState(state: CbtSystemState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function nextId(items: Array<{ id: number }>): number {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export interface LocalStateAdapter {
  load: () => CbtSystemState;
  save: (state: CbtSystemState) => void;
}

export function handleClientFallbackRequest(
  url: string,
  method: string,
  body?: any,
  adapter?: LocalStateAdapter
): any {
  const cleanMethod = (method || 'GET').toUpperCase();
  const cleanPath = url.split('?')[0];
  const state = adapter ? adapter.load() : loadFallbackState();
  const persistState = (next: CbtSystemState) => {
    if (adapter) {
      adapter.save(next);
    } else {
      saveFallbackState(next);
    }
  };

  // 1. Public website settings
  if (cleanPath === '/api/public/website-settings' && cleanMethod === 'GET') {
    const activeSetting =
      state.websiteSettings.find((w) => w.isActive) || state.websiteSettings[0];
    return {
      activeSetting,
      allSettings: state.websiteSettings,
    };
  }

  // 2. Institutional Login (Admin / Dosen)
  if (cleanPath === '/api/auth/institutional-login' && cleanMethod === 'POST') {
    const cleanEmail = String(body?.email || '').trim().toLowerCase();
    const cleanPass = String(body?.password || '').trim();
    const matchedUser = state.users.find(
      (u) => u.email.toLowerCase() === cleanEmail
    );
    if (!matchedUser) {
      throw new Error('Akun dengan email/username tersebut tidak ditemukan.');
    }
    if (!matchedUser.isActive) {
      throw new Error('Akun ini sedang dinonaktifkan oleh Administrator.');
    }
    const expectedPass = matchedUser.passwordHash || 'muhtyasyugi@123';
    if (expectedPass !== cleanPass) {
      throw new Error('Kata sandi tidak sesuai. Silakan periksa kembali.');
    }
    const token = `unikma-session:${matchedUser.uid}:${matchedUser.email}:${matchedUser.roleName}`;
    return { user: matchedUser, token };
  }

  // 3. Student Login (NIM + Nama Lengkap)
  if (cleanPath === '/api/auth/student-login' && cleanMethod === 'POST') {
    const cleanNim = String(body?.nim || '').trim();
    const cleanName = String(body?.fullName || '').trim();
    if (!cleanNim || !cleanName) {
      throw new Error('NIM dan Nama Lengkap wajib diisi untuk login mahasiswa.');
    }
    const matchedStudent = state.students.find((s) =>
      matchesStudentCredentials(s, cleanNim, cleanName)
    );
    if (!matchedStudent) {
      throw new Error(
        'Data mahasiswa tidak ditemukan atau kombinasi NIM dan Nama Lengkap tidak sesuai.'
      );
    }
    const userRecord = state.users.find((u) => u.id === matchedStudent.userId);
    if (!userRecord) {
      throw new Error('Akun pengguna mahasiswa belum terhubung dengan sistem.');
    }
    if (!userRecord.isActive) {
      throw new Error('Akun mahasiswa ini sedang dinonaktifkan oleh Administrator.');
    }
    const token = `unikma-session:${userRecord.uid}:${userRecord.email}:${userRecord.roleName}`;
    return { user: userRecord, student: matchedStudent, token };
  }

  // 3b. OAuth / Firebase User Sync
  if (cleanPath === '/api/auth/sync' && cleanMethod === 'POST') {
    const cleanEmail = String(body?.email || 'muhtyasyugi@unikma.ac.id')
      .trim()
      .toLowerCase();
    let user = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      const roleName = (body?.preferredRole || 'admin') as 'admin' | 'dosen' | 'mahasiswa';
      user = {
        id: nextId(state.users),
        uid: body?.uid || `uid-sync-${Date.now()}`,
        email: cleanEmail,
        passwordHash: 'muhtyasyugi@123',
        fullName: body?.fullName || cleanEmail.split('@')[0],
        roleId: roleName === 'admin' ? 1 : roleName === 'dosen' ? 2 : 3,
        roleName,
        avatarUrl: '',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      state.users.push(user);
      persistState(state);
    }
    return { user };
  }

  // 4. Full System State
  if (cleanPath === '/api/cbt/state' && cleanMethod === 'GET') {
    return state;
  }

  // 5. Website Settings
  if (cleanPath === '/api/cbt/website-settings' && cleanMethod === 'POST') {
    const id = nextId(state.websiteSettings);
    if (body?.isActive) {
      state.websiteSettings.forEach((w) => {
        w.isActive = false;
      });
    }
    const created = {
      id,
      siteName: body?.siteName || 'MazCodeID SMART CBT',
      universityName: body?.universityName || 'MazCodeID',
      tagline: body?.tagline || '',
      description: body?.description || '',
      logoText: body?.logoText || 'MCD',
      logoImageUrl: body?.logoImageUrl || '',
      heroImageUrl: body?.heroImageUrl || DEFAULT_HERO_IMG,
      contactEmail: body?.contactEmail || '',
      footerText: body?.footerText || '',
      isActive: body?.isActive ?? true,
      updatedAt: new Date().toISOString(),
    };
    state.websiteSettings.unshift(created);
    persistState(state);
    return created;
  }

  const websiteMatch = /^\/api\/cbt\/website-settings\/(\d+)$/.exec(cleanPath);
  if (websiteMatch) {
    const id = Number(websiteMatch[1]);
    if (cleanMethod === 'PUT') {
      if (body?.isActive) {
        state.websiteSettings.forEach((w) => {
          w.isActive = false;
        });
      }
      const idx = state.websiteSettings.findIndex((w) => w.id === id);
      if (idx !== -1) {
        state.websiteSettings[idx] = {
          ...state.websiteSettings[idx],
          ...body,
          id,
          updatedAt: new Date().toISOString(),
        };
        persistState(state);
        return state.websiteSettings[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.websiteSettings = state.websiteSettings.filter((w) => w.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 6. Faculties
  if (cleanPath === '/api/cbt/faculties' && cleanMethod === 'POST') {
    const created = {
      id: nextId(state.faculties),
      code: String(body?.code || '').trim(),
      name: String(body?.name || '').trim(),
      deanName: String(body?.deanName || '').trim(),
    };
    state.faculties.push(created);
    persistState(state);
    return created;
  }
  const facultyMatch = /^\/api\/cbt\/faculties\/(\d+)$/.exec(cleanPath);
  if (facultyMatch) {
    const id = Number(facultyMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.faculties.findIndex((f) => f.id === id);
      if (idx !== -1) {
        state.faculties[idx] = { ...state.faculties[idx], ...body, id };
        persistState(state);
        return state.faculties[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.faculties = state.faculties.filter((f) => f.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 7. Study Programs
  if (cleanPath === '/api/cbt/study-programs' && cleanMethod === 'POST') {
    const created = {
      id: nextId(state.studyPrograms),
      code: String(body?.code || '').trim(),
      name: String(body?.name || '').trim(),
      degree: body?.degree || 'S1',
      facultyId: body?.facultyId ? Number(body.facultyId) : null,
      headName: String(body?.headName || '').trim(),
    };
    state.studyPrograms.push(created);
    persistState(state);
    return created;
  }
  const prodiMatch = /^\/api\/cbt\/study-programs\/(\d+)$/.exec(cleanPath);
  if (prodiMatch) {
    const id = Number(prodiMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.studyPrograms.findIndex((p) => p.id === id);
      if (idx !== -1) {
        state.studyPrograms[idx] = {
          ...state.studyPrograms[idx],
          ...body,
          facultyId: body?.facultyId ? Number(body.facultyId) : null,
          id,
        };
        persistState(state);
        return state.studyPrograms[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.studyPrograms = state.studyPrograms.filter((p) => p.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 8. Classes
  if (cleanPath === '/api/cbt/classes' && cleanMethod === 'POST') {
    const created = {
      id: nextId(state.classes),
      code: String(body?.code || '').trim(),
      name: String(body?.name || '').trim(),
      semester: Number(body?.semester) || 1,
      academicYear: body?.academicYear || '2026/2027 Ganjil',
      studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
      capacity: Number(body?.capacity) || 40,
    };
    state.classes.push(created);
    persistState(state);
    return created;
  }
  const classMatch = /^\/api\/cbt\/classes\/(\d+)$/.exec(cleanPath);
  if (classMatch) {
    const id = Number(classMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.classes.findIndex((c) => c.id === id);
      if (idx !== -1) {
        state.classes[idx] = {
          ...state.classes[idx],
          ...body,
          semester: Number(body?.semester) || 1,
          studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
          capacity: Number(body?.capacity) || 40,
          id,
        };
        persistState(state);
        return state.classes[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.classes = state.classes.filter((c) => c.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 9. Courses (Mata Kuliah)
  if (cleanPath === '/api/cbt/courses' && cleanMethod === 'POST') {
    const created = {
      id: nextId(state.courses),
      code: String(body?.code || '').trim(),
      name: String(body?.name || '').trim(),
      sks: Number(body?.sks) || 3,
      semester: Number(body?.semester) || 1,
      studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
      lecturerId: body?.lecturerId ? Number(body.lecturerId) : null,
      description: body?.description || '',
    };
    state.courses.push(created);
    persistState(state);
    return created;
  }
  const courseMatch = /^\/api\/cbt\/courses\/(\d+)$/.exec(cleanPath);
  if (courseMatch) {
    const id = Number(courseMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.courses.findIndex((c) => c.id === id);
      if (idx !== -1) {
        state.courses[idx] = {
          ...state.courses[idx],
          ...body,
          sks: Number(body?.sks) || 3,
          semester: Number(body?.semester) || 1,
          studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
          lecturerId: body?.lecturerId ? Number(body.lecturerId) : null,
          id,
        };
        persistState(state);
        return state.courses[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.courses = state.courses.filter((c) => c.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 10. Students & Batch Import
  const createSingleStudentInFallback = (item: any): StudentRecord => {
    const cleanNim = String(item?.nim || '').trim();
    const cleanName = String(item?.fullName || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!cleanNim || !cleanName) {
      throw new Error('NIM dan Nama Lengkap wajib diisi.');
    }
    const duplicate = state.students.some(
      (s) => s.nim.toLowerCase() === cleanNim.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`NIM ${cleanNim} sudah terdaftar.`);
    }
    const userId = nextId(state.users);
    const email =
      String(item?.email || '').trim() || `${cleanNim}@student.mazcode.id`;
    const newUser: UserRecord = {
      id: userId,
      uid: `uid-mhs-${cleanNim}-${Date.now()}`,
      email,
      passwordHash: cleanNim,
      fullName: cleanName,
      roleId: 3,
      roleName: 'mahasiswa',
      avatarUrl: item?.avatarUrl || '',
      isActive: item?.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    state.users.push(newUser);

    const newStudent: StudentRecord = {
      id: nextId(state.students),
      userId,
      nim: cleanNim,
      fullName: cleanName,
      facultyId: item?.facultyId ? Number(item.facultyId) : null,
      studyProgramId: item?.studyProgramId ? Number(item.studyProgramId) : null,
      classId: item?.classId ? Number(item.classId) : null,
      semester: Number(item?.semester) || 1,
      enrollmentYear: Number(item?.enrollmentYear) || 2026,
      avatarUrl: item?.avatarUrl || '',
    };
    state.students.push(newStudent);
    return newStudent;
  };

  if (cleanPath === '/api/cbt/students' && cleanMethod === 'POST') {
    const created = createSingleStudentInFallback(body);
    persistState(state);
    return created;
  }

  if (cleanPath === '/api/cbt/students/import' && cleanMethod === 'POST') {
    const items = Array.isArray(body?.items) ? body.items : [];
    const createdItems: StudentRecord[] = [];
    const errors: Array<{ row: number; nim: string; message: string }> = [];
    for (let i = 0; i < items.length; i++) {
      try {
        createdItems.push(createSingleStudentInFallback(items[i]));
      } catch (err: any) {
        errors.push({
          row: i + 1,
          nim: String(items[i]?.nim || ''),
          message: err?.message || 'Gagal mengimpor baris mahasiswa.',
        });
      }
    }
    persistState(state);
    return {
      importedCount: createdItems.length,
      skippedCount: errors.length,
      errors,
      items: createdItems,
    };
  }

  const studentMatch = /^\/api\/cbt\/students\/(\d+)$/.exec(cleanPath);
  if (studentMatch) {
    const id = Number(studentMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.students.findIndex((s) => s.id === id);
      if (idx !== -1) {
        const target = state.students[idx];
        state.students[idx] = {
          ...target,
          nim: String(body?.nim || target.nim).trim(),
          fullName: String(body?.fullName || target.fullName).trim(),
          facultyId: body?.facultyId ? Number(body.facultyId) : null,
          studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
          classId: body?.classId ? Number(body.classId) : null,
          semester: Number(body?.semester) || target.semester,
          enrollmentYear: Number(body?.enrollmentYear) || target.enrollmentYear,
          avatarUrl: body?.avatarUrl ?? target.avatarUrl,
        };
        const uIdx = state.users.findIndex((u) => u.id === target.userId);
        if (uIdx !== -1) {
          state.users[uIdx] = {
            ...state.users[uIdx],
            fullName: state.students[idx].fullName,
            email: body?.email || state.users[uIdx].email,
            isActive: body?.isActive ?? state.users[uIdx].isActive,
            avatarUrl: body?.avatarUrl ?? state.users[uIdx].avatarUrl,
          };
        }
        persistState(state);
        return state.students[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      const target = state.students.find((s) => s.id === id);
      state.students = state.students.filter((s) => s.id !== id);
      if (target) {
        state.users = state.users.filter((u) => u.id !== target.userId);
      }
      persistState(state);
      return { deleted: true };
    }
  }

  // 11. Users (Manajemen Pengguna)
  if (cleanPath === '/api/cbt/users' && cleanMethod === 'POST') {
    const roleName = (body?.roleName || 'dosen') as 'admin' | 'dosen' | 'mahasiswa';
    const roleId = roleName === 'admin' ? 1 : roleName === 'dosen' ? 2 : 3;
    const userId = nextId(state.users);
    const created: UserRecord = {
      id: userId,
      uid: `uid-${roleName}-${Date.now()}`,
      email: String(body?.email || '').trim(),
      passwordHash: String(body?.password || 'mazcode123').trim(),
      fullName: String(body?.fullName || '').trim(),
      roleId,
      roleName,
      avatarUrl: body?.avatarUrl || '',
      isActive: body?.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    state.users.push(created);
    if (roleName === 'dosen') {
      state.lecturers.push({
        id: nextId(state.lecturers),
        userId,
        nidn: body?.nidn || `NIDN-${userId}`,
        fullName: created.fullName,
        facultyId: body?.facultyId ? Number(body.facultyId) : null,
        studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
        specialization: body?.specialization || 'Dosen Pengampu',
      });
    } else if (roleName === 'mahasiswa') {
      state.students.push({
        id: nextId(state.students),
        userId,
        nim: body?.nim || `MHS-${userId}`,
        fullName: created.fullName,
        facultyId: body?.facultyId ? Number(body.facultyId) : null,
        studyProgramId: body?.studyProgramId ? Number(body.studyProgramId) : null,
        classId: body?.classId ? Number(body.classId) : null,
        semester: Number(body?.semester) || 1,
        enrollmentYear: Number(body?.enrollmentYear) || 2026,
        avatarUrl: created.avatarUrl,
      });
    }
    persistState(state);
    return created;
  }

  const userMatch = /^\/api\/cbt\/users\/(\d+)$/.exec(cleanPath);
  if (userMatch) {
    const id = Number(userMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.users.findIndex((u) => u.id === id);
      if (idx !== -1) {
        const current = state.users[idx];
        const roleName = (body?.roleName || current.roleName) as
          | 'admin'
          | 'dosen'
          | 'mahasiswa';
        state.users[idx] = {
          ...current,
          email: body?.email ? String(body.email).trim() : current.email,
          fullName: body?.fullName ? String(body.fullName).trim() : current.fullName,
          passwordHash: body?.password
            ? String(body.password).trim()
            : current.passwordHash,
          roleName,
          roleId: roleName === 'admin' ? 1 : roleName === 'dosen' ? 2 : 3,
          avatarUrl: body?.avatarUrl ?? current.avatarUrl,
          isActive: body?.isActive ?? current.isActive,
        };
        persistState(state);
        return state.users[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.users = state.users.filter((u) => u.id !== id);
      state.lecturers = state.lecturers.filter((l) => l.userId !== id);
      state.students = state.students.filter((s) => s.userId !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 12. Questions (Bank Soal)
  const buildQuestionOptions = (
    questionId: number,
    rawOptions: any[]
  ): QuestionOptionRecord[] => {
    if (!Array.isArray(rawOptions)) return [];
    return rawOptions.map((opt, idx) => ({
      id: idx + 1,
      questionId,
      optionLabel: opt.optionLabel || String.fromCharCode(65 + idx),
      optionText: opt.optionText || '',
      isCorrect: Boolean(opt.isCorrect),
    }));
  };

  if (cleanPath === '/api/cbt/questions' && cleanMethod === 'POST') {
    const id = nextId(state.questions);
    const created = {
      id,
      courseId: body?.courseId ? Number(body.courseId) : null,
      examId: body?.examId ? Number(body.examId) : null,
      questionType: body?.questionType || 'pilihan_ganda',
      difficulty: body?.difficulty || 'Sedang',
      questionText: body?.questionText || '',
      mediaType: body?.mediaType || 'none',
      mediaContent: body?.mediaContent || null,
      weight: Number(body?.weight) || 10,
      correctAnswerKey: body?.correctAnswerKey || 'A',
      explanation: body?.explanation || '',
      options: buildQuestionOptions(id, body?.options || []),
    };
    state.questions.push(created);
    persistState(state);
    return created;
  }

  if (cleanPath === '/api/cbt/questions/import' && cleanMethod === 'POST') {
    const items = Array.isArray(body?.items) ? body.items : [];
    const createdList = items.map((item: any) => {
      const id = nextId(state.questions);
      const q = {
        id,
        courseId: item?.courseId ? Number(item.courseId) : null,
        examId: item?.examId ? Number(item.examId) : null,
        questionType: item?.questionType || 'pilihan_ganda',
        difficulty: item?.difficulty || 'Sedang',
        questionText: item?.questionText || '',
        mediaType: item?.mediaType || 'none',
        mediaContent: item?.mediaContent || null,
        weight: Number(item?.weight) || 10,
        correctAnswerKey: item?.correctAnswerKey || 'A',
        explanation: item?.explanation || '',
        options: buildQuestionOptions(id, item?.options || []),
      };
      state.questions.push(q);
      return q;
    });
    persistState(state);
    return { importedCount: createdList.length, items: createdList };
  }

  const questionMatch = /^\/api\/cbt\/questions\/(\d+)$/.exec(cleanPath);
  if (questionMatch) {
    const id = Number(questionMatch[1]);
    if (cleanMethod === 'PUT') {
      const idx = state.questions.findIndex((q) => q.id === id);
      if (idx !== -1) {
        state.questions[idx] = {
          ...state.questions[idx],
          ...body,
          courseId: body?.courseId ? Number(body.courseId) : null,
          examId: body?.examId ? Number(body.examId) : null,
          weight: Number(body?.weight) || 10,
          options: buildQuestionOptions(id, body?.options || []),
          id,
        };
        persistState(state);
        return state.questions[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.questions = state.questions.filter((q) => q.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 13. Exams (Manajemen Ujian)
  if (cleanPath === '/api/cbt/exams' && cleanMethod === 'POST') {
    const created = {
      id: nextId(state.exams),
      code: body?.code || `CBT-${Date.now()}`,
      title: body?.title || 'Ujian Baru',
      courseId: body?.courseId ? Number(body.courseId) : null,
      lecturerId: body?.lecturerId ? Number(body.lecturerId) : null,
      classId: body?.classId ? Number(body.classId) : null,
      examType: body?.examType || 'UTS',
      durationMinutes: Number(body?.durationMinutes) || 90,
      startTime: body?.startTime || new Date().toISOString(),
      endTime: body?.endTime || new Date(Date.now() + 7200000).toISOString(),
      totalQuestions: Number(body?.totalQuestions) || 10,
      passingGrade: Number(body?.passingGrade) || 70,
      randomizeQuestions: Boolean(body?.randomizeQuestions ?? true),
      randomizeOptions: Boolean(body?.randomizeOptions ?? true),
      maxAttempts: Number(body?.maxAttempts) || 1,
      requireCamera: Boolean(body?.requireCamera ?? true),
      requireFullscreen: Boolean(body?.requireFullscreen ?? true),
      snapshotCount: Number(body?.snapshotCount) || 3,
      maxViolations: Number(body?.maxViolations) || 3,
      violationAction: body?.violationAction || 'peringatan_bertahap',
      status: body?.status || 'Aktif',
      resultsPublished: Boolean(body?.resultsPublished ?? true),
    };
    state.exams.push(created);
    persistState(state);
    return created;
  }

  const examMatch = /^\/api\/cbt\/exams\/(\d+)$/.exec(cleanPath);
  if (examMatch) {
    const id = Number(examMatch[1]);
    if (cleanMethod === 'PUT' || cleanMethod === 'PATCH') {
      const idx = state.exams.findIndex((e) => e.id === id);
      if (idx !== -1) {
        state.exams[idx] = {
          ...state.exams[idx],
          ...body,
          courseId:
            body?.courseId !== undefined
              ? body.courseId
                ? Number(body.courseId)
                : null
              : state.exams[idx].courseId,
          lecturerId:
            body?.lecturerId !== undefined
              ? body.lecturerId
                ? Number(body.lecturerId)
                : null
              : state.exams[idx].lecturerId,
          classId:
            body?.classId !== undefined
              ? body.classId
                ? Number(body.classId)
                : null
              : state.exams[idx].classId,
          durationMinutes:
            body?.durationMinutes !== undefined
              ? Number(body.durationMinutes) || 90
              : state.exams[idx].durationMinutes,
          id,
        };
        persistState(state);
        return state.exams[idx];
      }
    }
    if (cleanMethod === 'DELETE') {
      state.exams = state.exams.filter((e) => e.id !== id);
      persistState(state);
      return { deleted: true };
    }
  }

  // 14. Exam Sessions, Snapshots, Violations, Answers, Submit
  if (cleanPath === '/api/cbt/sessions/start' && cleanMethod === 'POST') {
    const examId = Number(body?.examId);
    const studentId = Number(body?.studentId);
    let existing = state.sessions.find(
      (s) => s.examId === examId && s.studentId === studentId
    );
    if (!existing) {
      const exam = state.exams.find((e) => e.id === examId);
      existing = {
        id: nextId(state.sessions),
        examId,
        studentId,
        status: 'berlangsung',
        cameraStatus: 'aktif',
        connectionStatus: 'online',
        fullscreenStatus: true,
        snapshot1Status: 'belum',
        snapshot2Status: 'belum',
        snapshot3Status: 'belum',
        violationCount: 0,
        warningLevel: 0,
        remainingSeconds: (exam?.durationMinutes || 60) * 60,
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      state.sessions.push(existing);
      persistState(state);
    }
    return existing;
  }

  if (
    (cleanPath === '/api/cbt/snapshots' ||
      cleanPath === '/api/cbt/sessions/snapshot') &&
    cleanMethod === 'POST'
  ) {
    const snap = {
      id: nextId(state.snapshots),
      sessionId: Number(body?.sessionId) || 1,
      examId: Number(body?.examId) || 1,
      studentId: Number(body?.studentId) || 1,
      nim: body?.nim || '-',
      studentName: body?.studentName || 'Mahasiswa',
      courseName: body?.courseName || 'Ujian CBT',
      sequenceNumber: Number(body?.sequenceNumber) || 1,
      triggerStage: body?.triggerStage || 'awal',
      status: body?.status || 'berhasil',
      imageDataUrl: body?.imageDataUrl || '',
      retryCount: Number(body?.retryCount) || 0,
      capturedAt: new Date().toISOString(),
    };
    state.snapshots.unshift(snap);
    persistState(state);
    return snap;
  }

  if (cleanPath === '/api/cbt/snapshots/purge' && cleanMethod === 'POST') {
    const deletedCount = state.snapshots.length;
    state.snapshots = [];
    persistState(state);
    return { deletedCount };
  }

  const snapDeleteMatch = /^\/api\/cbt\/snapshots\/(\d+)$/.exec(cleanPath);
  if (snapDeleteMatch && cleanMethod === 'DELETE') {
    const id = Number(snapDeleteMatch[1]);
    state.snapshots = state.snapshots.filter((s) => s.id !== id);
    persistState(state);
    return { deleted: true };
  }

  if (
    (cleanPath === '/api/cbt/violations' ||
      cleanPath === '/api/cbt/sessions/violation') &&
    cleanMethod === 'POST'
  ) {
    const sessionId = Number(body?.sessionId) || 1;
    const session = state.sessions.find((s) => s.id === sessionId);
    const nextCount = (session?.violationCount || 0) + 1;
    const warning = computeWarningLevel(nextCount);
    if (session) {
      session.violationCount = nextCount;
      session.warningLevel = warning.level;
    }
    const violation = {
      id: nextId(state.violations),
      sessionId,
      examId: Number(body?.examId) || 1,
      studentId: Number(body?.studentId) || 1,
      nim: body?.nim || '-',
      studentName: body?.studentName || 'Mahasiswa',
      courseName: body?.courseName || 'Ujian CBT',
      violationType: body?.violationType || 'tab_switch',
      warningLevel: warning.level,
      description: body?.description || warning.message,
      verifiedByAdmin: false,
      actionTaken: warning.label,
      detectedAt: new Date().toISOString(),
    };
    state.violations.unshift(violation);
    persistState(state);
    return { violation, warning, session };
  }

  const violationVerifyMatch = /^\/api\/cbt\/violations\/(\d+)(\/verify)?$/.exec(
    cleanPath
  );
  if (
    violationVerifyMatch &&
    (cleanMethod === 'POST' || cleanMethod === 'PATCH')
  ) {
    const id = Number(violationVerifyMatch[1]);
    const v = state.violations.find((item) => item.id === id);
    if (v) {
      v.verifiedByAdmin = true;
      v.actionTaken = body?.actionTaken || 'Diverifikasi Pengawas';
      persistState(state);
    }
    return v || { verified: true };
  }

  if (
    (cleanPath === '/api/cbt/sessions/autosave' ||
      cleanPath === '/api/cbt/sessions/answer') &&
    cleanMethod === 'POST'
  ) {
    const sessionId = Number(body?.sessionId);
    const questionId = Number(body?.questionId);
    const existingIdx = state.answers.findIndex(
      (a) => a.sessionId === sessionId && a.questionId === questionId
    );
    const record = {
      id:
        existingIdx !== -1
          ? state.answers[existingIdx].id
          : nextId(state.answers),
      sessionId,
      questionId,
      answerValue: String(body?.answerValue ?? ''),
      isDoubtful: Boolean(body?.isDoubtful),
      scoreEarned: 0,
    };
    if (existingIdx !== -1) {
      state.answers[existingIdx] = record;
    } else {
      state.answers.push(record);
    }
    persistState(state);
    return record;
  }

  if (cleanPath === '/api/cbt/sessions/submit' && cleanMethod === 'POST') {
    const sessionId = Number(body?.sessionId);
    const examId = Number(body?.examId);
    const studentId = Number(body?.studentId);
    const session = state.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.status = 'selesai';
      session.finishedAt = new Date().toISOString();
    }
    const exam = state.exams.find((e) => e.id === examId);
    const student = state.students.find((s) => s.id === studentId);
    const prodi = student?.studyProgramId
      ? state.studyPrograms.find((p) => p.id === student.studyProgramId)
      : undefined;
    const course = exam?.courseId
      ? state.courses.find((c) => c.id === exam.courseId)
      : undefined;
    const questions = state.questions.filter(
      (q) => q.examId === examId || (exam?.courseId && q.courseId === exam.courseId)
    );
    const answers = Array.isArray(body?.answers) ? body.answers : [];
    const evalSummary = evaluateExamSubmission(
      questions,
      answers,
      session?.violationCount || 0,
      exam?.maxViolations || 3
    );
    const resultRecord = {
      id: nextId(state.results),
      sessionId,
      examId,
      studentId,
      nim: student?.nim || body?.nim || '-',
      studentName: student?.fullName || body?.studentName || 'Mahasiswa',
      studyProgramName: prodi?.name || 'Program Studi',
      courseName: course?.name || exam?.title || 'Mata Kuliah',
      correctCount: evalSummary.correctCount,
      wrongCount: evalSummary.wrongCount,
      emptyCount: evalSummary.emptyCount,
      objectiveScore: evalSummary.objectiveScore,
      essayScore: evalSummary.essayScore,
      finalScore: evalSummary.finalScore,
      gradeLetter: evalSummary.gradeLetter,
      durationUsedMinutes: Number(body?.durationUsedMinutes) || 15,
      violationCount: session?.violationCount || 0,
      verificationStatus: evalSummary.verificationStatus,
      isPublished: Boolean(exam?.resultsPublished ?? true),
      submittedAt: new Date().toISOString(),
    };
    state.results.unshift(resultRecord);
    persistState(state);
    return { result: resultRecord, evaluation: evalSummary };
  }

  if (cleanPath === '/api/cbt/results/grade-essay' && cleanMethod === 'POST') {
    const resultId = Number(body?.resultId);
    const r = state.results.find((item) => item.id === resultId);
    if (r) {
      r.essayScore = Number(body?.essayScore) || 0;
      r.finalScore = Math.min(100, r.objectiveScore + r.essayScore);
      r.gradeLetter = computeGradeLetter(r.finalScore);
      r.verificationStatus = body?.verificationStatus || 'Sudah Diverifikasi';
      r.isPublished = body?.isPublished ?? true;
      persistState(state);
    }
    return r || { saved: true };
  }

  const resultPatchMatch = /^\/api\/cbt\/results\/(\d+)$/.exec(cleanPath);
  if (resultPatchMatch && cleanMethod === 'PATCH') {
    const resultId = Number(resultPatchMatch[1]);
    const r = state.results.find((item) => item.id === resultId);
    if (r) {
      if (body?.essayScore !== undefined) {
        r.essayScore = Number(body.essayScore) || 0;
        r.finalScore = Math.min(100, r.objectiveScore + r.essayScore);
        r.gradeLetter = computeGradeLetter(r.finalScore);
      }
      if (body?.verificationStatus !== undefined) {
        r.verificationStatus = body.verificationStatus;
      }
      if (body?.isPublished !== undefined) {
        r.isPublished = Boolean(body.isPublished);
      }
      persistState(state);
    }
    return r || { saved: true };
  }

  return { ok: true };
}

function getSupabaseClientConfig(): { url: string; key: string } | null {
  try {
    const metaEnv = (import.meta as any)?.env || {};
    const url = String(metaEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = String(metaEnv.VITE_SUPABASE_ANON_KEY || '').trim();
    if (url && key) {
      return { url, key };
    }
  } catch {
    // Ignore in Node test runtime
  }
  return null;
}

async function pullStateFromSupabaseRest(): Promise<void> {
  const cfg = getSupabaseClientConfig();
  if (!cfg || typeof window === 'undefined') return;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/cbt_cloud_state?id=eq.1&select=state_json`,
      {
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
        },
      }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.state_json) {
      saveFallbackState(rows[0].state_json as CbtSystemState);
    } else if (Array.isArray(rows) && rows.length === 0) {
      const initial = loadFallbackState();
      await pushStateToSupabaseRest(initial);
    }
  } catch {
    // Fallback to local state if table not created yet
  }
}

async function pushStateToSupabaseRest(state: CbtSystemState): Promise<void> {
  const cfg = getSupabaseClientConfig();
  if (!cfg || typeof window === 'undefined') return;
  try {
    await fetch(`${cfg.url}/rest/v1/cbt_cloud_state`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 1,
        state_json: state,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Ignore network error
  }
}

async function runFallbackWithSupabaseSync(
  url: string,
  method: string,
  parsedBody?: any
): Promise<any> {
  await pullStateFromSupabaseRest();
  const result = handleClientFallbackRequest(url, method, parsedBody);
  if (method !== 'GET') {
    await pushStateToSupabaseRest(loadFallbackState());
  }
  return result;
}

export async function executeApiRequest(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const parsedBody =
    typeof options.body === 'string' && options.body
      ? JSON.parse(options.body)
      : undefined;

  try {
    const res = await fetch(url, options);
    const parsed = await safeParseJsonResponse(res);

    if (shouldUseClientFallback(parsed)) {
      return await runFallbackWithSupabaseSync(url, method, parsedBody);
    }

    if (!parsed.ok) {
      const error: any = new Error(
        parsed.data?.error || 'Permintaan gagal diproses.'
      );
      error.status = parsed.status;
      throw error;
    }

    return parsed.data;
  } catch (err: any) {
    // Network error / offline / failed fetch on static host
    if (
      err?.name === 'TypeError' ||
      String(err?.message || '').includes('Failed to fetch') ||
      String(err?.message || '').includes('NetworkError')
    ) {
      return await runFallbackWithSupabaseSync(url, method, parsedBody);
    }
    throw err;
  }
}

