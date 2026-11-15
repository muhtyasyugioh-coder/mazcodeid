import * as XLSX from 'xlsx';
import {
  ClassRecord,
  FacultyRecord,
  StudentRecord,
  StudyProgramRecord,
  UserRecord,
} from '../types/cbt.ts';

export interface StudentImportItemPayload {
  nim: string;
  fullName: string;
  email?: string;
  facultyId?: number | null;
  studyProgramId?: number | null;
  classId?: number | null;
  semester: number;
  enrollmentYear: number;
  avatarUrl?: string;
  isActive: boolean;
}

export interface StudentLookupData {
  users: UserRecord[];
  faculties: FacultyRecord[];
  studyPrograms: StudyProgramRecord[];
  classes: ClassRecord[];
  existingStudents: StudentRecord[];
}

export interface StudentImportValidationRow {
  rowNumber: number;
  nim: string;
  fullName: string;
  email: string;
  facultyLabel: string;
  prodiLabel: string;
  classLabel: string;
  semester: number;
  enrollmentYear: number;
  isActive: boolean;
  valid: boolean;
  error?: string;
  payload?: StudentImportItemPayload;
}

export interface StudentImportParseResult {
  validItems: StudentImportItemPayload[];
  invalidRows: StudentImportValidationRow[];
  previewRows: StudentImportValidationRow[];
}

export const STUDENT_EXCEL_HEADERS = [
  'NIM',
  'Nama Lengkap',
  'Email',
  'Kode Fakultas',
  'Kode Prodi',
  'Kode Kelas',
  'Semester',
  'Angkatan',
  'Status Aktif',
] as const;

export function normalizeImportHeader(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeLookupToken(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getFieldValue(
  normalizedRow: Record<string, unknown>,
  aliases: string[]
): string {
  for (const alias of aliases) {
    if (alias in normalizedRow) {
      const raw = normalizedRow[alias];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        return String(raw).trim();
      }
    }
  }
  return '';
}

function parseActiveStatus(rawVal: string): boolean {
  const token = normalizeLookupToken(rawVal);
  if (!token) return true;
  if (['nonaktif', 'non-aktif', 'tidak', 'no', 'false', '0', 'inactive'].includes(token)) {
    return false;
  }
  return true;
}

function parsePositiveInt(rawVal: string, fallback: number, min: number, max: number): number {
  if (!rawVal) return fallback;
  const num = Number.parseInt(rawVal.replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function mapRowsToStudentImportPayloads(
  rawRows: Array<Record<string, unknown>>,
  lookup: Pick<StudentLookupData, 'faculties' | 'studyPrograms' | 'classes' | 'existingStudents'>
): StudentImportParseResult {
  const existingNimSet = new Set(
    lookup.existingStudents.map((s) => normalizeLookupToken(s.nim)).filter(Boolean)
  );
  const seenNimInFile = new Set<string>();

  const validItems: StudentImportItemPayload[] = [];
  const invalidRows: StudentImportValidationRow[] = [];
  const previewRows: StudentImportValidationRow[] = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];
    const normalizedRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      normalizedRow[normalizeImportHeader(k)] = v;
    }

    const nim = getFieldValue(normalizedRow, ['nim', 'no induk', 'nomor induk']);
    const fullName = getFieldValue(normalizedRow, [
      'nama lengkap',
      'nama',
      'full name',
      'fullname',
      'nama mahasiswa',
    ]).replace(/\s+/g, ' ');
    const email = getFieldValue(normalizedRow, ['email', 'email akademik', 'surel']);
    const facultyInput = getFieldValue(normalizedRow, [
      'kode fakultas',
      'fakultas',
      'faculty',
      'faculty code',
    ]);
    const prodiInput = getFieldValue(normalizedRow, [
      'kode prodi',
      'prodi',
      'program studi',
      'study program',
      'prodi code',
    ]);
    const classInput = getFieldValue(normalizedRow, [
      'kode kelas',
      'kelas',
      'class',
      'class code',
    ]);
    const semesterRaw = getFieldValue(normalizedRow, ['semester', 'sem']);
    const yearRaw = getFieldValue(normalizedRow, [
      'angkatan',
      'tahun masuk',
      'enrollment year',
      'tahun',
    ]);
    const statusRaw = getFieldValue(normalizedRow, [
      'status aktif',
      'status',
      'aktif',
      'is active',
    ]);

    // Skip completely blank trailing Excel rows
    if (!nim && !fullName && !email && !facultyInput && !prodiInput && !classInput) {
      continue;
    }

    const rowNumber = idx + 2; // +2 accounts for 1-indexed Excel header row
    const semester = parsePositiveInt(semesterRaw, 1, 1, 14);
    const enrollmentYear = parsePositiveInt(yearRaw, 2026, 2010, 2040);
    const isActive = parseActiveStatus(statusRaw);

    const facultyToken = normalizeLookupToken(facultyInput);
    const prodiToken = normalizeLookupToken(prodiInput);
    const classToken = normalizeLookupToken(classInput);

    let matchedFaculty = facultyToken
      ? lookup.faculties.find(
          (f) =>
            normalizeLookupToken(f.code) === facultyToken ||
            normalizeLookupToken(f.name) === facultyToken
        )
      : undefined;

    let matchedProdi = prodiToken
      ? lookup.studyPrograms.find(
          (p) =>
            normalizeLookupToken(p.code) === prodiToken ||
            normalizeLookupToken(p.name) === prodiToken ||
            normalizeLookupToken(`${p.degree} ${p.name}`) === prodiToken
        )
      : undefined;

    const matchedClass = classToken
      ? lookup.classes.find(
          (c) =>
            normalizeLookupToken(c.code) === classToken ||
            normalizeLookupToken(c.name) === classToken
        )
      : undefined;

    if (!matchedProdi && matchedClass?.studyProgramId) {
      matchedProdi = lookup.studyPrograms.find((p) => p.id === matchedClass.studyProgramId);
    }
    if (!matchedFaculty && matchedProdi?.facultyId) {
      matchedFaculty = lookup.faculties.find((f) => f.id === matchedProdi.facultyId);
    }

    const errors: string[] = [];
    if (!nim) errors.push('NIM wajib diisi');
    if (!fullName) errors.push('Nama Lengkap wajib diisi');
    if (nim) {
      const nimKey = normalizeLookupToken(nim);
      if (existingNimSet.has(nimKey)) {
        errors.push(`NIM "${nim}" sudah terdaftar`);
      } else if (seenNimInFile.has(nimKey)) {
        errors.push(`NIM "${nim}" duplikat di file`);
      } else {
        seenNimInFile.add(nimKey);
      }
    }

    const payload: StudentImportItemPayload = {
      nim,
      fullName,
      email,
      facultyId: matchedFaculty?.id ?? null,
      studyProgramId: matchedProdi?.id ?? null,
      classId: matchedClass?.id ?? null,
      semester,
      enrollmentYear,
      isActive,
    };

    const rowSummary: StudentImportValidationRow = {
      rowNumber,
      nim: nim || '-',
      fullName: fullName || '-',
      email: email || (nim ? `${nim}@student.mazcode.id` : '-'),
      facultyLabel: matchedFaculty ? `${matchedFaculty.code} · ${matchedFaculty.name}` : facultyInput || '-',
      prodiLabel: matchedProdi ? `${matchedProdi.code} · ${matchedProdi.name}` : prodiInput || '-',
      classLabel: matchedClass ? `${matchedClass.code} · ${matchedClass.name}` : classInput || '-',
      semester,
      enrollmentYear,
      isActive,
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      payload: errors.length === 0 ? payload : undefined,
    };

    previewRows.push(rowSummary);
    if (errors.length === 0) {
      validItems.push(payload);
    } else {
      invalidRows.push(rowSummary);
    }
  }

  return {
    validItems,
    invalidRows,
    previewRows,
  };
}

export function buildStudentExportRows(
  students: StudentRecord[],
  lookup: Pick<StudentLookupData, 'users' | 'faculties' | 'studyPrograms' | 'classes'>
): Array<Record<(typeof STUDENT_EXCEL_HEADERS)[number], string | number>> {
  const userById = new Map(lookup.users.map((u) => [u.id, u]));
  const facultyById = new Map(lookup.faculties.map((f) => [f.id, f]));
  const prodiById = new Map(lookup.studyPrograms.map((p) => [p.id, p]));
  const classById = new Map(lookup.classes.map((c) => [c.id, c]));

  return students.map((student) => {
    const linkedUser = userById.get(student.userId);
    const faculty = student.facultyId ? facultyById.get(student.facultyId) : undefined;
    const prodi = student.studyProgramId ? prodiById.get(student.studyProgramId) : undefined;
    const cls = student.classId ? classById.get(student.classId) : undefined;
    const isActive = linkedUser?.isActive ?? true;

    return {
      NIM: student.nim,
      'Nama Lengkap': student.fullName,
      Email: linkedUser?.email || `${student.nim}@student.mazcode.id`,
      'Kode Fakultas': faculty?.code || '',
      'Kode Prodi': prodi?.code || '',
      'Kode Kelas': cls?.code || '',
      Semester: student.semester || 1,
      Angkatan: student.enrollmentYear || 2026,
      'Status Aktif': isActive ? 'Aktif' : 'Nonaktif',
    };
  });
}

export function buildStudentTemplateRows(
  lookup: Pick<StudentLookupData, 'faculties' | 'studyPrograms' | 'classes'>
): Array<Record<(typeof STUDENT_EXCEL_HEADERS)[number], string | number>> {
  const sampleFacultyCode = lookup.faculties[0]?.code || 'FTI';
  const sampleProdiCode = lookup.studyPrograms[0]?.code || 'IF';
  const sampleClassCode = lookup.classes[0]?.code || 'TI-1A';

  return [
    {
      NIM: '2026101001',
      'Nama Lengkap': 'Ahmad Fauzi Pratama',
      Email: 'ahmad.fauzi@student.mazcode.id',
      'Kode Fakultas': sampleFacultyCode,
      'Kode Prodi': sampleProdiCode,
      'Kode Kelas': sampleClassCode,
      Semester: 1,
      Angkatan: 2026,
      'Status Aktif': 'Aktif',
    },
    {
      NIM: '2026101002',
      'Nama Lengkap': 'Siti Rahma Putri',
      Email: 'siti.rahma@student.mazcode.id',
      'Kode Fakultas': sampleFacultyCode,
      'Kode Prodi': sampleProdiCode,
      'Kode Kelas': sampleClassCode,
      Semester: 3,
      Angkatan: 2025,
      'Status Aktif': 'Aktif',
    },
  ];
}

export function exportStudentsToExcel(
  students: StudentRecord[],
  lookup: Pick<StudentLookupData, 'users' | 'faculties' | 'studyPrograms' | 'classes'>,
  filename = 'Data_Mahasiswa_MazCodeID.xlsx'
): void {
  const rows = buildStudentExportRows(students, lookup);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...STUDENT_EXCEL_HEADERS],
  });
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 30 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Mahasiswa');
  XLSX.writeFile(workbook, filename);
}

export function downloadStudentImportTemplate(
  lookup: Pick<StudentLookupData, 'faculties' | 'studyPrograms' | 'classes'>,
  filename = 'Template_Import_Mahasiswa_MazCodeID.xlsx'
): void {
  const templateRows = buildStudentTemplateRows(lookup);
  const dataSheet = XLSX.utils.json_to_sheet(templateRows, {
    header: [...STUDENT_EXCEL_HEADERS],
  });
  dataSheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 32 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ];

  const guideRows = [
    { Kolom: 'NIM', Keterangan: 'Wajib diisi, unik per mahasiswa (digunakan untuk login ujian)' },
    { Kolom: 'Nama Lengkap', Keterangan: 'Wajib diisi, harus sesuai untuk login mahasiswa' },
    { Kolom: 'Email', Keterangan: 'Opsional, otomatis dibuat dari NIM jika dikosongkan' },
    { Kolom: 'Kode Fakultas', Keterangan: 'Opsional, isi kode atau nama Fakultas sesuai Master Data' },
    { Kolom: 'Kode Prodi', Keterangan: 'Opsional, isi kode atau nama Program Studi sesuai Master Data' },
    { Kolom: 'Kode Kelas', Keterangan: 'Opsional, isi kode atau nama Kelas sesuai Data Master' },
    { Kolom: 'Semester', Keterangan: 'Angka 1 sampai 14 (default: 1)' },
    { Kolom: 'Angkatan', Keterangan: 'Tahun masuk, misal 2026 (default: 2026)' },
    { Kolom: 'Status Aktif', Keterangan: 'Isi "Aktif" atau "Nonaktif" (default: Aktif)' },
  ];
  const guideSheet = XLSX.utils.json_to_sheet(guideRows);
  guideSheet['!cols'] = [{ wch: 18 }, { wch: 68 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data Mahasiswa');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Panduan Pengisian');
  XLSX.writeFile(workbook, filename);
}

export async function parseStudentImportFile(
  file: File
): Promise<Array<Record<string, unknown>>> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel/CSV tidak memiliki sheet data.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return rows;
}
