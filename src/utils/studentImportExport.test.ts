import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudentExportRows,
  buildStudentTemplateRows,
  mapRowsToStudentImportPayloads,
  normalizeImportHeader,
} from './studentImportExport.ts';
import type {
  ClassRecord,
  FacultyRecord,
  StudentRecord,
  StudyProgramRecord,
  UserRecord,
} from '../types/cbt.ts';

const MOCK_FACULTIES: FacultyRecord[] = [
  { id: 10, code: 'FTI', name: 'Fakultas Teknologi Informasi', deanName: 'Dr. Budi' },
];

const MOCK_PRODIS: StudyProgramRecord[] = [
  { id: 20, code: 'IF', name: 'Informatika', degree: 'S1', facultyId: 10, headName: 'Dr. Rina' },
];

const MOCK_CLASSES: ClassRecord[] = [
  {
    id: 30,
    code: 'IF-1A',
    name: 'Informatika 1A',
    semester: 1,
    academicYear: '2026/2027',
    studyProgramId: 20,
    capacity: 40,
  },
];

const MOCK_USERS: UserRecord[] = [
  {
    id: 100,
    uid: 'u-100',
    email: 'existing@student.mazcode.id',
    fullName: 'Mahasiswa Lama',
    roleId: 3,
    roleName: 'mahasiswa',
    isActive: true,
  },
];

const MOCK_EXISTING_STUDENTS: StudentRecord[] = [
  {
    id: 1,
    userId: 100,
    nim: '2025001',
    fullName: 'Mahasiswa Lama',
    facultyId: 10,
    studyProgramId: 20,
    classId: 30,
    semester: 3,
    enrollmentYear: 2025,
  },
];

test('normalizeImportHeader normalizes underscores, dashes, and spacing', () => {
  assert.equal(normalizeImportHeader(' Nama_Lengkap  '), 'nama lengkap');
  assert.equal(normalizeImportHeader('Kode-Prodi'), 'kode prodi');
  assert.equal(normalizeImportHeader('Status_Aktif'), 'status aktif');
});

test('mapRowsToStudentImportPayloads maps valid rows, resolves faculty/prodi/class codes, and validates duplicates', () => {
  const result = mapRowsToStudentImportPayloads(
    [
      {
        NIM: '2026001',
        'Nama Lengkap': '  Rizky   Pratama ',
        Email: 'rizky@student.mazcode.id',
        'Kode Fakultas': 'fti',
        'Kode Prodi': 'IF',
        'Kode Kelas': 'if-1a',
        Semester: '2',
        Angkatan: '2026',
        'Status Aktif': 'Aktif',
      },
      {
        nim: '2026002',
        nama_lengkap: 'Dewi Lestari',
        kode_kelas: 'IF-1A', // should auto-infer prodi & faculty
        status_aktif: 'Nonaktif',
      },
      {
        NIM: '2025001', // duplicate against existing DB
        'Nama Lengkap': 'Duplikat DB',
      },
      {
        NIM: '2026001', // duplicate within uploaded file
        'Nama Lengkap': 'Duplikat File',
      },
      {
        NIM: '',
        'Nama Lengkap': 'Tanpa NIM',
      },
    ],
    {
      faculties: MOCK_FACULTIES,
      studyPrograms: MOCK_PRODIS,
      classes: MOCK_CLASSES,
      existingStudents: MOCK_EXISTING_STUDENTS,
    }
  );

  assert.equal(result.validItems.length, 2);
  assert.equal(result.invalidRows.length, 3);

  assert.deepEqual(result.validItems[0], {
    nim: '2026001',
    fullName: 'Rizky Pratama',
    email: 'rizky@student.mazcode.id',
    facultyId: 10,
    studyProgramId: 20,
    classId: 30,
    semester: 2,
    enrollmentYear: 2026,
    isActive: true,
  });

  assert.deepEqual(result.validItems[1], {
    nim: '2026002',
    fullName: 'Dewi Lestari',
    email: '',
    facultyId: 10,
    studyProgramId: 20,
    classId: 30,
    semester: 1,
    enrollmentYear: 2026,
    isActive: false,
  });

  assert.match(result.invalidRows[0].error || '', /sudah terdaftar/);
  assert.match(result.invalidRows[1].error || '', /duplikat di file/);
  assert.match(result.invalidRows[2].error || '', /NIM wajib diisi/);
});

test('buildStudentExportRows and buildStudentTemplateRows output consistent Excel columns', () => {
  const exported = buildStudentExportRows(MOCK_EXISTING_STUDENTS, {
    users: MOCK_USERS,
    faculties: MOCK_FACULTIES,
    studyPrograms: MOCK_PRODIS,
    classes: MOCK_CLASSES,
  });

  assert.equal(exported.length, 1);
  assert.deepEqual(exported[0], {
    NIM: '2025001',
    'Nama Lengkap': 'Mahasiswa Lama',
    Email: 'existing@student.mazcode.id',
    'Kode Fakultas': 'FTI',
    'Kode Prodi': 'IF',
    'Kode Kelas': 'IF-1A',
    Semester: 3,
    Angkatan: 2025,
    'Status Aktif': 'Aktif',
  });

  const template = buildStudentTemplateRows({
    faculties: MOCK_FACULTIES,
    studyPrograms: MOCK_PRODIS,
    classes: MOCK_CLASSES,
  });
  assert.equal(template.length, 2);
  assert.equal(template[0]['Kode Fakultas'], 'FTI');
  assert.equal(template[0]['Kode Prodi'], 'IF');
  assert.equal(template[0]['Kode Kelas'], 'IF-1A');
});

test('safeParseJsonResponse and handleClientFallbackRequest gracefully handle Vercel non-JSON 404 response', async () => {
  const {
    safeParseJsonResponse,
    shouldUseClientFallback,
    handleClientFallbackRequest,
  } = await import('./clientCbtFallback.ts');

  const fakeVercel404 = new Response('The page could not be found\n\nNOT_FOUND', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

  const parsed = await safeParseJsonResponse(fakeVercel404);
  assert.equal(parsed.isJson, false);
  assert.equal(shouldUseClientFallback(parsed), true);

  const loginRes = handleClientFallbackRequest(
    '/api/auth/institutional-login',
    'POST',
    {
      email: 'muhtyasyugi@unikma.ac.id',
      password: 'muhtyasyugi@123',
    }
  );
  assert.equal(loginRes.user.email, 'muhtyasyugi@unikma.ac.id');
  assert.equal(loginRes.user.roleName, 'admin');
  assert.ok(loginRes.token.startsWith('unikma-session:'));
});

test('sanitizePostgresConnectionString encodes special characters in Supabase password and strips sslmode', async () => {
  const { sanitizePostgresConnectionString } = await import('../db/index.ts');
  const raw =
    'postgresql://postgres.projref:Pa#ss?wo/rd,1@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true';
  const sanitized = sanitizePostgresConnectionString(raw);
  const parsed = new URL(sanitized);
  assert.equal(parsed.hostname, 'aws-1-ap-northeast-1.pooler.supabase.com');
  assert.equal(parsed.port, '6543');
  assert.equal(parsed.username, 'postgres.projref');
  assert.equal(decodeURIComponent(parsed.password), 'Pa#ss?wo/rd,1');
  assert.equal(parsed.searchParams.has('sslmode'), false);
});


