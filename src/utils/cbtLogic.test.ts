import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeSingleQuestion,
  evaluateExamSubmission,
  computeWarningLevel,
  deterministicShuffle,
  computeGradeLetter,
  normalizeStudentIdentity,
  matchesStudentCredentials,
  parseDataImageUrl,
  toPublicSnapshotUrl,
  formatRemainingTime,
  getExamTimerAlertState,
} from './cbtLogic';

test('gradeSingleQuestion grades single choice, complex choice, true/false, short answer, and essay accurately', () => {
  const mc = gradeSingleQuestion(
    { id: 1, questionType: 'pilihan_ganda', weight: 20, correctAnswerKey: 'B' },
    'b'
  );
  assert.equal(mc.isCorrect, true);
  assert.equal(mc.scoreEarned, 20);

  const complexExact = gradeSingleQuestion(
    { id: 2, questionType: 'pilihan_ganda_kompleks', weight: 20, correctAnswerKey: 'A, C' },
    'C, A'
  );
  assert.equal(complexExact.isCorrect, true);
  assert.equal(complexExact.scoreEarned, 20);

  const complexPartial = gradeSingleQuestion(
    { id: 2, questionType: 'pilihan_ganda_kompleks', weight: 20, correctAnswerKey: 'A, C' },
    'A'
  );
  assert.equal(complexPartial.isCorrect, false);
  assert.equal(complexPartial.scoreEarned, 10);

  const tf = gradeSingleQuestion(
    { id: 3, questionType: 'benar_salah', weight: 10, correctAnswerKey: 'Benar' },
    'Benar'
  );
  assert.equal(tf.isCorrect, true);
  assert.equal(tf.scoreEarned, 10);

  const shortAns = gradeSingleQuestion(
    { id: 4, questionType: 'isian_singkat', weight: 20, correctAnswerKey: 'deadlock|mutual exclusion' },
    'Kondisi Deadlock'
  );
  assert.equal(shortAns.isCorrect, true);
  assert.equal(shortAns.scoreEarned, 20);

  const essayRubric = gradeSingleQuestion(
    { id: 5, questionType: 'esai', weight: 30, correctAnswerKey: 'enkripsi, autentikasi, integritas' },
    'Sistem keamanan jaringan membutuhkan enkripsi data, autentikasi pengguna, serta integritas paket.'
  );
  assert.equal(essayRubric.isCorrect, true);
  assert.equal(essayRubric.scoreEarned, 30);
});

test('evaluateExamSubmission computes final score, counts, and verification status', () => {
  const questions = [
    { id: 1, questionType: 'pilihan_ganda', weight: 25, correctAnswerKey: 'A' },
    { id: 2, questionType: 'benar_salah', weight: 25, correctAnswerKey: 'Salah' },
    { id: 3, questionType: 'isian_singkat', weight: 25, correctAnswerKey: 'postgresql' },
    { id: 4, questionType: 'esai', weight: 25, correctAnswerKey: 'webrtc, kamera' },
  ];

  const summary = evaluateExamSubmission(
    questions,
    [
      { questionId: 1, answerValue: 'A' },
      { questionId: 2, answerValue: 'Benar' }, // wrong
      { questionId: 3, answerValue: '' }, // empty
      { questionId: 4, answerValue: 'Pengawasan menggunakan WebRTC dan akses kamera browser.' },
    ],
    3,
    3
  );

  assert.equal(summary.correctCount, 2);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.emptyCount, 1);
  assert.equal(summary.finalScore, 50);
  assert.equal(summary.gradeLetter, computeGradeLetter(50));
  assert.equal(summary.verificationStatus, 'Perlu Tinjauan Pengawas');
});

test('computeWarningLevel returns tiered warnings 1, 2, and 3', () => {
  assert.equal(computeWarningLevel(1).level, 1);
  assert.equal(computeWarningLevel(2).level, 2);
  assert.equal(computeWarningLevel(3).level, 3);
  assert.equal(computeWarningLevel(5).level, 3);
});

test('deterministicShuffle produces repeatable permutation per student session seed', () => {
  const list = [10, 20, 30, 40, 50];
  const first = deterministicShuffle(list, 1042);
  const second = deterministicShuffle(list, 1042);
  assert.deepEqual(first, second);
  assert.equal(first.length, list.length);
});

test('matchesStudentCredentials normalizes spacing and case for NIM and fullName', () => {
  const student = { nim: '2026101001', fullName: 'Budi Santoso' };
  assert.equal(normalizeStudentIdentity('  Budi   Santoso '), 'budi santoso');
  assert.equal(matchesStudentCredentials(student, ' 2026101001 ', 'budi   santoso'), true);
  assert.equal(matchesStudentCredentials(student, '2026101002', 'Budi Santoso'), false);
  assert.equal(matchesStudentCredentials(student, '2026101001', 'Budi Wijaya'), false);
  assert.equal(matchesStudentCredentials(student, '', 'Budi Santoso'), false);
});

test('parseDataImageUrl and toPublicSnapshotUrl strip inline Base64 blobs safely', () => {
  const parsed = parseDataImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  assert.deepEqual(parsed, {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    base64Data: '/9j/4AAQSkZJRg==',
  });
  assert.equal(parseDataImageUrl('/uploads/snapshots/snap_1.jpg'), null);
  assert.equal(
    toPublicSnapshotUrl(42, 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    '/api/cbt/snapshots/42/image'
  );
  assert.equal(
    toPublicSnapshotUrl(42, '/uploads/snapshots/snap_42.jpg'),
    '/uploads/snapshots/snap_42.jpg'
  );
});

test('formatRemainingTime formats MM:SS and HH:MM:SS safely', () => {
  assert.equal(formatRemainingTime(3665), '01:01:05');
  assert.equal(formatRemainingTime(300), '05:00');
  assert.equal(formatRemainingTime(60), '01:00');
  assert.equal(formatRemainingTime(-5), '00:00');
});

test('getExamTimerAlertState detects normal, 5-minute warning, 1-minute critical, and expired thresholds', () => {
  const normal = getExamTimerAlertState(900, 60);
  assert.equal(normal.level, 'normal');
  assert.equal(normal.progressPercent, 25);
  assert.equal(normal.bannerTitle, null);

  const warn5 = getExamTimerAlertState(300, 60);
  assert.equal(warn5.level, 'warning_5m');
  assert.match(warn5.bannerTitle || '', /5 Menit/);

  const warnUnder5 = getExamTimerAlertState(125, 60);
  assert.equal(warnUnder5.level, 'warning_5m');

  const crit1 = getExamTimerAlertState(60, 60);
  assert.equal(crit1.level, 'critical_1m');
  assert.match(crit1.bannerTitle || '', /1 Menit/);

  const critUnder1 = getExamTimerAlertState(12, 60);
  assert.equal(critUnder1.level, 'critical_1m');

  const expired = getExamTimerAlertState(0, 60);
  assert.equal(expired.level, 'expired');
  assert.equal(expired.progressPercent, 0);
});

