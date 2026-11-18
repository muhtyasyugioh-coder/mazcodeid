import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMultipleChoice50TemplateRows,
  mapRowsToQuestionImportPayloads,
  QUESTION_50_PG_HEADERS,
} from './questionImportExport.ts';
import type { CourseRecord } from '../types/cbt.ts';

const MOCK_COURSES: CourseRecord[] = [
  {
    id: 1,
    code: 'IFST',
    name: 'Sistem Terdistribusi',
    sks: 3,
    semester: 5,
    studyProgramId: 1,
  },
];

test('buildMultipleChoice50TemplateRows generates 50 numbered multiple-choice rows totaling 100 points', () => {
  const rows = buildMultipleChoice50TemplateRows(MOCK_COURSES, 1);

  assert.equal(rows.length, 50);
  assert.equal(rows[0].No, 1);
  assert.equal(rows[49].No, 50);
  assert.equal(rows[0]['Kode Mata Kuliah'], 'IFST');
  assert.equal(rows[0]['Tingkat Kesulitan'], 'Sedang');

  const totalWeight = rows.reduce((sum, r) => sum + Number(r.Bobot), 0);
  assert.equal(totalWeight, 100);

  for (const header of QUESTION_50_PG_HEADERS) {
    assert.ok(header in rows[0], `Missing header ${header}`);
  }
});

test('mapRowsToQuestionImportPayloads skips blank template rows and parses 50 filled PG questions cleanly', () => {
  const unfilled = buildMultipleChoice50TemplateRows(MOCK_COURSES, 1);
  const blankParse = mapRowsToQuestionImportPayloads(unfilled, {
    courses: MOCK_COURSES,
    defaultCourseId: 1,
  });

  assert.equal(blankParse.validItems.length, 0);
  assert.equal(blankParse.invalidRows.length, 0);
  assert.equal(blankParse.skippedEmptyRows, 50);

  const keys = ['A', 'B', 'C', 'D', 'E'] as const;
  const filled50 = unfilled.map((row, idx) => ({
    ...row,
    Pertanyaan: `Pertanyaan Pilihan Ganda Nomor ${idx + 1}`,
    'Opsi A': `Jawaban A #${idx + 1}`,
    'Opsi B': `Jawaban B #${idx + 1}`,
    'Opsi C': `Jawaban C #${idx + 1}`,
    'Opsi D': `Jawaban D #${idx + 1}`,
    'Opsi E': `Jawaban E #${idx + 1}`,
    'Kunci Jawaban': keys[idx % 5],
    Pembahasan: `Pembahasan soal #${idx + 1}`,
  }));

  const parsed50 = mapRowsToQuestionImportPayloads(filled50, {
    courses: MOCK_COURSES,
    defaultCourseId: 1,
  });

  assert.equal(parsed50.validItems.length, 50);
  assert.equal(parsed50.invalidRows.length, 0);
  assert.equal(parsed50.skippedEmptyRows, 0);
  assert.equal(parsed50.validItems[0].options.length, 5);
  assert.equal(parsed50.validItems[0].correctAnswerKey, 'A');
  assert.equal(parsed50.validItems[0].options[0].isCorrect, true);
  assert.equal(parsed50.validItems[0].options[1].isCorrect, false);
  assert.equal(parsed50.validItems[49].correctAnswerKey, 'E');
  assert.equal(parsed50.validItems[49].options[4].isCorrect, true);
});

test('mapRowsToQuestionImportPayloads flags missing required options or invalid answer key', () => {
  const result = mapRowsToQuestionImportPayloads(
    [
      {
        No: 1,
        'Kode Mata Kuliah': 'ifst',
        Pertanyaan: 'Soal tanpa opsi lengkap',
        'Opsi A': 'Benar',
        'Opsi B': '',
        'Opsi C': 'Salah',
        'Opsi D': 'Salah',
        'Kunci Jawaban': 'Z',
      },
    ],
    {
      courses: MOCK_COURSES,
      defaultCourseId: 1,
    }
  );

  assert.equal(result.validItems.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.match(result.invalidRows[0].error || '', /Opsi B wajib diisi/);
  assert.match(result.invalidRows[0].error || '', /Kunci Jawaban/);
});
