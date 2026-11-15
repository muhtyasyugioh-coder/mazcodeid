export interface QuestionForGrading {
  id: number;
  questionType: string; // 'pilihan_ganda' | 'pilihan_ganda_kompleks' | 'benar_salah' | 'isian_singkat' | 'esai'
  weight: number;
  correctAnswerKey: string;
}

export interface AnswerSubmission {
  questionId: number;
  answerValue: string;
  isDoubtful?: boolean;
  manualScore?: number;
}

export interface GradedQuestionResult {
  questionId: number;
  isCorrect: boolean;
  scoreEarned: number;
  isObjective: boolean;
}

export interface ExamEvaluationSummary {
  correctCount: number;
  wrongCount: number;
  emptyCount: number;
  objectiveScore: number;
  essayScore: number;
  finalScore: number;
  gradeLetter: string;
  verificationStatus: string;
  gradedItems: GradedQuestionResult[];
}

export function normalizeAnswerText(val: string): string {
  return (val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeSingleQuestion(
  question: QuestionForGrading,
  answerValue: string,
  manualEssayScore?: number
): GradedQuestionResult {
  const rawAnswer = (answerValue || '').trim();
  const isObjective = question.questionType !== 'esai';

  if (!rawAnswer) {
    return {
      questionId: question.id,
      isCorrect: false,
      scoreEarned: 0,
      isObjective,
    };
  }

  if (question.questionType === 'pilihan_ganda' || question.questionType === 'benar_salah') {
    const isCorrect =
      normalizeAnswerText(rawAnswer) === normalizeAnswerText(question.correctAnswerKey);
    return {
      questionId: question.id,
      isCorrect,
      scoreEarned: isCorrect ? question.weight : 0,
      isObjective: true,
    };
  }

  if (question.questionType === 'pilihan_ganda_kompleks') {
    const expectedSet = new Set(
      question.correctAnswerKey
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    );
    const actualSet = new Set(
      rawAnswer
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    );

    if (expectedSet.size === 0) {
      return { questionId: question.id, isCorrect: false, scoreEarned: 0, isObjective: true };
    }

    let matchedCorrect = 0;
    let wrongSelected = 0;
    actualSet.forEach((item) => {
      if (expectedSet.has(item)) {
        matchedCorrect += 1;
      } else {
        wrongSelected += 1;
      }
    });

    const isExactMatch =
      matchedCorrect === expectedSet.size && wrongSelected === 0 && actualSet.size === expectedSet.size;

    if (isExactMatch) {
      return {
        questionId: question.id,
        isCorrect: true,
        scoreEarned: question.weight,
        isObjective: true,
      };
    }

    // Partial credit for complex multiple choice if no wrong option selected
    if (matchedCorrect > 0 && wrongSelected === 0) {
      const partialScore = Math.round((matchedCorrect / expectedSet.size) * question.weight);
      return {
        questionId: question.id,
        isCorrect: false,
        scoreEarned: partialScore,
        isObjective: true,
      };
    }

    return {
      questionId: question.id,
      isCorrect: false,
      scoreEarned: 0,
      isObjective: true,
    };
  }

  if (question.questionType === 'isian_singkat') {
    const acceptedKeys = question.correctAnswerKey
      .split('|')
      .map((k) => normalizeAnswerText(k))
      .filter(Boolean);
    const normalizedStudent = normalizeAnswerText(rawAnswer);
    const isCorrect = acceptedKeys.some(
      (k) => normalizedStudent === k || normalizedStudent.includes(k)
    );
    return {
      questionId: question.id,
      isCorrect,
      scoreEarned: isCorrect ? question.weight : 0,
      isObjective: true,
    };
  }

  // Esai
  if (typeof manualEssayScore === 'number') {
    const clamped = Math.max(0, Math.min(question.weight, manualEssayScore));
    return {
      questionId: question.id,
      isCorrect: clamped >= question.weight * 0.6,
      scoreEarned: clamped,
      isObjective: false,
    };
  }

  // Automatic initial rubric check based on keywords in correctAnswerKey
  const keywords = question.correctAnswerKey
    .split(',')
    .map((k) => normalizeAnswerText(k))
    .filter(Boolean);
  const normalizedEssay = normalizeAnswerText(rawAnswer);
  if (keywords.length === 0) {
    return {
      questionId: question.id,
      isCorrect: rawAnswer.length >= 20,
      scoreEarned: rawAnswer.length >= 20 ? Math.round(question.weight * 0.8) : 0,
      isObjective: false,
    };
  }

  const matchedKeywords = keywords.filter((kw) => normalizedEssay.includes(kw)).length;
  const ratio = Math.min(1, matchedKeywords / Math.max(1, Math.ceil(keywords.length * 0.7)));
  const scoreEarned = Math.round(ratio * question.weight);

  return {
    questionId: question.id,
    isCorrect: ratio >= 0.6,
    scoreEarned,
    isObjective: false,
  };
}

export function computeGradeLetter(score: number): string {
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'E';
}

export function determineVerificationStatus(
  violationCount: number,
  maxViolations: number = 3
): string {
  if (violationCount === 0) return 'Terverifikasi Aman';
  if (violationCount < maxViolations) return 'Catatan Peringatan Ringan';
  return 'Perlu Tinjauan Pengawas';
}

export function evaluateExamSubmission(
  questions: QuestionForGrading[],
  answers: AnswerSubmission[],
  violationCount: number = 0,
  maxViolations: number = 3
): ExamEvaluationSummary {
  const answerMap = new Map<number, AnswerSubmission>();
  for (const ans of answers) {
    answerMap.set(ans.questionId, ans);
  }

  let correctCount = 0;
  let wrongCount = 0;
  let emptyCount = 0;
  let earnedObjectiveWeight = 0;
  let earnedEssayWeight = 0;
  let totalWeight = 0;

  const gradedItems: GradedQuestionResult[] = [];

  for (const q of questions) {
    totalWeight += q.weight;
    const sub = answerMap.get(q.id);
    const val = sub?.answerValue?.trim() || '';

    if (!val) {
      emptyCount += 1;
      gradedItems.push({
        questionId: q.id,
        isCorrect: false,
        scoreEarned: 0,
        isObjective: q.questionType !== 'esai',
      });
      continue;
    }

    const graded = gradeSingleQuestion(q, val, sub?.manualScore);
    gradedItems.push(graded);

    if (graded.isCorrect) {
      correctCount += 1;
    } else {
      wrongCount += 1;
    }

    if (graded.isObjective) {
      earnedObjectiveWeight += graded.scoreEarned;
    } else {
      earnedEssayWeight += graded.scoreEarned;
    }
  }

  const normalizer = totalWeight > 0 ? 100 / totalWeight : 1;
  const objectiveScore = Math.round(earnedObjectiveWeight * normalizer);
  const essayScore = Math.round(earnedEssayWeight * normalizer);
  const finalScore = Math.min(100, Math.round((earnedObjectiveWeight + earnedEssayWeight) * normalizer));

  return {
    correctCount,
    wrongCount,
    emptyCount,
    objectiveScore,
    essayScore,
    finalScore,
    gradeLetter: computeGradeLetter(finalScore),
    verificationStatus: determineVerificationStatus(violationCount, maxViolations),
    gradedItems,
  };
}

export function computeWarningLevel(newViolationCount: number): {
  level: 1 | 2 | 3;
  label: string;
  message: string;
} {
  if (newViolationCount <= 1) {
    return {
      level: 1,
      label: 'Peringatan 1: Pelanggaran Ringan',
      message:
        'Sistem mendeteksi aktivitas di luar ketentuan ujian. Tetap fokus pada layar ujian dan pastikan kamera selalu aktif.',
    };
  }
  if (newViolationCount === 2) {
    return {
      level: 2,
      label: 'Peringatan 2: Pelanggaran Berulang',
      message:
        'Ini adalah peringatan kedua. Aktivitas Anda telah dikirimkan ke dashboard Dosen Pengawas dan Admin secara real-time.',
    };
  }
  return {
    level: 3,
    label: 'Peringatan 3: Pelanggaran Serius',
    message:
      'Batas toleransi peringatan tercapai. Sesi ujian Anda ditandai "Perlu Tinjauan Pengawas" untuk verifikasi integritas akademik.',
  };
}

export function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let currentSeed = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    const j = currentSeed % (i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function normalizeStudentIdentity(value: string): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchesStudentCredentials(
  student: { nim: string; fullName: string },
  nimInput: string,
  fullNameInput: string
): boolean {
  const cleanNim = normalizeStudentIdentity(nimInput);
  const cleanName = normalizeStudentIdentity(fullNameInput);
  if (!cleanNim || !cleanName) return false;
  return (
    normalizeStudentIdentity(student.nim) === cleanNim &&
    normalizeStudentIdentity(student.fullName) === cleanName
  );
}

export function parseDataImageUrl(dataUrl: string): {
  mimeType: string;
  extension: string;
  base64Data: string;
} | null {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    (dataUrl || '').trim()
  );
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return {
    mimeType,
    extension,
    base64Data: match[2],
  };
}

export function toPublicSnapshotUrl(snapshotId: number, storedUrl: string): string {
  const clean = (storedUrl || '').trim();
  if (!clean || clean.startsWith('data:')) {
    return `/api/cbt/snapshots/${snapshotId}/image`;
  }
  return clean;
}

export type ExamTimerAlertLevel = 'normal' | 'warning_5m' | 'critical_1m' | 'expired';

export interface ExamTimerAlertState {
  level: ExamTimerAlertLevel;
  progressPercent: number;
  bannerTitle: string | null;
  bannerMessage: string | null;
}

export function formatRemainingTime(remainingSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(Number.isFinite(remainingSeconds) ? remainingSeconds : 0));
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = safeSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getExamTimerAlertState(
  remainingSeconds: number,
  totalDurationMinutes: number
): ExamTimerAlertState {
  const safeSec = Math.max(0, Math.floor(Number.isFinite(remainingSeconds) ? remainingSeconds : 0));
  const totalSec = Math.max(1, Math.round((totalDurationMinutes || 1) * 60));
  const progressPercent = Math.min(100, Math.max(0, Math.round((safeSec / totalSec) * 100)));

  if (safeSec <= 0) {
    return {
      level: 'expired',
      progressPercent: 0,
      bannerTitle: 'Waktu Ujian Telah Habis',
      bannerMessage:
        'Durasi ujian telah berakhir. Sistem sedang mengumpulkan seluruh jawaban Anda secara otomatis.',
    };
  }

  if (safeSec <= 60) {
    return {
      level: 'critical_1m',
      progressPercent,
      bannerTitle: 'Peringatan Kritis: 1 Menit Tersisa!',
      bannerMessage:
        'Sisa waktu ujian kurang dari 1 menit. Segera periksa dan kumpulkan jawaban Anda sebelum waktu habis.',
    };
  }

  if (safeSec <= 300) {
    return {
      level: 'warning_5m',
      progressPercent,
      bannerTitle: 'Peringatan Waktu: 5 Menit Tersisa',
      bannerMessage:
        'Waktu pengerjaan ujian tersisa 5 menit lagi. Pastikan seluruh soal yang Anda kerjakan sudah tersimpan.',
    };
  }

  return {
    level: 'normal',
    progressPercent,
    bannerTitle: null,
    bannerMessage: null,
  };
}

