import { eq, desc, and, lt, inArray } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { db, pool } from './index.ts';
import initialSeedSnapshot from './initialSeedSnapshot.json';
import {
  websiteSettings,
  roles,
  users,
  faculties,
  studyPrograms,
  classes,
  lecturers,
  students,
  courses,
  exams,
  examQuestions,
  questionOptions,
  examSessions,
  studentAnswers,
  examSnapshots,
  violationLogs,
  examResults,
  auditLogs,
} from './schema.ts';
import {
  evaluateExamSubmission,
  computeWarningLevel,
  computeGradeLetter,
  matchesStudentCredentials,
  parseDataImageUrl,
  toPublicSnapshotUrl,
} from '../utils/cbtLogic.ts';

export const SNAPSHOT_UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads', 'snapshots')
  : path.resolve(process.cwd(), 'uploads', 'snapshots');

async function saveSnapshotImageToDisk(
  rawImageUrl: string,
  meta: { examId: number; sessionId: number; sequenceNumber: number }
): Promise<string> {
  const parsed = parseDataImageUrl(rawImageUrl);
  if (!parsed) {
    return rawImageUrl || DEFAULT_STUDENT_IMG;
  }
  try {
    await fs.mkdir(SNAPSHOT_UPLOAD_DIR, { recursive: true });
    const fileName = `snap_${meta.examId}_${meta.sessionId}_seq${meta.sequenceNumber}_${Date.now()}.${parsed.extension}`;
    const fullPath = path.join(SNAPSHOT_UPLOAD_DIR, fileName);
    await fs.writeFile(fullPath, Buffer.from(parsed.base64Data, 'base64'));
    return `/uploads/snapshots/${fileName}`;
  } catch {
    return rawImageUrl;
  }
}

async function removeSnapshotFileFromDisk(storedUrl: string) {
  if (!storedUrl || !storedUrl.startsWith('/uploads/snapshots/')) return;
  const fileName = path.basename(storedUrl);
  const fullPath = path.join(SNAPSHOT_UPLOAD_DIR, fileName);
  await fs.unlink(fullPath).catch(() => {});
}

let isSeeding = false;
let hasSeeded = false;

const DEFAULT_HERO_IMG =
  '/src/assets/images/unikma_campus_hero_1794677775495.jpg';
const DEFAULT_STUDENT_IMG =
  '/src/assets/images/avatar_student_1_1794677775068.jpg';
const DEFAULT_LECTURER_IMG =
  '/src/assets/images/avatar_lecturer_1_1794677775807.jpg';

async function ensureTablesExist() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_settings (
      id SERIAL PRIMARY KEY,
      site_name TEXT NOT NULL,
      university_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT NOT NULL,
      logo_text TEXT NOT NULL,
      logo_image_url TEXT,
      hero_image_url TEXT NOT NULL,
      contact_email TEXT,
      footer_text TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      role_name TEXT NOT NULL,
      avatar_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS faculties (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      dean_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS study_programs (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      degree TEXT NOT NULL,
      faculty_id INTEGER REFERENCES faculties(id) ON DELETE SET NULL,
      head_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      semester INTEGER NOT NULL,
      academic_year TEXT NOT NULL,
      study_program_id INTEGER REFERENCES study_programs(id) ON DELETE SET NULL,
      capacity INTEGER NOT NULL DEFAULT 40,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lecturers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nidn TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      faculty_id INTEGER REFERENCES faculties(id) ON DELETE SET NULL,
      study_program_id INTEGER REFERENCES study_programs(id) ON DELETE SET NULL,
      specialization TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nim TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      faculty_id INTEGER REFERENCES faculties(id) ON DELETE SET NULL,
      study_program_id INTEGER REFERENCES study_programs(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      semester INTEGER NOT NULL DEFAULT 1,
      enrollment_year INTEGER NOT NULL DEFAULT 2026,
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sks INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      study_program_id INTEGER REFERENCES study_programs(id) ON DELETE SET NULL,
      lecturer_id INTEGER REFERENCES lecturers(id) ON DELETE SET NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      lecturer_id INTEGER REFERENCES lecturers(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      exam_type TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      passing_grade INTEGER NOT NULL DEFAULT 70,
      randomize_questions BOOLEAN NOT NULL DEFAULT TRUE,
      randomize_options BOOLEAN NOT NULL DEFAULT TRUE,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      require_camera BOOLEAN NOT NULL DEFAULT TRUE,
      require_fullscreen BOOLEAN NOT NULL DEFAULT TRUE,
      snapshot_count INTEGER NOT NULL DEFAULT 3,
      max_violations INTEGER NOT NULL DEFAULT 3,
      violation_action TEXT NOT NULL DEFAULT 'warn_and_flag',
      status TEXT NOT NULL DEFAULT 'Berlangsung',
      results_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_questions (
      id SERIAL PRIMARY KEY,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
      question_type TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'Sedang',
      question_text TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'none',
      media_content TEXT,
      weight INTEGER NOT NULL DEFAULT 10,
      correct_answer_key TEXT NOT NULL,
      explanation TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS question_options (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
      option_label TEXT NOT NULL,
      option_text TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS exam_sessions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Sedang Ujian',
      camera_status TEXT NOT NULL DEFAULT 'Aktif',
      connection_status TEXT NOT NULL DEFAULT 'Online',
      fullscreen_status BOOLEAN NOT NULL DEFAULT TRUE,
      snapshot1_status TEXT NOT NULL DEFAULT 'Belum Diambil',
      snapshot2_status TEXT NOT NULL DEFAULT 'Belum Diambil',
      snapshot3_status TEXT NOT NULL DEFAULT 'Belum Diambil',
      violation_count INTEGER NOT NULL DEFAULT 0,
      warning_level INTEGER NOT NULL DEFAULT 0,
      remaining_seconds INTEGER NOT NULL,
      question_order_json TEXT,
      started_at TIMESTAMP DEFAULT NOW(),
      finished_at TIMESTAMP,
      last_active_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS student_answers (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
      answer_value TEXT NOT NULL,
      is_doubtful BOOLEAN NOT NULL DEFAULT FALSE,
      is_correct BOOLEAN,
      score_earned INTEGER NOT NULL DEFAULT 0,
      lecturer_feedback TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_snapshots (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      nim TEXT NOT NULL,
      student_name TEXT NOT NULL,
      course_name TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      trigger_stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Berhasil',
      image_data_url TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      captured_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS violation_logs (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      nim TEXT NOT NULL,
      student_name TEXT NOT NULL,
      course_name TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      warning_level INTEGER NOT NULL,
      description TEXT NOT NULL,
      verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
      action_taken TEXT NOT NULL DEFAULT 'Peringatan Otomatis',
      detected_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_results (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      nim TEXT NOT NULL,
      student_name TEXT NOT NULL,
      study_program_name TEXT NOT NULL,
      course_name TEXT NOT NULL,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      empty_count INTEGER NOT NULL DEFAULT 0,
      objective_score INTEGER NOT NULL DEFAULT 0,
      essay_score INTEGER NOT NULL DEFAULT 0,
      final_score INTEGER NOT NULL DEFAULT 0,
      grade_letter TEXT NOT NULL DEFAULT 'A',
      duration_used_minutes INTEGER NOT NULL DEFAULT 0,
      violation_count INTEGER NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'Terverifikasi Aman',
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      submitted_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '10.24.118.42',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function ensureSeeded() {
  if (hasSeeded || isSeeding) return;
  isSeeding = true;
  try {
    // 1. Check if tables exist; only run DDL on fresh external databases (code 42P01)
    let allRoles: Array<{ id: number; name: string; description: string }> = [];
    try {
      allRoles = await db.select().from(roles);
    } catch (tableErr: any) {
      await ensureTablesExist();
      allRoles = await db.select().from(roles);
    }

    if (allRoles.length === 0) {
      allRoles = await db
        .insert(roles)
        .values([
          {
            name: 'admin',
            description: 'Administrator Utama Sistem CBT',
          },
          {
            name: 'dosen',
            description: 'Dosen Pengampu Mata Kuliah & Pengawas Ujian',
          },
          {
            name: 'mahasiswa',
            description: 'Mahasiswa Peserta Ujian',
          },
        ])
        .returning();
    }

    const adminRole =
      allRoles.find((r) => r.name === 'admin') || allRoles[0];
    const dosenRole =
      allRoles.find((r) => r.name === 'dosen') || allRoles[0];

    // 2. Ensure the required Admin account (muhtyasyugi@unikma.ac.id / muhtyasyugi@123) exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, 'muhtyasyugi@unikma.ac.id'));

    if (existingAdmin.length === 0) {
      await db.insert(users).values({
        uid: 'uid-admin-muhtyasyugi',
        email: 'muhtyasyugi@unikma.ac.id',
        passwordHash: 'muhtyasyugi@123',
        fullName: 'Muhtyas Yugi (Super Admin MazCodeID)',
        roleId: adminRole.id,
        roleName: 'admin',
        avatarUrl: DEFAULT_LECTURER_IMG,
        isActive: true,
      });
    } else if (existingAdmin[0].passwordHash !== 'muhtyasyugi@123') {
      await db
        .update(users)
        .set({
          passwordHash: 'muhtyasyugi@123',
          roleName: 'admin',
          isActive: true,
        })
        .where(eq(users.id, existingAdmin[0].id));
    }

    // 3. Ensure default website_settings record exists (using user's saved MazCodeID snapshot)
    const existingSettings = await db.select().from(websiteSettings);
    if (existingSettings.length === 0) {
      const snapSite = initialSeedSnapshot.websiteSettings?.[0];
      await db.insert(websiteSettings).values({
        siteName:
          snapSite?.siteName ||
          'MAZCODEID CBT – ANTI CHEATING EXAM SYSTEM',
        universityName: snapSite?.universityName || 'MazCodeID',
        tagline:
          snapSite?.tagline ||
          'Ujian Digital yang Aman, Transparan, dan Terpercaya.',
        description:
          snapSite?.description ||
          'Platform Computer Based Test (CBT) dan Online Proctoring resmi MazCodeID dengan pengawasan kamera WebRTC, 3x Snapshot otomatis, dan deteksi pelanggaran real-time.',
        logoText: snapSite?.logoText || 'MCD',
        logoImageUrl: snapSite?.logoImageUrl || '',
        heroImageUrl: snapSite?.heroImageUrl || DEFAULT_HERO_IMG,
        contactEmail: snapSite?.contactEmail || 'muhtyasyugi@unikma.ac.id',
        footerText:
          snapSite?.footerText ||
          '© 2026 MazCodeID. Hak Cipta Dilindungi.',
        isActive: true,
      });
    }

    // 4. Ensure saved master data (Faculties, Study Programs, Classes, Lecturers, Courses) exist
    let currentFaculties = await db.select().from(faculties);
    if (currentFaculties.length === 0 && initialSeedSnapshot.faculties?.length > 0) {
      currentFaculties = await db
        .insert(faculties)
        .values({
          code: initialSeedSnapshot.faculties[0].code,
          name: initialSeedSnapshot.faculties[0].name,
          deanName: initialSeedSnapshot.faculties[0].deanName,
        })
        .returning();
    }
    const facId = currentFaculties[0]?.id ?? null;

    let currentProdis = await db.select().from(studyPrograms);
    if (currentProdis.length === 0 && initialSeedSnapshot.studyPrograms?.length > 0) {
      for (const sp of initialSeedSnapshot.studyPrograms) {
        await db.insert(studyPrograms).values({
          code: sp.code,
          name: sp.name,
          degree: sp.degree,
          facultyId: facId,
          headName: sp.headName,
        });
      }
      currentProdis = await db.select().from(studyPrograms);
    }

    const prodiIdMap = new Map<number, number>();
    for (const snapSp of initialSeedSnapshot.studyPrograms || []) {
      const dbSp = currentProdis.find(
        (p) => p.code.toLowerCase() === snapSp.code.toLowerCase()
      );
      if (dbSp) {
        prodiIdMap.set(snapSp.id, dbSp.id);
      }
    }

    const currentClasses = await db.select().from(classes);
    if (currentClasses.length === 0 && initialSeedSnapshot.classes?.length > 0) {
      for (const cls of initialSeedSnapshot.classes) {
        await db.insert(classes).values({
          code: cls.code,
          name: cls.name,
          semester: cls.semester,
          academicYear: cls.academicYear,
          studyProgramId: cls.studyProgramId
            ? prodiIdMap.get(cls.studyProgramId) ?? null
            : null,
          capacity: cls.capacity,
        });
      }
    }

    let currentLecturers = await db.select().from(lecturers);
    if (currentLecturers.length === 0 && initialSeedSnapshot.lecturers?.length > 0) {
      for (const lec of initialSeedSnapshot.lecturers) {
        const snapUser = initialSeedSnapshot.users?.find(
          (u) => u.id === lec.userId
        );
        if (snapUser) {
          let userRow = (
            await db
              .select()
              .from(users)
              .where(eq(users.email, snapUser.email))
          )[0];
          if (!userRow) {
            const insertedUsers = await db
              .insert(users)
              .values({
                uid: snapUser.uid,
                email: snapUser.email,
                passwordHash: snapUser.passwordHash || 'unikma123',
                fullName: snapUser.fullName,
                roleId: dosenRole.id,
                roleName: 'dosen',
                avatarUrl: snapUser.avatarUrl || DEFAULT_LECTURER_IMG,
                isActive: snapUser.isActive ?? true,
              })
              .returning();
            userRow = insertedUsers[0];
          }
          if (userRow) {
            await db.insert(lecturers).values({
              userId: userRow.id,
              nidn: lec.nidn,
              fullName: lec.fullName,
              facultyId: facId,
              studyProgramId: lec.studyProgramId
                ? prodiIdMap.get(lec.studyProgramId) ?? null
                : null,
              specialization: lec.specialization,
              phone: lec.phone || '-',
            });
          }
        }
      }
      currentLecturers = await db.select().from(lecturers);
    }

    const lecturerIdMap = new Map<number, number>();
    for (const snapLec of initialSeedSnapshot.lecturers || []) {
      const dbLec = currentLecturers.find((l) => l.nidn === snapLec.nidn);
      if (dbLec) {
        lecturerIdMap.set(snapLec.id, dbLec.id);
      }
    }

    const currentCourses = await db.select().from(courses);
    if (currentCourses.length === 0 && initialSeedSnapshot.courses?.length > 0) {
      for (const crs of initialSeedSnapshot.courses) {
        await db.insert(courses).values({
          code: crs.code,
          name: crs.name,
          sks: crs.sks,
          semester: crs.semester,
          studyProgramId: crs.studyProgramId
            ? prodiIdMap.get(crs.studyProgramId) ?? null
            : null,
          lecturerId: crs.lecturerId
            ? lecturerIdMap.get(crs.lecturerId) ?? null
            : null,
          description: crs.description || '',
        });
      }
    }

    hasSeeded = true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw new Error('Gagal menginisialisasi sistem database.', {
      cause: error,
    });
  } finally {
    isSeeding = false;
  }
}

export async function authenticateWithCredentials(
  emailInput: string,
  passwordInput: string
) {
  try {
    await ensureSeeded();
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    const cleanPass = (passwordInput || '').trim();

    const allUsers = await db.select().from(users);
    const matchedUser = allUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail
    );

    if (!matchedUser) {
      throw new Error('Akun dengan email/username tersebut tidak ditemukan.');
    }

    if (!matchedUser.isActive) {
      throw new Error('Akun ini sedang dinonaktifkan oleh Administrator.');
    }

    if (matchedUser.passwordHash !== cleanPass) {
      throw new Error('Kata sandi tidak sesuai. Silakan periksa kembali.');
    }

    return matchedUser;
  } catch (error: any) {
    console.error('Authentication error:', error);
    throw new Error(error.message || 'Autentikasi gagal.', { cause: error });
  }
}

export async function authenticateStudentByNimAndName(
  nimInput: string,
  fullNameInput: string
) {
  try {
    await ensureSeeded();
    const cleanNim = (nimInput || '').trim();
    const cleanName = (fullNameInput || '').trim();
    if (!cleanNim || !cleanName) {
      throw new Error('NIM dan Nama Lengkap wajib diisi untuk login mahasiswa.');
    }

    const allStudents = await db.select().from(students);
    const matchedStudent = allStudents.find((s) =>
      matchesStudentCredentials(s, cleanNim, cleanName)
    );

    if (!matchedStudent) {
      throw new Error(
        'Data mahasiswa tidak ditemukan atau kombinasi NIM dan Nama Lengkap tidak sesuai.'
      );
    }

    const linkedUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, matchedStudent.userId));
    const userRecord = linkedUsers[0];

    if (!userRecord) {
      throw new Error('Akun pengguna mahasiswa belum terhubung dengan sistem.');
    }

    if (!userRecord.isActive) {
      throw new Error(
        'Akun mahasiswa ini sedang dinonaktifkan oleh Administrator.'
      );
    }

    return { user: userRecord, student: matchedStudent };
  } catch (error: any) {
    console.error('Student authentication error:', error);
    throw new Error(error.message || 'Login mahasiswa gagal.', { cause: error });
  }
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  preferredRole?: string,
  fullName?: string
) {
  try {
    await ensureSeeded();
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existingByEmail.length > 0) {
      return existingByEmail[0];
    }

    const allRoles = await db.select().from(roles);
    const targetRoleName = preferredRole || 'admin';
    const roleRecord =
      allRoles.find((r) => r.name === targetRoleName) || allRoles[0];

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        passwordHash: 'muhtyasyugi@123',
        fullName: fullName || email.split('@')[0],
        roleId: roleRecord.id,
        roleName: roleRecord.name,
        avatarUrl:
          roleRecord.name === 'mahasiswa'
            ? DEFAULT_STUDENT_IMG
            : DEFAULT_LECTURER_IMG,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database getOrCreateUser failed:', error);
    throw new Error('Gagal menyinkronkan akun pengguna.', { cause: error });
  }
}

export async function getFullSystemState() {
  try {
    await ensureSeeded();
    const [
      allWebsiteSettings,
      allRoles,
      allUsers,
      allFaculties,
      allStudyPrograms,
      allClasses,
      allLecturers,
      allStudents,
      allCourses,
      allExams,
      allQuestions,
      allOptions,
      allSessions,
      allAnswers,
      allSnapshots,
      allViolations,
      allResults,
      allAuditLogs,
    ] = await Promise.all([
      db.select().from(websiteSettings).orderBy(websiteSettings.id),
      db.select().from(roles),
      db.select().from(users).orderBy(desc(users.id)),
      db.select().from(faculties).orderBy(faculties.id),
      db.select().from(studyPrograms).orderBy(studyPrograms.id),
      db.select().from(classes).orderBy(classes.id),
      db.select().from(lecturers).orderBy(lecturers.id),
      db.select().from(students).orderBy(students.id),
      db.select().from(courses).orderBy(courses.id),
      db.select().from(exams).orderBy(exams.id),
      db.select().from(examQuestions).orderBy(examQuestions.id),
      db.select().from(questionOptions).orderBy(questionOptions.id),
      db.select().from(examSessions).orderBy(desc(examSessions.id)),
      db.select().from(studentAnswers).orderBy(desc(studentAnswers.id)),
      db.select().from(examSnapshots).orderBy(desc(examSnapshots.id)),
      db.select().from(violationLogs).orderBy(desc(violationLogs.id)),
      db.select().from(examResults).orderBy(desc(examResults.id)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.id)),
    ]);

    const questionsWithOptions = allQuestions.map((q) => ({
      ...q,
      options: allOptions.filter((o) => o.questionId === q.id),
    }));

    const lightweightSnapshots = allSnapshots.map((s) => ({
      ...s,
      imageDataUrl: toPublicSnapshotUrl(s.id, s.imageDataUrl),
    }));

    return {
      websiteSettings: allWebsiteSettings,
      roles: allRoles,
      users: allUsers,
      faculties: allFaculties,
      studyPrograms: allStudyPrograms,
      classes: allClasses,
      lecturers: allLecturers,
      students: allStudents,
      courses: allCourses,
      exams: allExams,
      questions: questionsWithOptions,
      sessions: allSessions,
      answers: allAnswers,
      snapshots: lightweightSnapshots,
      violations: allViolations,
      results: allResults,
      auditLogs: allAuditLogs,
    };
  } catch (error) {
    console.error('Database query failed in getFullSystemState:', error);
    throw new Error('Gagal memuat data sistem CBT.', { cause: error });
  }
}

// ============================================================================
// CRUD WEBSITE SETTINGS (Nama Website, Foto Banner, Logo, Tagline, Universitas)
// ============================================================================
export async function createWebsiteSettingRecord(data: {
  siteName: string;
  universityName: string;
  tagline: string;
  description: string;
  logoText: string;
  logoImageUrl?: string;
  heroImageUrl: string;
  contactEmail?: string;
  footerText?: string;
  isActive?: boolean;
}) {
  try {
    if (data.isActive) {
      await db.update(websiteSettings).set({ isActive: false });
    }
    const res = await db
      .insert(websiteSettings)
      .values({
        siteName: data.siteName,
        universityName: data.universityName,
        tagline: data.tagline,
        description: data.description,
        logoText: data.logoText || 'MCD',
        logoImageUrl: data.logoImageUrl || '',
        heroImageUrl: data.heroImageUrl || DEFAULT_HERO_IMG,
        contactEmail: data.contactEmail || 'muhtyasyugi@unikma.ac.id',
        footerText:
          data.footerText ||
          '© 2026 MazCodeID. Hak Cipta Dilindungi.',
        isActive: data.isActive ?? true,
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to create website setting:', error);
    throw new Error('Gagal menambahkan profil konfigurasi website.', {
      cause: error,
    });
  }
}

export async function updateWebsiteSettingRecord(
  id: number,
  data: Partial<{
    siteName: string;
    universityName: string;
    tagline: string;
    description: string;
    logoText: string;
    logoImageUrl: string;
    heroImageUrl: string;
    contactEmail: string;
    footerText: string;
    isActive: boolean;
  }>
) {
  try {
    if (data.isActive) {
      await db.update(websiteSettings).set({ isActive: false });
    }
    const res = await db
      .update(websiteSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(websiteSettings.id, id))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update website setting:', error);
    throw new Error('Gagal memperbarui identitas & foto website.', {
      cause: error,
    });
  }
}

export async function deleteWebsiteSettingRecord(id: number) {
  try {
    await db.delete(websiteSettings).where(eq(websiteSettings.id, id));
    const remaining = await db.select().from(websiteSettings);
    if (remaining.length === 0) {
      hasSeeded = false;
      await ensureSeeded();
    }
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete website setting:', error);
    throw new Error('Gagal menghapus konfigurasi website.', { cause: error });
  }
}

// ============================================================================
// CRUD FAKULTAS
// ============================================================================
export async function createFacultyRecord(data: {
  code: string;
  name: string;
  deanName: string;
}) {
  try {
    const res = await db.insert(faculties).values(data).returning();
    return res[0];
  } catch (error) {
    console.error('Failed to create faculty:', error);
    throw new Error('Gagal menambahkan data fakultas (Pastikan kode unik).', {
      cause: error,
    });
  }
}

export async function updateFacultyRecord(
  id: number,
  data: { code: string; name: string; deanName: string }
) {
  try {
    const res = await db
      .update(faculties)
      .set(data)
      .where(eq(faculties.id, id))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update faculty:', error);
    throw new Error('Gagal memperbarui data fakultas.', { cause: error });
  }
}

export async function deleteFacultyRecord(id: number) {
  try {
    await db.delete(faculties).where(eq(faculties.id, id));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete faculty:', error);
    throw new Error('Gagal menghapus data fakultas.', { cause: error });
  }
}

// ============================================================================
// CRUD PROGRAM STUDI (PRODI)
// ============================================================================
export async function createStudyProgramRecord(data: {
  code: string;
  name: string;
  degree: string;
  facultyId?: number | null;
  headName: string;
}) {
  try {
    const res = await db
      .insert(studyPrograms)
      .values({
        code: data.code,
        name: data.name,
        degree: data.degree || 'S1',
        facultyId: data.facultyId ? Number(data.facultyId) : null,
        headName: data.headName,
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to create study program:', error);
    throw new Error('Gagal menambahkan program studi.', { cause: error });
  }
}

export async function updateStudyProgramRecord(
  id: number,
  data: {
    code: string;
    name: string;
    degree: string;
    facultyId?: number | null;
    headName: string;
  }
) {
  try {
    const res = await db
      .update(studyPrograms)
      .set({
        code: data.code,
        name: data.name,
        degree: data.degree,
        facultyId: data.facultyId ? Number(data.facultyId) : null,
        headName: data.headName,
      })
      .where(eq(studyPrograms.id, id))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update study program:', error);
    throw new Error('Gagal memperbarui program studi.', { cause: error });
  }
}

export async function deleteStudyProgramRecord(id: number) {
  try {
    await db.delete(studyPrograms).where(eq(studyPrograms.id, id));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete study program:', error);
    throw new Error('Gagal menghapus program studi.', { cause: error });
  }
}

// ============================================================================
// CRUD DATA MASTER (KELAS & SEMESTER)
// ============================================================================
export async function createClassRecord(data: {
  code: string;
  name: string;
  semester: number;
  academicYear: string;
  studyProgramId?: number | null;
  capacity: number;
}) {
  try {
    const res = await db
      .insert(classes)
      .values({
        code: data.code,
        name: data.name,
        semester: Number(data.semester) || 1,
        academicYear: data.academicYear || '2026/2027 Ganjil',
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        capacity: Number(data.capacity) || 40,
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to create class:', error);
    throw new Error('Gagal menambahkan data kelas.', { cause: error });
  }
}

export async function updateClassRecord(
  id: number,
  data: {
    code: string;
    name: string;
    semester: number;
    academicYear: string;
    studyProgramId?: number | null;
    capacity: number;
  }
) {
  try {
    const res = await db
      .update(classes)
      .set({
        code: data.code,
        name: data.name,
        semester: Number(data.semester) || 1,
        academicYear: data.academicYear,
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        capacity: Number(data.capacity) || 40,
      })
      .where(eq(classes.id, id))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update class:', error);
    throw new Error('Gagal memperbarui data kelas.', { cause: error });
  }
}

export async function deleteClassRecord(id: number) {
  try {
    await db.delete(classes).where(eq(classes.id, id));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete class:', error);
    throw new Error('Gagal menghapus data kelas.', { cause: error });
  }
}

// ============================================================================
// CRUD MATA KULIAH
// ============================================================================
export async function createCourseRecord(data: {
  code: string;
  name: string;
  sks: number;
  semester: number;
  studyProgramId?: number | null;
  lecturerId?: number | null;
  description?: string;
}) {
  try {
    const res = await db
      .insert(courses)
      .values({
        code: data.code,
        name: data.name,
        sks: Number(data.sks) || 3,
        semester: Number(data.semester) || 1,
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        lecturerId: data.lecturerId ? Number(data.lecturerId) : null,
        description: data.description || '',
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to create course:', error);
    throw new Error('Gagal menambahkan mata kuliah.', { cause: error });
  }
}

export async function updateCourseRecord(
  id: number,
  data: {
    code: string;
    name: string;
    sks: number;
    semester: number;
    studyProgramId?: number | null;
    lecturerId?: number | null;
    description?: string;
  }
) {
  try {
    const res = await db
      .update(courses)
      .set({
        code: data.code,
        name: data.name,
        sks: Number(data.sks) || 3,
        semester: Number(data.semester) || 1,
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        lecturerId: data.lecturerId ? Number(data.lecturerId) : null,
        description: data.description || '',
      })
      .where(eq(courses.id, id))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update course:', error);
    throw new Error('Gagal memperbarui mata kuliah.', { cause: error });
  }
}

export async function deleteCourseRecord(id: number) {
  try {
    await db.delete(courses).where(eq(courses.id, id));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete course:', error);
    throw new Error('Gagal menghapus mata kuliah.', { cause: error });
  }
}

// ============================================================================
// CRUD MANAJEMEN PENGGUNA (ADMIN, DOSEN, MAHASISWA)
// ============================================================================
export async function createUserAccount(data: {
  email: string;
  password?: string;
  fullName: string;
  roleName: string;
  identifier?: string; // NIM or NIDN
  facultyId?: number | null;
  studyProgramId?: number | null;
  classId?: number | null;
  semester?: number;
  specialization?: string;
  phone?: string;
  avatarUrl?: string;
}) {
  try {
    const allRoles = await db.select().from(roles);
    const roleObj =
      allRoles.find((r) => r.name === data.roleName) || allRoles[0];
    const uid = `uid-${data.roleName}-${Date.now()}`;

    const insertedUser = await db
      .insert(users)
      .values({
        uid,
        email: data.email.trim(),
        passwordHash: (data.password || 'unikma123').trim(),
        fullName: data.fullName.trim(),
        roleId: roleObj.id,
        roleName: roleObj.name,
        avatarUrl:
          data.avatarUrl ||
          (roleObj.name === 'mahasiswa'
            ? DEFAULT_STUDENT_IMG
            : DEFAULT_LECTURER_IMG),
        isActive: true,
      })
      .returning();

    const newUser = insertedUser[0];

    const facId = data.facultyId ? Number(data.facultyId) : null;
    const prodiId = data.studyProgramId ? Number(data.studyProgramId) : null;
    const clsId = data.classId ? Number(data.classId) : null;

    if (roleObj.name === 'dosen') {
      await db.insert(lecturers).values({
        userId: newUser.id,
        nidn:
          data.identifier?.trim() ||
          `04${Math.floor(10000000 + Math.random() * 90000000)}`,
        fullName: data.fullName.trim(),
        facultyId: facId,
        studyProgramId: prodiId,
        specialization: data.specialization || 'Ilmu Komputer & Teknologi',
        phone: data.phone || '-',
      });
    } else if (roleObj.name === 'mahasiswa') {
      await db.insert(students).values({
        userId: newUser.id,
        nim:
          data.identifier?.trim() ||
          `202610${Math.floor(1000 + Math.random() * 8999)}`,
        fullName: data.fullName.trim(),
        facultyId: facId,
        studyProgramId: prodiId,
        classId: clsId,
        semester: Number(data.semester) || 1,
        enrollmentYear: 2026,
        avatarUrl: newUser.avatarUrl,
      });
    }

    return newUser;
  } catch (error) {
    console.error('Failed to create user account:', error);
    throw new Error(
      'Gagal membuat akun pengguna baru (Pastikan Email & NIM/NIDN unik).',
      { cause: error }
    );
  }
}

export async function updateUserAccount(
  userId: number,
  data: {
    email: string;
    password?: string;
    fullName: string;
    roleName: string;
    identifier?: string;
    facultyId?: number | null;
    studyProgramId?: number | null;
    classId?: number | null;
    semester?: number;
    specialization?: string;
    phone?: string;
    avatarUrl?: string;
    isActive?: boolean;
  }
) {
  try {
    const allRoles = await db.select().from(roles);
    const roleObj =
      allRoles.find((r) => r.name === data.roleName) || allRoles[0];

    const existingRows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    const current = existingRows[0];
    if (!current) throw new Error('Pengguna tidak ditemukan.');

    const updatedUserRows = await db
      .update(users)
      .set({
        email: data.email.trim(),
        passwordHash:
          data.password && data.password.trim()
            ? data.password.trim()
            : current.passwordHash,
        fullName: data.fullName.trim(),
        roleId: roleObj.id,
        roleName: roleObj.name,
        avatarUrl: data.avatarUrl || current.avatarUrl,
        isActive: data.isActive ?? current.isActive,
      })
      .where(eq(users.id, userId))
      .returning();

    const updatedUser = updatedUserRows[0];
    const facId = data.facultyId ? Number(data.facultyId) : null;
    const prodiId = data.studyProgramId ? Number(data.studyProgramId) : null;
    const clsId = data.classId ? Number(data.classId) : null;

    if (roleObj.name === 'dosen') {
      const existingLec = await db
        .select()
        .from(lecturers)
        .where(eq(lecturers.userId, userId));
      if (existingLec.length > 0) {
        await db
          .update(lecturers)
          .set({
            nidn: data.identifier?.trim() || existingLec[0].nidn,
            fullName: data.fullName.trim(),
            facultyId: facId,
            studyProgramId: prodiId,
            specialization:
              data.specialization || existingLec[0].specialization,
            phone: data.phone || existingLec[0].phone,
          })
          .where(eq(lecturers.userId, userId));
      } else {
        await db.insert(lecturers).values({
          userId,
          nidn:
            data.identifier?.trim() ||
            `04${Math.floor(10000000 + Math.random() * 90000000)}`,
          fullName: data.fullName.trim(),
          facultyId: facId,
          studyProgramId: prodiId,
          specialization: data.specialization || 'Ilmu Komputer',
          phone: data.phone || '-',
        });
      }
    } else if (roleObj.name === 'mahasiswa') {
      const existingStd = await db
        .select()
        .from(students)
        .where(eq(students.userId, userId));
      if (existingStd.length > 0) {
        await db
          .update(students)
          .set({
            nim: data.identifier?.trim() || existingStd[0].nim,
            fullName: data.fullName.trim(),
            facultyId: facId,
            studyProgramId: prodiId,
            classId: clsId,
            semester: Number(data.semester) || existingStd[0].semester,
            avatarUrl: updatedUser.avatarUrl,
          })
          .where(eq(students.userId, userId));
      } else {
        await db.insert(students).values({
          userId,
          nim:
            data.identifier?.trim() ||
            `202610${Math.floor(1000 + Math.random() * 8999)}`,
          fullName: data.fullName.trim(),
          facultyId: facId,
          studyProgramId: prodiId,
          classId: clsId,
          semester: Number(data.semester) || 1,
          enrollmentYear: 2026,
          avatarUrl: updatedUser.avatarUrl,
        });
      }
    }

    return updatedUser;
  } catch (error) {
    console.error('Failed to update user account:', error);
    throw new Error('Gagal memperbarui data akun pengguna.', { cause: error });
  }
}

export async function deleteUserAccount(userId: number) {
  try {
    await db.delete(lecturers).where(eq(lecturers.userId, userId));
    await db.delete(students).where(eq(students.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete user account:', error);
    throw new Error('Gagal menghapus akun pengguna.', { cause: error });
  }
}

// ============================================================================
// CRUD DATA MAHASISWA (DENGAN AKUN LOGIN NIM + NAMA LENGKAP)
// ============================================================================
export async function createStudentRecord(data: {
  nim: string;
  fullName: string;
  email?: string;
  facultyId?: number | null;
  studyProgramId?: number | null;
  classId?: number | null;
  semester?: number;
  enrollmentYear?: number;
  avatarUrl?: string;
  isActive?: boolean;
}) {
  try {
    await ensureSeeded();
    const cleanNim = (data.nim || '').trim();
    const cleanName = (data.fullName || '').trim().replace(/\s+/g, ' ');
    if (!cleanNim || !cleanName) {
      throw new Error('NIM dan Nama Lengkap mahasiswa wajib diisi.');
    }

    const existingNim = await db
      .select()
      .from(students)
      .where(eq(students.nim, cleanNim));
    if (existingNim.length > 0) {
      throw new Error(`NIM ${cleanNim} sudah terdaftar pada mahasiswa lain.`);
    }

    const allRoles = await db.select().from(roles);
    const studentRole =
      allRoles.find((r) => r.name === 'mahasiswa') || allRoles[0];

    const sanitizedSlug =
      cleanNim.toLowerCase().replace(/[^a-z0-9._-]/g, '') || `${Date.now()}`;
    let targetEmail = (data.email || '').trim().toLowerCase();
    if (!targetEmail) {
      targetEmail = `${sanitizedSlug}@student.unikma.ac.id`;
    }
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, targetEmail));
    if (existingEmail.length > 0) {
      if ((data.email || '').trim()) {
        throw new Error(`Email ${targetEmail} sudah digunakan akun lain.`);
      }
      targetEmail = `${sanitizedSlug}-${Date.now()}@student.unikma.ac.id`;
    }

    const avatar = data.avatarUrl?.trim() || DEFAULT_STUDENT_IMG;
    const insertedUser = await db
      .insert(users)
      .values({
        uid: `uid-mahasiswa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        email: targetEmail,
        passwordHash: cleanNim,
        fullName: cleanName,
        roleId: studentRole.id,
        roleName: 'mahasiswa',
        avatarUrl: avatar,
        isActive: data.isActive ?? true,
      })
      .returning();

    const newUser = insertedUser[0];

    const insertedStudent = await db
      .insert(students)
      .values({
        userId: newUser.id,
        nim: cleanNim,
        fullName: cleanName,
        facultyId: data.facultyId ? Number(data.facultyId) : null,
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        classId: data.classId ? Number(data.classId) : null,
        semester: Number(data.semester) || 1,
        enrollmentYear: Number(data.enrollmentYear) || 2026,
        avatarUrl: avatar,
      })
      .returning();

    return insertedStudent[0];
  } catch (error: any) {
    console.error('Failed to create student record:', error);
    throw new Error(error.message || 'Gagal menambahkan data mahasiswa.', {
      cause: error,
    });
  }
}

export async function updateStudentRecord(
  studentId: number,
  data: {
    nim: string;
    fullName: string;
    email?: string;
    facultyId?: number | null;
    studyProgramId?: number | null;
    classId?: number | null;
    semester?: number;
    enrollmentYear?: number;
    avatarUrl?: string;
    isActive?: boolean;
  }
) {
  try {
    const existingRows = await db
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Data mahasiswa tidak ditemukan.');
    }

    const cleanNim = (data.nim || '').trim();
    const cleanName = (data.fullName || '').trim().replace(/\s+/g, ' ');
    if (!cleanNim || !cleanName) {
      throw new Error('NIM dan Nama Lengkap mahasiswa wajib diisi.');
    }

    if (cleanNim !== current.nim) {
      const duplicateNim = await db
        .select()
        .from(students)
        .where(eq(students.nim, cleanNim));
      if (duplicateNim.length > 0) {
        throw new Error(`NIM ${cleanNim} sudah digunakan mahasiswa lain.`);
      }
    }

    const avatar = data.avatarUrl?.trim() || current.avatarUrl || DEFAULT_STUDENT_IMG;
    const updatedStudents = await db
      .update(students)
      .set({
        nim: cleanNim,
        fullName: cleanName,
        facultyId: data.facultyId ? Number(data.facultyId) : null,
        studyProgramId: data.studyProgramId ? Number(data.studyProgramId) : null,
        classId: data.classId ? Number(data.classId) : null,
        semester: Number(data.semester) || current.semester,
        enrollmentYear: Number(data.enrollmentYear) || current.enrollmentYear,
        avatarUrl: avatar,
      })
      .where(eq(students.id, studentId))
      .returning();

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, current.userId));
    if (userRows.length > 0) {
      const currentUser = userRows[0];
      await db
        .update(users)
        .set({
          fullName: cleanName,
          email: (data.email || '').trim().toLowerCase() || currentUser.email,
          avatarUrl: avatar,
          isActive: data.isActive ?? currentUser.isActive,
        })
        .where(eq(users.id, current.userId));
    }

    return updatedStudents[0];
  } catch (error: any) {
    console.error('Failed to update student record:', error);
    throw new Error(error.message || 'Gagal memperbarui data mahasiswa.', {
      cause: error,
    });
  }
}

export async function deleteStudentRecord(studentId: number) {
  try {
    const existingRows = await db
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Data mahasiswa tidak ditemukan.');
    }
    await db.delete(students).where(eq(students.id, studentId));
    await db.delete(users).where(eq(users.id, current.userId));
    return { deleted: true };
  } catch (error: any) {
    console.error('Failed to delete student record:', error);
    throw new Error(error.message || 'Gagal menghapus data mahasiswa.', {
      cause: error,
    });
  }
}

export async function importStudentsBatch(
  items: Array<{
    nim: string;
    fullName: string;
    email?: string;
    facultyId?: number | null;
    studyProgramId?: number | null;
    classId?: number | null;
    semester?: number;
    enrollmentYear?: number;
    avatarUrl?: string;
    isActive?: boolean;
  }>
) {
  await ensureSeeded();
  const createdItems = [];
  const errors: Array<{ row: number; nim: string; message: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const created = await createStudentRecord(item);
      createdItems.push(created);
    } catch (err: any) {
      errors.push({
        row: i + 1,
        nim: (item?.nim || '').trim(),
        message: err?.message || 'Gagal mengimpor baris mahasiswa.',
      });
    }
  }

  return {
    importedCount: createdItems.length,
    skippedCount: errors.length,
    errors,
    items: createdItems,
  };
}

// ============================================================================
// CRUD BANK SOAL
// ============================================================================
export async function createQuestionRecord(data: {
  courseId?: number | null;
  examId?: number | null;
  questionType: string;
  difficulty: string;
  questionText: string;
  mediaType?: string;
  mediaContent?: string;
  weight: number;
  correctAnswerKey: string;
  explanation?: string;
  options?: Array<{
    optionLabel: string;
    optionText: string;
    isCorrect: boolean;
  }>;
}) {
  try {
    const inserted = await db
      .insert(examQuestions)
      .values({
        courseId: data.courseId ? Number(data.courseId) : null,
        examId: data.examId ? Number(data.examId) : null,
        questionType: data.questionType,
        difficulty: data.difficulty || 'Sedang',
        questionText: data.questionText,
        mediaType: data.mediaType || 'none',
        mediaContent: data.mediaContent || null,
        weight: Number(data.weight) || 10,
        correctAnswerKey: data.correctAnswerKey,
        explanation: data.explanation || '',
      })
      .returning();

    const q = inserted[0];

    if (data.options && data.options.length > 0) {
      await db.insert(questionOptions).values(
        data.options.map((opt) => ({
          questionId: q.id,
          optionLabel: opt.optionLabel,
          optionText: opt.optionText,
          isCorrect: opt.isCorrect,
        }))
      );
    }

    return q;
  } catch (error) {
    console.error('Failed to create question:', error);
    throw new Error('Gagal menyimpan butir soal ke bank soal.', {
      cause: error,
    });
  }
}

export async function updateQuestionRecord(
  questionId: number,
  data: {
    courseId?: number | null;
    examId?: number | null;
    questionType: string;
    difficulty: string;
    questionText: string;
    mediaType?: string;
    mediaContent?: string;
    weight: number;
    correctAnswerKey: string;
    explanation?: string;
    options?: Array<{
      optionLabel: string;
      optionText: string;
      isCorrect: boolean;
    }>;
  }
) {
  try {
    const updated = await db
      .update(examQuestions)
      .set({
        courseId: data.courseId ? Number(data.courseId) : null,
        examId: data.examId ? Number(data.examId) : null,
        questionType: data.questionType,
        difficulty: data.difficulty || 'Sedang',
        questionText: data.questionText,
        mediaType: data.mediaType || 'none',
        mediaContent: data.mediaContent || null,
        weight: Number(data.weight) || 10,
        correctAnswerKey: data.correctAnswerKey,
        explanation: data.explanation || '',
      })
      .where(eq(examQuestions.id, questionId))
      .returning();

    if (data.options) {
      await db
        .delete(questionOptions)
        .where(eq(questionOptions.questionId, questionId));
      if (data.options.length > 0) {
        await db.insert(questionOptions).values(
          data.options.map((opt) => ({
            questionId,
            optionLabel: opt.optionLabel,
            optionText: opt.optionText,
            isCorrect: opt.isCorrect,
          }))
        );
      }
    }

    return updated[0];
  } catch (error) {
    console.error('Failed to update question:', error);
    throw new Error('Gagal memperbarui butir soal.', { cause: error });
  }
}

export async function deleteQuestionRecord(questionId: number) {
  try {
    await db
      .delete(questionOptions)
      .where(eq(questionOptions.questionId, questionId));
    await db
      .delete(studentAnswers)
      .where(eq(studentAnswers.questionId, questionId));
    await db.delete(examQuestions).where(eq(examQuestions.id, questionId));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete question:', error);
    throw new Error('Gagal menghapus soal.', { cause: error });
  }
}

// ============================================================================
// CRUD JADWAL & MANAJEMEN UJIAN
// ============================================================================
export async function createExamRecord(data: {
  code: string;
  title: string;
  courseId?: number | null;
  lecturerId?: number | null;
  classId?: number | null;
  examType: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  totalQuestions: number;
  passingGrade?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  maxAttempts?: number;
  requireCamera?: boolean;
  requireFullscreen?: boolean;
  snapshotCount?: number;
  maxViolations?: number;
  violationAction?: string;
  status?: string;
}) {
  try {
    const inserted = await db
      .insert(exams)
      .values({
        code: data.code,
        title: data.title,
        courseId: data.courseId ? Number(data.courseId) : null,
        lecturerId: data.lecturerId ? Number(data.lecturerId) : null,
        classId: data.classId ? Number(data.classId) : null,
        examType: data.examType || 'UTS',
        durationMinutes: Number(data.durationMinutes) || 60,
        startTime: data.startTime,
        endTime: data.endTime,
        totalQuestions: Number(data.totalQuestions) || 10,
        passingGrade: Number(data.passingGrade) || 70,
        randomizeQuestions: data.randomizeQuestions ?? true,
        randomizeOptions: data.randomizeOptions ?? true,
        maxAttempts: Number(data.maxAttempts) || 1,
        requireCamera: data.requireCamera ?? true,
        requireFullscreen: data.requireFullscreen ?? true,
        snapshotCount: Number(data.snapshotCount) || 3,
        maxViolations: Number(data.maxViolations) || 3,
        violationAction: data.violationAction ?? 'warn_and_flag',
        status: data.status ?? 'Berlangsung',
        resultsPublished: true,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Failed to create exam:', error);
    throw new Error('Gagal membuat jadwal ujian baru.', { cause: error });
  }
}

export async function updateExamConfig(
  examId: number,
  updates: Partial<{
    code: string;
    title: string;
    courseId: number | null;
    lecturerId: number | null;
    classId: number | null;
    examType: string;
    startTime: string;
    endTime: string;
    totalQuestions: number;
    passingGrade: number;
    durationMinutes: number;
    snapshotCount: number;
    maxViolations: number;
    violationAction: string;
    requireCamera: boolean;
    requireFullscreen: boolean;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    status: string;
    resultsPublished: boolean;
  }>
) {
  try {
    const res = await db
      .update(exams)
      .set(updates)
      .where(eq(exams.id, examId))
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to update exam config:', error);
    throw new Error('Gagal memperbarui konfigurasi ujian.', { cause: error });
  }
}

export async function deleteExamRecord(examId: number) {
  try {
    await db.delete(exams).where(eq(exams.id, examId));
    return { deleted: true };
  } catch (error) {
    console.error('Failed to delete exam:', error);
    throw new Error('Gagal menghapus jadwal ujian.', { cause: error });
  }
}

// ============================================================================
// EXAM SESSION, SNAPSHOT, VIOLATION & GRADING HANDLERS
// ============================================================================
export async function startOrResumeExamSession(data: {
  examId: number;
  studentId: number;
}) {
  try {
    const existing = await db
      .select()
      .from(examSessions)
      .where(
        and(
          eq(examSessions.examId, data.examId),
          eq(examSessions.studentId, data.studentId)
        )
      );

    const examRows = await db
      .select()
      .from(exams)
      .where(eq(exams.id, data.examId));
    const exam = examRows[0];
    const defaultSeconds = (exam?.durationMinutes || 60) * 60;

    if (existing.length > 0) {
      const current = existing[0];
      const updated = await db
        .update(examSessions)
        .set({
          status:
            current.status === 'Selesai' ? 'Sedang Ujian' : current.status,
          cameraStatus: 'Aktif',
          connectionStatus: 'Online',
          fullscreenStatus: true,
          remainingSeconds:
            current.remainingSeconds > 0
              ? current.remainingSeconds
              : defaultSeconds,
          lastActiveAt: new Date(),
        })
        .where(eq(examSessions.id, current.id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(examSessions)
      .values({
        examId: data.examId,
        studentId: data.studentId,
        status: 'Sedang Ujian',
        cameraStatus: 'Aktif',
        connectionStatus: 'Online',
        fullscreenStatus: true,
        snapshot1Status: 'Belum Diambil',
        snapshot2Status: 'Belum Diambil',
        snapshot3Status: 'Belum Diambil',
        violationCount: 0,
        warningLevel: 0,
        remainingSeconds: defaultSeconds,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Failed to start exam session:', error);
    throw new Error('Gagal memulai sesi ujian.', { cause: error });
  }
}

export async function recordExamSnapshot(data: {
  sessionId: number;
  examId: number;
  studentId: number;
  sequenceNumber: 1 | 2 | 3;
  triggerStage: string;
  status: 'Berhasil' | 'Gagal';
  imageDataUrl: string;
  retryCount?: number;
}) {
  let storedImageUrl = '';
  try {
    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, data.studentId));
    const examRows = await db
      .select()
      .from(exams)
      .where(eq(exams.id, data.examId));
    const courseRows =
      examRows[0] && examRows[0].courseId
        ? await db
            .select()
            .from(courses)
            .where(eq(courses.id, examRows[0].courseId))
        : [];

    const student = studentRows[0];
    const course = courseRows[0];

    storedImageUrl = await saveSnapshotImageToDisk(
      data.imageDataUrl || DEFAULT_STUDENT_IMG,
      {
        examId: data.examId,
        sessionId: data.sessionId,
        sequenceNumber: data.sequenceNumber,
      }
    );

    const inserted = await db
      .insert(examSnapshots)
      .values({
        sessionId: data.sessionId,
        examId: data.examId,
        studentId: data.studentId,
        nim: student?.nim || '-',
        studentName: student?.fullName || 'Mahasiswa',
        courseName: course?.name || examRows[0]?.title || 'Ujian CBT',
        sequenceNumber: data.sequenceNumber,
        triggerStage: data.triggerStage,
        status: data.status,
        imageDataUrl: storedImageUrl,
        retryCount: data.retryCount || 0,
      })
      .returning();

    const snapshotPatch: Record<string, string> = {};
    if (data.sequenceNumber === 1) snapshotPatch.snapshot1Status = data.status;
    if (data.sequenceNumber === 2) snapshotPatch.snapshot2Status = data.status;
    if (data.sequenceNumber === 3) snapshotPatch.snapshot3Status = data.status;

    await db
      .update(examSessions)
      .set({
        ...snapshotPatch,
        lastActiveAt: new Date(),
      })
      .where(eq(examSessions.id, data.sessionId));

    return inserted[0];
  } catch (error) {
    if (storedImageUrl) {
      await removeSnapshotFileFromDisk(storedImageUrl).catch(() => {});
    }
    console.error('Failed to record exam snapshot:', error);
    throw new Error('Gagal menyimpan snapshot kamera peserta.', {
      cause: error,
    });
  }
}

export async function getSnapshotImageData(snapshotId: number): Promise<{
  filePath?: string;
  mimeType?: string;
  buffer?: Buffer;
  redirectUrl?: string;
} | null> {
  const rows = await db
    .select()
    .from(examSnapshots)
    .where(eq(examSnapshots.id, snapshotId));
  const snap = rows[0];
  if (!snap) return null;

  const raw = (snap.imageDataUrl || '').trim();
  const parsed = parseDataImageUrl(raw);
  if (parsed) {
    return {
      mimeType: parsed.mimeType,
      buffer: Buffer.from(parsed.base64Data, 'base64'),
    };
  }
  if (raw.startsWith('/uploads/snapshots/')) {
    return {
      filePath: path.join(SNAPSHOT_UPLOAD_DIR, path.basename(raw)),
    };
  }
  return {
    redirectUrl: raw || DEFAULT_STUDENT_IMG,
  };
}

export async function deleteSnapshotRecord(snapshotId: number) {
  try {
    const rows = await db
      .select()
      .from(examSnapshots)
      .where(eq(examSnapshots.id, snapshotId));
    const snap = rows[0];
    if (!snap) {
      throw new Error('Snapshot tidak ditemukan.');
    }
    await removeSnapshotFileFromDisk(snap.imageDataUrl);
    await db.delete(examSnapshots).where(eq(examSnapshots.id, snapshotId));
    return { deleted: true, id: snapshotId };
  } catch (error: any) {
    console.error('Failed to delete snapshot:', error);
    throw new Error(error.message || 'Gagal menghapus snapshot.', { cause: error });
  }
}

export async function purgeSnapshotRecords(options: {
  examId?: number;
  olderThanDays?: number;
}) {
  try {
    const conditions = [];
    if (options.examId && Number(options.examId) > 0) {
      conditions.push(eq(examSnapshots.examId, Number(options.examId)));
    }
    if (options.olderThanDays && Number(options.olderThanDays) > 0) {
      const cutoff = new Date(
        Date.now() - Number(options.olderThanDays) * 24 * 60 * 60 * 1000
      );
      conditions.push(lt(examSnapshots.capturedAt, cutoff));
    }

    const targets =
      conditions.length > 0
        ? await db
            .select()
            .from(examSnapshots)
            .where(and(...conditions))
        : await db.select().from(examSnapshots);

    for (const snap of targets) {
      await removeSnapshotFileFromDisk(snap.imageDataUrl);
    }

    const ids = targets.map((t) => t.id);
    if (ids.length > 0) {
      await db.delete(examSnapshots).where(inArray(examSnapshots.id, ids));
    }

    return { deletedCount: ids.length };
  } catch (error: any) {
    console.error('Failed to purge snapshots:', error);
    throw new Error(error.message || 'Gagal membersihkan snapshot lama.', {
      cause: error,
    });
  }
}

export async function recordViolationEvent(data: {
  sessionId: number;
  examId: number;
  studentId: number;
  violationType: string;
  description: string;
  cameraStatus?: string;
  fullscreenStatus?: boolean;
  connectionStatus?: string;
}) {
  try {
    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, data.sessionId));
    const currentSession = sessionRows[0];
    const nextCount = (currentSession?.violationCount || 0) + 1;
    const warning = computeWarningLevel(nextCount);

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, data.studentId));
    const examRows = await db
      .select()
      .from(exams)
      .where(eq(exams.id, data.examId));
    const courseRows =
      examRows[0] && examRows[0].courseId
        ? await db
            .select()
            .from(courses)
            .where(eq(courses.id, examRows[0].courseId))
        : [];

    const student = studentRows[0];
    const course = courseRows[0];

    const insertedLog = await db
      .insert(violationLogs)
      .values({
        sessionId: data.sessionId,
        examId: data.examId,
        studentId: data.studentId,
        nim: student?.nim || '-',
        studentName: student?.fullName || 'Mahasiswa',
        courseName: course?.name || examRows[0]?.title || 'Ujian CBT',
        violationType: data.violationType,
        warningLevel: warning.level,
        description: data.description,
        verifiedByAdmin: false,
        actionTaken: warning.label,
      })
      .returning();

    const updatedSession = await db
      .update(examSessions)
      .set({
        violationCount: nextCount,
        warningLevel: warning.level,
        status:
          data.cameraStatus === 'Terputus'
            ? 'Kamera Terputus'
            : 'Terindikasi Pelanggaran',
        cameraStatus:
          data.cameraStatus || currentSession?.cameraStatus || 'Aktif',
        fullscreenStatus:
          typeof data.fullscreenStatus === 'boolean'
            ? data.fullscreenStatus
            : currentSession?.fullscreenStatus ?? true,
        connectionStatus:
          data.connectionStatus || currentSession?.connectionStatus || 'Online',
        lastActiveAt: new Date(),
      })
      .where(eq(examSessions.id, data.sessionId))
      .returning();

    return {
      violation: insertedLog[0],
      session: updatedSession[0],
      warning,
    };
  } catch (error) {
    console.error('Failed to record violation event:', error);
    throw new Error('Gagal mencatat pelanggaran ujian.', { cause: error });
  }
}

export async function saveStudentAnswer(data: {
  sessionId: number;
  questionId: number;
  answerValue: string;
  isDoubtful: boolean;
  remainingSeconds?: number;
}) {
  try {
    const existing = await db
      .select()
      .from(studentAnswers)
      .where(
        and(
          eq(studentAnswers.sessionId, data.sessionId),
          eq(studentAnswers.questionId, data.questionId)
        )
      );

    let saved;
    if (existing.length > 0) {
      const res = await db
        .update(studentAnswers)
        .set({
          answerValue: data.answerValue,
          isDoubtful: data.isDoubtful,
          updatedAt: new Date(),
        })
        .where(eq(studentAnswers.id, existing[0].id))
        .returning();
      saved = res[0];
    } else {
      const res = await db
        .insert(studentAnswers)
        .values({
          sessionId: data.sessionId,
          questionId: data.questionId,
          answerValue: data.answerValue,
          isDoubtful: data.isDoubtful,
        })
        .returning();
      saved = res[0];
    }

    if (typeof data.remainingSeconds === 'number') {
      await db
        .update(examSessions)
        .set({
          remainingSeconds: data.remainingSeconds,
          lastActiveAt: new Date(),
        })
        .where(eq(examSessions.id, data.sessionId));
    }

    return saved;
  } catch (error) {
    console.error('Failed to autosave answer:', error);
    throw new Error('Gagal menyimpan jawaban otomatis.', { cause: error });
  }
}

export async function finalizeExamSubmission(data: {
  sessionId: number;
  examId: number;
  studentId: number;
  answers: Array<{
    questionId: number;
    answerValue: string;
    isDoubtful?: boolean;
  }>;
  durationUsedMinutes: number;
}) {
  try {
    const examRows = await db
      .select()
      .from(exams)
      .where(eq(exams.id, data.examId));
    const exam = examRows[0];

    const allQuestions = await db.select().from(examQuestions);
    const courseQuestions = exam?.courseId
      ? allQuestions.filter((q) => q.courseId === exam.courseId)
      : allQuestions;

    const sessionRows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, data.sessionId));
    const session = sessionRows[0];

    const evaluation = evaluateExamSubmission(
      courseQuestions,
      data.answers,
      session?.violationCount || 0,
      exam?.maxViolations || 3
    );

    for (const item of evaluation.gradedItems) {
      const submitted = data.answers.find(
        (a) => a.questionId === item.questionId
      );
      const existing = await db
        .select()
        .from(studentAnswers)
        .where(
          and(
            eq(studentAnswers.sessionId, data.sessionId),
            eq(studentAnswers.questionId, item.questionId)
          )
        );

      if (existing.length > 0) {
        await db
          .update(studentAnswers)
          .set({
            answerValue: submitted?.answerValue || '',
            isDoubtful: submitted?.isDoubtful || false,
            isCorrect: item.isCorrect,
            scoreEarned: item.scoreEarned,
            updatedAt: new Date(),
          })
          .where(eq(studentAnswers.id, existing[0].id));
      } else {
        await db.insert(studentAnswers).values({
          sessionId: data.sessionId,
          questionId: item.questionId,
          answerValue: submitted?.answerValue || '',
          isDoubtful: submitted?.isDoubtful || false,
          isCorrect: item.isCorrect,
          scoreEarned: item.scoreEarned,
        });
      }
    }

    await db
      .update(examSessions)
      .set({
        status: 'Selesai',
        snapshot3Status: 'Berhasil',
        remainingSeconds: 0,
        finishedAt: new Date(),
        lastActiveAt: new Date(),
      })
      .where(eq(examSessions.id, data.sessionId));

    const studentRows = await db
      .select()
      .from(students)
      .where(eq(students.id, data.studentId));
    const student = studentRows[0];
    const prodiRows =
      student && student.studyProgramId
        ? await db
            .select()
            .from(studyPrograms)
            .where(eq(studyPrograms.id, student.studyProgramId))
        : [];
    const courseRows =
      exam && exam.courseId
        ? await db.select().from(courses).where(eq(courses.id, exam.courseId))
        : [];

    const existingResult = await db
      .select()
      .from(examResults)
      .where(eq(examResults.sessionId, data.sessionId));

    let resultRecord;
    if (existingResult.length > 0) {
      const updated = await db
        .update(examResults)
        .set({
          correctCount: evaluation.correctCount,
          wrongCount: evaluation.wrongCount,
          emptyCount: evaluation.emptyCount,
          objectiveScore: evaluation.objectiveScore,
          essayScore: evaluation.essayScore,
          finalScore: evaluation.finalScore,
          gradeLetter: evaluation.gradeLetter,
          durationUsedMinutes: data.durationUsedMinutes || 1,
          violationCount: session?.violationCount || 0,
          verificationStatus: evaluation.verificationStatus,
          submittedAt: new Date(),
        })
        .where(eq(examResults.id, existingResult[0].id))
        .returning();
      resultRecord = updated[0];
    } else {
      const inserted = await db
        .insert(examResults)
        .values({
          sessionId: data.sessionId,
          examId: data.examId,
          studentId: data.studentId,
          nim: student?.nim || '-',
          studentName: student?.fullName || 'Mahasiswa',
          studyProgramName: prodiRows[0]
            ? `${prodiRows[0].name} (${prodiRows[0].degree})`
            : '-',
          courseName: courseRows[0]?.name || exam?.title || '-',
          correctCount: evaluation.correctCount,
          wrongCount: evaluation.wrongCount,
          emptyCount: evaluation.emptyCount,
          objectiveScore: evaluation.objectiveScore,
          essayScore: evaluation.essayScore,
          finalScore: evaluation.finalScore,
          gradeLetter: evaluation.gradeLetter,
          durationUsedMinutes: data.durationUsedMinutes || 1,
          violationCount: session?.violationCount || 0,
          verificationStatus: evaluation.verificationStatus,
          isPublished: true,
        })
        .returning();
      resultRecord = inserted[0];
    }

    return {
      result: resultRecord,
      evaluation,
    };
  } catch (error) {
    console.error('Failed to finalize exam submission:', error);
    throw new Error('Gagal memproses pengumpulan dan penilaian ujian.', {
      cause: error,
    });
  }
}

export async function updateEssayScoreAndVerifyResult(data: {
  resultId: number;
  essayScore: number;
  verificationStatus: string;
  isPublished: boolean;
}) {
  try {
    const existingRows = await db
      .select()
      .from(examResults)
      .where(eq(examResults.id, data.resultId));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Hasil ujian tidak ditemukan.');
    }

    const finalScore = Math.min(
      100,
      Math.max(0, current.objectiveScore + data.essayScore)
    );
    const gradeLetter = computeGradeLetter(finalScore);

    const updated = await db
      .update(examResults)
      .set({
        essayScore: data.essayScore,
        finalScore,
        gradeLetter,
        verificationStatus: data.verificationStatus,
        isPublished: data.isPublished,
      })
      .where(eq(examResults.id, data.resultId))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Failed to update essay score:', error);
    throw new Error('Gagal memperbarui nilai esai dan verifikasi.', {
      cause: error,
    });
  }
}

export async function verifyViolationRecord(data: {
  violationId: number;
  actionTaken: string;
  verifiedByAdmin: boolean;
}) {
  try {
    const updated = await db
      .update(violationLogs)
      .set({
        actionTaken: data.actionTaken,
        verifiedByAdmin: data.verifiedByAdmin,
      })
      .where(eq(violationLogs.id, data.violationId))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Failed to verify violation:', error);
    throw new Error('Gagal memverifikasi log pelanggaran.', { cause: error });
  }
}
