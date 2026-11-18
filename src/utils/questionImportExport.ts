import * as XLSX from 'xlsx';
import { CourseRecord, QuestionRecord } from '../types/cbt.ts';

export interface QuestionImportOptionPayload {
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
}

export interface QuestionImportItemPayload {
  courseId: number | null;
  examId?: number | null;
  questionType: QuestionRecord['questionType'];
  difficulty: string;
  questionText: string;
  mediaType?: QuestionRecord['mediaType'];
  mediaContent?: string;
  weight: number;
  correctAnswerKey: string;
  explanation: string;
  options: QuestionImportOptionPayload[];
}

export interface QuestionImportValidationRow {
  rowNumber: number;
  questionNumber: string;
  courseLabel: string;
  questionType: QuestionRecord['questionType'];
  difficulty: string;
  weight: number;
  questionText: string;
  correctAnswerKey: string;
  optionCount: number;
  valid: boolean;
  error?: string;
  payload?: QuestionImportItemPayload;
}

export interface QuestionImportParseResult {
  validItems: QuestionImportItemPayload[];
  invalidRows: QuestionImportValidationRow[];
  previewRows: QuestionImportValidationRow[];
  skippedEmptyRows: number;
}

export const QUESTION_50_PG_HEADERS = [
  'No',
  'Kode Mata Kuliah',
  'Tingkat Kesulitan',
  'Bobot',
  'Pertanyaan',
  'Opsi A',
  'Opsi B',
  'Opsi C',
  'Opsi D',
  'Opsi E',
  'Kunci Jawaban',
  'Pembahasan',
] as const;

export const QUESTION_EXPORT_HEADERS = [
  'No',
  'Kode Mata Kuliah',
  'Tipe Soal',
  'Tingkat Kesulitan',
  'Bobot',
  'Pertanyaan',
  'Opsi A',
  'Opsi B',
  'Opsi C',
  'Opsi D',
  'Opsi E',
  'Kunci Jawaban',
  'Pembahasan',
] as const;

function normalizeHeader(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeToken(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getField(normalizedRow: Record<string, unknown>, aliases: string[]): string {
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

function normalizeDifficulty(raw: string): string {
  const token = normalizeToken(raw);
  if (token === 'mudah' || token === 'easy') return 'Mudah';
  if (token === 'sulit' || token === 'sukar' || token === 'hard') return 'Sulit';
  return 'Sedang';
}

function normalizeQuestionType(raw: string): QuestionRecord['questionType'] {
  const token = normalizeToken(raw).replace(/\s+/g, '_');
  if (
    token === 'pilihan_ganda_kompleks' ||
    token === 'pg_kompleks' ||
    token === 'kompleks'
  ) {
    return 'pilihan_ganda_kompleks';
  }
  if (token === 'benar_salah' || token === 'true_false' || token === 'bs') {
    return 'benar_salah';
  }
  if (token === 'isian_singkat' || token === 'isian' || token === 'short_answer') {
    return 'isian_singkat';
  }
  if (token === 'esai' || token === 'essay' || token === 'uraian') {
    return 'esai';
  }
  return 'pilihan_ganda';
}

function parsePositiveWeight(raw: string, fallback = 2): number {
  if (!raw) return fallback;
  const num = Number.parseFloat(raw.replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(100, Math.round(num));
}

export function buildMultipleChoice50TemplateRows(
  courses: CourseRecord[],
  defaultCourseId?: number | null
): Array<Record<(typeof QUESTION_50_PG_HEADERS)[number], string | number>> {
  const targetCourse =
    (defaultCourseId ? courses.find((c) => c.id === defaultCourseId) : undefined) ||
    courses[0];
  const courseCode = targetCourse?.code || 'IFST';

  const rows: Array<Record<(typeof QUESTION_50_PG_HEADERS)[number], string | number>> = [];
  for (let i = 1; i <= 50; i++) {
    rows.push({
      No: i,
      'Kode Mata Kuliah': courseCode,
      'Tingkat Kesulitan': 'Sedang',
      Bobot: 2,
      Pertanyaan: '',
      'Opsi A': '',
      'Opsi B': '',
      'Opsi C': '',
      'Opsi D': '',
      'Opsi E': '',
      'Kunci Jawaban': '',
      Pembahasan: '',
    });
  }
  return rows;
}

export function downloadMultipleChoice50Template(
  courses: CourseRecord[],
  defaultCourseId?: number | null,
  filename = 'Template_50_Soal_Pilihan_Ganda_MazCodeID.xlsx'
): void {
  const templateRows = buildMultipleChoice50TemplateRows(courses, defaultCourseId);
  const templateSheet = XLSX.utils.json_to_sheet(templateRows, {
    header: [...QUESTION_50_PG_HEADERS],
  });
  templateSheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 18 }, // Kode Mata Kuliah
    { wch: 18 }, // Tingkat Kesulitan
    { wch: 9 },  // Bobot
    { wch: 52 }, // Pertanyaan
    { wch: 28 }, // Opsi A
    { wch: 28 }, // Opsi B
    { wch: 28 }, // Opsi C
    { wch: 28 }, // Opsi D
    { wch: 28 }, // Opsi E
    { wch: 15 }, // Kunci Jawaban
    { wch: 38 }, // Pembahasan
  ];

  const sampleCourseCode =
    (defaultCourseId ? courses.find((c) => c.id === defaultCourseId)?.code : undefined) ||
    courses[0]?.code ||
    'IFST';

  const exampleRows: Array<Record<(typeof QUESTION_50_PG_HEADERS)[number], string | number>> = [
    {
      No: 1,
      'Kode Mata Kuliah': sampleCourseCode,
      'Tingkat Kesulitan': 'Mudah',
      Bobot: 2,
      Pertanyaan: 'Protokol standar yang digunakan untuk mengamankan komunikasi HTTP di web adalah...',
      'Opsi A': 'TLS / HTTPS',
      'Opsi B': 'FTP',
      'Opsi C': 'Telnet',
      'Opsi D': 'SNMP',
      'Opsi E': 'POP3',
      'Kunci Jawaban': 'A',
      Pembahasan: 'HTTPS menggunakan protokol enkripsi TLS (Transport Layer Security).',
    },
    {
      No: 2,
      'Kode Mata Kuliah': sampleCourseCode,
      'Tingkat Kesulitan': 'Sedang',
      Bobot: 2,
      Pertanyaan: 'Manakah komponen basis data yang menjamin keunikan setiap baris pada sebuah tabel relasional?',
      'Opsi A': 'Foreign Key',
      'Opsi B': 'Primary Key',
      'Opsi C': 'Index Non-Unik',
      'Opsi D': 'View Table',
      'Opsi E': 'Trigger',
      'Kunci Jawaban': 'B',
      Pembahasan: 'Primary Key mengidentifikasi secara unik setiap record dalam tabel.',
    },
  ];

  const exampleSheet = XLSX.utils.json_to_sheet(exampleRows, {
    header: [...QUESTION_50_PG_HEADERS],
  });
  exampleSheet['!cols'] = templateSheet['!cols'];

  const guideRows = [
    {
      Kolom: 'No',
      Keterangan: 'Nomor urut soal (1 sampai 50 sudah disiapkan pada sheet "Template 50 Soal PG").',
    },
    {
      Kolom: 'Kode Mata Kuliah',
      Keterangan: 'Kode Mata Kuliah sesuai Master Data (opsional jika memilih Mata Kuliah default saat Import).',
    },
    {
      Kolom: 'Tingkat Kesulitan',
      Keterangan: 'Isi: Mudah, Sedang, atau Sulit (default: Sedang).',
    },
    {
      Kolom: 'Bobot',
      Keterangan: 'Bobot poin per soal. Default template = 2 poin per soal (50 soal x 2 = 100 poin).',
    },
    {
      Kolom: 'Pertanyaan',
      Keterangan: 'Wajib diisi. Baris yang kolom Pertanyaan & Opsinya kosong akan otomatis dilewati saat import.',
    },
    {
      Kolom: 'Opsi A - Opsi D',
      Keterangan: 'Wajib diisi untuk setiap soal Pilihan Ganda.',
    },
    {
      Kolom: 'Opsi E',
      Keterangan: 'Disarankan diisi untuk Pilihan Ganda A-E (boleh dikosongkan jika memakai 4 opsi A-D).',
    },
    {
      Kolom: 'Kunci Jawaban',
      Keterangan: 'Wajib diisi salah satu huruf: A, B, C, D, atau E.',
    },
    {
      Kolom: 'Pembahasan',
      Keterangan: 'Opsional. Penjelasan kunci jawaban untuk evaluasi hasil ujian.',
    },
    {
      Kolom: '---',
      Keterangan: 'DAFTAR KODE MATA KULIAH TERDAFTAR:',
    },
    ...courses.map((c) => ({
      Kolom: c.code,
      Keterangan: `${c.name} (Semester ${c.semester || 1}, ${c.sks || 3} SKS)`,
    })),
  ];
  const guideSheet = XLSX.utils.json_to_sheet(guideRows);
  guideSheet['!cols'] = [{ wch: 22 }, { wch: 76 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template 50 Soal PG');
  XLSX.utils.book_append_sheet(workbook, exampleSheet, 'Contoh Pengisian');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Panduan & Kode MK');
  XLSX.writeFile(workbook, filename);
}

export function exportQuestionsToExcelWithOptions(
  questions: QuestionRecord[],
  courses: CourseRecord[],
  filename = 'Bank_Soal_MazCodeID.xlsx'
): void {
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const rows = questions.map((q, idx) => {
    const course = q.courseId ? courseById.get(q.courseId) : undefined;
    const findOpt = (label: string) =>
      q.options?.find((o) => o.optionLabel.toUpperCase() === label)?.optionText || '';

    return {
      No: idx + 1,
      'Kode Mata Kuliah': course?.code || '',
      'Tipe Soal': q.questionType,
      'Tingkat Kesulitan': q.difficulty,
      Bobot: q.weight,
      Pertanyaan: q.questionText,
      'Opsi A': findOpt('A'),
      'Opsi B': findOpt('B'),
      'Opsi C': findOpt('C'),
      'Opsi D': findOpt('D'),
      'Opsi E': findOpt('E'),
      'Kunci Jawaban': q.correctAnswerKey,
      Pembahasan: q.explanation || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...QUESTION_EXPORT_HEADERS],
  });
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 9 },
    { wch: 52 },
    { wch: 26 },
    { wch: 26 },
    { wch: 26 },
    { wch: 26 },
    { wch: 26 },
    { wch: 15 },
    { wch: 36 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bank Soal');
  XLSX.writeFile(workbook, filename);
}

export async function parseQuestionImportFile(
  file: File
): Promise<Array<Record<string, unknown>>> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const preferredSheetName =
    workbook.SheetNames.find((name) =>
      normalizeToken(name).includes('template') ||
      normalizeToken(name).includes('soal')
    ) || workbook.SheetNames[0];

  if (!preferredSheetName) {
    throw new Error('File Excel/CSV tidak memiliki sheet data soal.');
  }

  const sheet = workbook.Sheets[preferredSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
}

export function mapRowsToQuestionImportPayloads(
  rawRows: Array<Record<string, unknown>>,
  lookup: {
    courses: CourseRecord[];
    defaultCourseId?: number | null;
    defaultExamId?: number | null;
  }
): QuestionImportParseResult {
  const validItems: QuestionImportItemPayload[] = [];
  const invalidRows: QuestionImportValidationRow[] = [];
  const previewRows: QuestionImportValidationRow[] = [];
  let skippedEmptyRows = 0;

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];
    const normalizedRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      normalizedRow[normalizeHeader(k)] = v;
    }

    const noVal = getField(normalizedRow, ['no', 'nomor', 'number']);
    const courseInput = getField(normalizedRow, [
      'kode mata kuliah',
      'kode mk',
      'mata kuliah',
      'course code',
      'course',
    ]);
    const typeInput = getField(normalizedRow, ['tipe soal', 'jenis soal', 'tipe', 'type']);
    const difficultyInput = getField(normalizedRow, [
      'tingkat kesulitan',
      'kesulitan',
      'difficulty',
    ]);
    const weightInput = getField(normalizedRow, ['bobot', 'poin', 'weight', 'skor']);
    const questionText = getField(normalizedRow, [
      'pertanyaan',
      'soal',
      'teks pertanyaan',
      'question',
      'question text',
    ]);
    const optA = getField(normalizedRow, ['opsi a', 'pilihan a', 'a', 'option a']);
    const optB = getField(normalizedRow, ['opsi b', 'pilihan b', 'b', 'option b']);
    const optC = getField(normalizedRow, ['opsi c', 'pilihan c', 'c', 'option c']);
    const optD = getField(normalizedRow, ['opsi d', 'pilihan d', 'd', 'option d']);
    const optE = getField(normalizedRow, ['opsi e', 'pilihan e', 'e', 'option e']);
    const keyRaw = getField(normalizedRow, [
      'kunci jawaban',
      'kunci',
      'jawaban',
      'correct answer',
      'answer key',
    ]);
    const explanation = getField(normalizedRow, ['pembahasan', 'penjelasan', 'explanation']);

    // Skip blank/unfilled template rows (where No/Course/Weight may be prefilled in the 50-row template)
    if (!questionText && !optA && !optB && !optC && !optD && !optE && !keyRaw) {
      skippedEmptyRows += 1;
      continue;
    }

    const rowNumber = idx + 2;
    const questionType = normalizeQuestionType(typeInput);
    const difficulty = normalizeDifficulty(difficultyInput);
    const weight = parsePositiveWeight(weightInput, 2);

    const courseToken = normalizeToken(courseInput);
    const matchedCourse = courseToken
      ? lookup.courses.find(
          (c) =>
            normalizeToken(c.code) === courseToken ||
            normalizeToken(c.name) === courseToken
        )
      : undefined;
    const resolvedCourseId =
      matchedCourse?.id ?? (lookup.defaultCourseId || lookup.courses[0]?.id || null);
    const resolvedCourse = resolvedCourseId
      ? lookup.courses.find((c) => c.id === resolvedCourseId)
      : undefined;

    const errors: string[] = [];
    if (!questionText) {
      errors.push('Pertanyaan wajib diisi');
    }

    let options: QuestionImportOptionPayload[] = [];
    let normalizedKey = keyRaw.trim().toUpperCase();

    if (questionType === 'pilihan_ganda') {
      if (!optA) errors.push('Opsi A wajib diisi');
      if (!optB) errors.push('Opsi B wajib diisi');
      if (!optC) errors.push('Opsi C wajib diisi');
      if (!optD) errors.push('Opsi D wajib diisi');

      const allowedKeys = optE ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
      if (!normalizedKey) {
        errors.push('Kunci Jawaban wajib diisi (A-E)');
      } else if (!allowedKeys.includes(normalizedKey)) {
        errors.push(
          optE
            ? `Kunci Jawaban "${keyRaw}" harus A, B, C, D, atau E`
            : `Kunci Jawaban "${keyRaw}" tidak valid (isi A-D, atau lengkapi Opsi E)`
        );
      }

      options = [
        { optionLabel: 'A', optionText: optA, isCorrect: normalizedKey === 'A' },
        { optionLabel: 'B', optionText: optB, isCorrect: normalizedKey === 'B' },
        { optionLabel: 'C', optionText: optC, isCorrect: normalizedKey === 'C' },
        { optionLabel: 'D', optionText: optD, isCorrect: normalizedKey === 'D' },
        ...(optE
          ? [{ optionLabel: 'E', optionText: optE, isCorrect: normalizedKey === 'E' }]
          : []),
      ];
    } else if (questionType === 'pilihan_ganda_kompleks') {
      if (!optA || !optB) errors.push('Minimal Opsi A dan Opsi B wajib diisi');
      const keys = normalizedKey
        .split(/[\s,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length === 0) {
        errors.push('Kunci Jawaban wajib diisi (misal: A, C)');
      }
      normalizedKey = keys.join(', ');
      options = [
        ...(optA ? [{ optionLabel: 'A', optionText: optA, isCorrect: keys.includes('A') }] : []),
        ...(optB ? [{ optionLabel: 'B', optionText: optB, isCorrect: keys.includes('B') }] : []),
        ...(optC ? [{ optionLabel: 'C', optionText: optC, isCorrect: keys.includes('C') }] : []),
        ...(optD ? [{ optionLabel: 'D', optionText: optD, isCorrect: keys.includes('D') }] : []),
        ...(optE ? [{ optionLabel: 'E', optionText: optE, isCorrect: keys.includes('E') }] : []),
      ];
    } else {
      normalizedKey = keyRaw.trim() || (questionType === 'benar_salah' ? 'Benar' : '');
      if (!normalizedKey) {
        errors.push('Kunci Jawaban wajib diisi');
      }
    }

    const payload: QuestionImportItemPayload = {
      courseId: resolvedCourseId,
      examId: lookup.defaultExamId ?? null,
      questionType,
      difficulty,
      questionText,
      mediaType: 'none',
      mediaContent: '',
      weight,
      correctAnswerKey: normalizedKey || 'A',
      explanation,
      options,
    };

    const summary: QuestionImportValidationRow = {
      rowNumber,
      questionNumber: noVal || String(previewRows.length + 1),
      courseLabel: resolvedCourse
        ? `${resolvedCourse.code} · ${resolvedCourse.name}`
        : courseInput || 'Umum',
      questionType,
      difficulty,
      weight,
      questionText: questionText || '-',
      correctAnswerKey: normalizedKey || '-',
      optionCount: options.length,
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      payload: errors.length === 0 ? payload : undefined,
    };

    previewRows.push(summary);
    if (errors.length === 0) {
      validItems.push(payload);
    } else {
      invalidRows.push(summary);
    }
  }

  return {
    validItems,
    invalidRows,
    previewRows,
    skippedEmptyRows,
  };
}
