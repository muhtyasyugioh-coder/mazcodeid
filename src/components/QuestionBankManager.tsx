import React, { useState } from 'react';
import {
  Plus,
  Download,
  Upload,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  CheckCircle2,
  BookOpen,
  Image as ImageIcon,
} from 'lucide-react';
import { CbtSystemState, QuestionRecord } from '../types/cbt';
import { exportQuestionsToExcel } from '../utils/exportHelpers';

interface QuestionBankManagerProps {
  state: CbtSystemState;
  onCreateQuestion: (payload: any) => Promise<void>;
  onUpdateQuestion: (id: number, payload: any) => Promise<void>;
  onImportQuestions: (items: any[]) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
}

export const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({
  state,
  onCreateQuestion,
  onUpdateQuestion,
  onImportQuestions,
  onDeleteQuestion,
}) => {
  const [selectedCourseFilter, setSelectedCourseFilter] =
    useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] =
    useState<string>('all');
  const [showAnswerKeys, setShowAnswerKeys] = useState<boolean>(true);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null
  );
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [csvImportText, setCsvImportText] = useState<string>('');

  // Form state for Create & Update
  const [courseId, setCourseId] = useState<string>(
    state.courses[0]?.id ? String(state.courses[0].id) : ''
  );
  const [questionType, setQuestionType] =
    useState<QuestionRecord['questionType']>('pilihan_ganda');
  const [difficulty, setDifficulty] = useState<string>('Sedang');
  const [weight, setWeight] = useState<number>(15);
  const [questionText, setQuestionText] = useState<string>('');
  const [mediaType, setMediaType] =
    useState<QuestionRecord['mediaType']>('none');
  const [mediaContent, setMediaContent] = useState<string>('');
  const [correctAnswerKey, setCorrectAnswerKey] = useState<string>('A');
  const [explanation, setExplanation] = useState<string>('');
  const [optionA, setOptionA] = useState<string>('');
  const [optionB, setOptionB] = useState<string>('');
  const [optionC, setOptionC] = useState<string>('');
  const [optionD, setOptionD] = useState<string>('');
  const [optionE, setOptionE] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');

  const filteredQuestions = state.questions.filter((q) => {
    const matchCourse =
      selectedCourseFilter === 'all' ||
      String(q.courseId) === selectedCourseFilter;
    const matchType =
      selectedTypeFilter === 'all' || q.questionType === selectedTypeFilter;
    const matchDiff =
      selectedDifficultyFilter === 'all' ||
      q.difficulty === selectedDifficultyFilter;
    return matchCourse && matchType && matchDiff;
  });

  const resetForm = () => {
    setEditingQuestionId(null);
    setCourseId(state.courses[0]?.id ? String(state.courses[0].id) : '');
    setQuestionType('pilihan_ganda');
    setDifficulty('Sedang');
    setWeight(15);
    setQuestionText('');
    setMediaType('none');
    setMediaContent('');
    setCorrectAnswerKey('A');
    setExplanation('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setOptionE('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleOpenEdit = (q: QuestionRecord) => {
    setEditingQuestionId(q.id);
    setCourseId(q.courseId ? String(q.courseId) : '');
    setQuestionType(q.questionType);
    setDifficulty(q.difficulty || 'Sedang');
    setWeight(q.weight || 10);
    setQuestionText(q.questionText);
    setMediaType(q.mediaType || 'none');
    setMediaContent(q.mediaContent || '');
    setCorrectAnswerKey(q.correctAnswerKey || 'A');
    setExplanation(q.explanation || '');

    const findOpt = (label: string) =>
      q.options?.find((o) => o.optionLabel === label)?.optionText || '';
    setOptionA(findOpt('A'));
    setOptionB(findOpt('B'));
    setOptionC(findOpt('C'));
    setOptionD(findOpt('D'));
    setOptionE(findOpt('E'));
    setShowForm(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMediaType('image');
        setMediaContent(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    setSubmitting(true);
    try {
      const options =
        questionType === 'pilihan_ganda' ||
        questionType === 'pilihan_ganda_kompleks'
          ? [
              {
                optionLabel: 'A',
                optionText: optionA || 'Opsi Jawaban A',
                isCorrect: correctAnswerKey.toUpperCase().includes('A'),
              },
              {
                optionLabel: 'B',
                optionText: optionB || 'Opsi Jawaban B',
                isCorrect: correctAnswerKey.toUpperCase().includes('B'),
              },
              {
                optionLabel: 'C',
                optionText: optionC || 'Opsi Jawaban C',
                isCorrect: correctAnswerKey.toUpperCase().includes('C'),
              },
              {
                optionLabel: 'D',
                optionText: optionD || 'Opsi Jawaban D',
                isCorrect: correctAnswerKey.toUpperCase().includes('D'),
              },
              ...(questionType === 'pilihan_ganda'
                ? [
                    {
                      optionLabel: 'E',
                      optionText: optionE || 'Opsi Jawaban E',
                      isCorrect: correctAnswerKey.toUpperCase().includes('E'),
                    },
                  ]
                : []),
            ]
          : [];

      const payload = {
        courseId: courseId ? Number(courseId) : null,
        examId: state.exams[0]?.id || null,
        questionType,
        difficulty,
        questionText,
        mediaType,
        mediaContent: mediaType === 'none' ? '' : mediaContent,
        weight: Number(weight) || 10,
        correctAnswerKey,
        explanation,
        options,
      };

      if (editingQuestionId !== null) {
        await onUpdateQuestion(editingQuestionId, payload);
        setFeedbackMsg('Butir soal berhasil diperbarui di database PostgreSQL.');
      } else {
        await onCreateQuestion(payload);
        setFeedbackMsg(
          'Butir soal baru berhasil ditambahkan ke Bank Soal PostgreSQL.'
        );
      }

      resetForm();
      setShowForm(false);
      setTimeout(() => setFeedbackMsg(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    if (!csvImportText.trim()) return;
    setSubmitting(true);
    try {
      const lines = csvImportText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const items = lines.map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        const qType = parts[0] || 'pilihan_ganda';
        const diff = parts[1] || 'Sedang';
        const qText = parts[2] || line;
        const w = Number(parts[3]) || 10;
        const key = parts[4] || 'A';
        const exp = parts[5] || '';
        return {
          courseId: state.courses[0]?.id || null,
          questionType: qType,
          difficulty: diff,
          questionText: qText,
          weight: w,
          correctAnswerKey: key,
          explanation: exp,
          options:
            qType === 'pilihan_ganda'
              ? [
                  {
                    optionLabel: 'A',
                    optionText: parts[6] || 'Pilihan A',
                    isCorrect: key.toUpperCase() === 'A',
                  },
                  {
                    optionLabel: 'B',
                    optionText: parts[7] || 'Pilihan B',
                    isCorrect: key.toUpperCase() === 'B',
                  },
                  {
                    optionLabel: 'C',
                    optionText: parts[8] || 'Pilihan C',
                    isCorrect: key.toUpperCase() === 'C',
                  },
                  {
                    optionLabel: 'D',
                    optionText: parts[9] || 'Pilihan D',
                    isCorrect: key.toUpperCase() === 'D',
                  },
                  {
                    optionLabel: 'E',
                    optionText: parts[10] || 'Pilihan E',
                    isCorrect: key.toUpperCase() === 'E',
                  },
                ]
              : [],
        };
      });
      await onImportQuestions(items);
      setCsvImportText('');
      setShowImportModal(false);
      setFeedbackMsg(
        `${items.length} butir soal berhasil diimpor ke Bank Soal.`
      );
      setTimeout(() => setFeedbackMsg(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const formatQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'pilihan_ganda':
        return 'Pilihan Ganda (A–E)';
      case 'pilihan_ganda_kompleks':
        return 'Pilihan Ganda Kompleks';
      case 'benar_salah':
        return 'Benar / Salah';
      case 'isian_singkat':
        return 'Isian Singkat';
      case 'esai':
        return 'Esai Analitis';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Manajemen Bank Soal Terpadu
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Tambah, edit, hapus, impor, dan ekspor soal Pilihan Ganda, Kompleks,
            Benar/Salah, Isian Singkat, Esai, Gambar, Tabel, &amp; Rumus.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAnswerKeys((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {showAnswerKeys ? (
              <>
                <EyeOff className="w-4 h-4" />
                Sembunyikan Kunci Jawaban
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Tampilkan Kunci Jawaban
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            Import Soal
          </button>

          <button
            type="button"
            onClick={() => exportQuestionsToExcel(filteredQuestions)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={() => (showForm ? setShowForm(false) : handleOpenCreate())}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {showForm ? 'Tutup Form Soal' : 'Tambah Soal Baru'}
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Create / Edit Question Form */}
      {showForm && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              {editingQuestionId !== null
                ? `Edit Butir Soal #${editingQuestionId}`
                : 'Tambah Butir Soal Baru ke Bank Soal'}
            </h3>
            <span className="text-xs text-slate-500">
              Tersimpan langsung di PostgreSQL
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mata Kuliah
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Umum / Pilih Mata Kuliah --</option>
                {state.courses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jenis Soal
              </label>
              <select
                value={questionType}
                onChange={(e) =>
                  setQuestionType(
                    e.target.value as QuestionRecord['questionType']
                  )
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                <option value="pilihan_ganda">
                  Pilihan Ganda (A, B, C, D, E)
                </option>
                <option value="pilihan_ganda_kompleks">
                  Pilihan Ganda Kompleks (Multi-Jawaban)
                </option>
                <option value="benar_salah">Benar atau Salah</option>
                <option value="isian_singkat">Isian Singkat</option>
                <option value="esai">Esai Analitis</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tingkat Kesulitan
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                <option value="Mudah">Mudah</option>
                <option value="Sedang">Sedang</option>
                <option value="Sulit">Sulit</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bobot Nilai (Poin)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Teks Pertanyaan
            </label>
            <textarea
              required
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Tuliskan redaksi soal secara jelas dan lengkap..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
            />
          </div>

          {/* Media Attachment Selector (Gambar / Tabel / Rumus Matematika) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lampiran Media Soal
              </label>
              <select
                value={mediaType}
                onChange={(e) =>
                  setMediaType(e.target.value as QuestionRecord['mediaType'])
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                <option value="none">Tanpa Lampiran Khusus</option>
                <option value="image">Soal dengan Gambar / Foto</option>
                <option value="math">Soal dengan Rumus Matematika</option>
                <option value="table">Soal dengan Tabel Data</option>
              </select>
            </div>

            {mediaType !== 'none' && (
              <div className="md:col-span-2 space-y-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {mediaType === 'math'
                    ? 'Ekspresi Rumus Matematika (contoh: φ(n) = (p - 1)(q - 1))'
                    : mediaType === 'image'
                      ? 'URL Gambar atau Upload File Foto Soal'
                      : 'Data Tabel JSON (contoh: {"headers":["Kolom 1","Kolom 2"],"rows":[["A","10"]]})'}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={mediaContent}
                    onChange={(e) => setMediaContent(e.target.value)}
                    placeholder={
                      mediaType === 'math'
                        ? 'C ≡ M^e (mod n)'
                        : mediaType === 'image'
                          ? 'Tempel URL gambar atau pilih file foto di samping'
                          : '{"headers":["Kolom 1","Kolom 2"],"rows":[["Data A","100"]]}'
                    }
                    className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md font-mono"
                  />
                  {mediaType === 'image' && (
                    <label className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md cursor-pointer hover:bg-slate-100 flex items-center gap-1.5 shrink-0">
                      <ImageIcon className="w-4 h-4 text-orange-500" />
                      <span>Upload Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Options for Multiple Choice */}
          {(questionType === 'pilihan_ganda' ||
            questionType === 'pilihan_ganda_kompleks') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilihan A
                </label>
                <input
                  type="text"
                  required
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                  placeholder="Teks opsi jawaban A"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilihan B
                </label>
                <input
                  type="text"
                  required
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                  placeholder="Teks opsi jawaban B"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilihan C
                </label>
                <input
                  type="text"
                  required
                  value={optionC}
                  onChange={(e) => setOptionC(e.target.value)}
                  placeholder="Teks opsi jawaban C"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilihan D
                </label>
                <input
                  type="text"
                  required
                  value={optionD}
                  onChange={(e) => setOptionD(e.target.value)}
                  placeholder="Teks opsi jawaban D"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                />
              </div>
              {questionType === 'pilihan_ganda' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pilihan E
                  </label>
                  <input
                    type="text"
                    required
                    value={optionE}
                    onChange={(e) => setOptionE(e.target.value)}
                    placeholder="Teks opsi jawaban E"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kunci Jawaban Resmi (
                {questionType === 'pilihan_ganda'
                  ? 'A / B / C / D / E'
                  : questionType === 'pilihan_ganda_kompleks'
                    ? 'Contoh: A, C'
                    : questionType === 'benar_salah'
                      ? 'Benar / Salah'
                      : 'Kata Kunci Penilaian Otomatis'}
                )
              </label>
              <input
                type="text"
                required
                value={correctAnswerKey}
                onChange={(e) => setCorrectAnswerKey(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pembahasan Jawaban
              </label>
              <input
                type="text"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Penjelasan konsep atau rumus penyelesaian..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg cursor-pointer"
            >
              {submitting
                ? 'Menyimpan...'
                : editingQuestionId !== null
                  ? 'Simpan Perubahan Soal'
                  : 'Simpan Soal Baru'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Filter Mata Kuliah
          </label>
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          >
            <option value="all">
              Semua Mata Kuliah ({state.questions.length} Soal)
            </option>
            {state.courses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Filter Jenis Soal
          </label>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          >
            <option value="all">Semua Jenis Soal</option>
            <option value="pilihan_ganda">Pilihan Ganda</option>
            <option value="pilihan_ganda_kompleks">
              Pilihan Ganda Kompleks
            </option>
            <option value="benar_salah">Benar atau Salah</option>
            <option value="isian_singkat">Isian Singkat</option>
            <option value="esai">Esai</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Filter Tingkat Kesulitan
          </label>
          <select
            value={selectedDifficultyFilter}
            onChange={(e) => setSelectedDifficultyFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          >
            <option value="all">Semua Tingkat Kesulitan</option>
            <option value="Mudah">Mudah</option>
            <option value="Sedang">Sedang</option>
            <option value="Sulit">Sulit</option>
          </select>
        </div>
      </div>

      {/* Question List */}
      {filteredQuestions.length === 0 ? (
        <div className="border border-slate-200 rounded-xl p-10 text-center bg-white space-y-3">
          <div className="text-sm font-bold text-slate-900">
            Bank Soal Masih Kosong
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Belum ada data butir soal pada kategori ini. Klik tombol di bawah
            untuk membuat soal baru secara langsung atau mengimpor soal.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Tambah Soal Pertama
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => {
            const course = state.courses.find((c) => c.id === q.courseId);
            let parsedTable: { headers: string[]; rows: string[][] } | null =
              null;
            if (q.mediaType === 'table' && q.mediaContent) {
              try {
                parsedTable = JSON.parse(q.mediaContent);
              } catch {
                parsedTable = null;
              }
            }

            return (
              <div
                key={q.id}
                className="border border-slate-200 rounded-xl p-5 bg-white space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-mono font-bold text-slate-900">
                      Soal #{idx + 1}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-orange-600">
                      {formatQuestionTypeLabel(q.questionType)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {course
                        ? `${course.code} ${course.name}`
                        : 'Tanpa Mata Kuliah'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Kesulitan: {q.difficulty}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      Bobot: {q.weight} Poin
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(q)}
                      className="text-xs text-slate-700 hover:text-orange-600 font-semibold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus soal nomor ${idx + 1}`}
                      onClick={() => onDeleteQuestion(q.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-900 leading-relaxed font-medium">
                  {q.questionText}
                </p>

                {q.mediaType === 'image' && q.mediaContent && (
                  <div className="my-3 rounded-lg overflow-hidden border border-slate-200 max-w-xl bg-slate-900">
                    <img
                      src={q.mediaContent}
                      alt="Diagram Soal"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto"
                    />
                  </div>
                )}

                {q.mediaType === 'math' && q.mediaContent && (
                  <div className="my-2 p-3.5 bg-slate-900 text-orange-300 font-mono text-sm rounded-lg border border-slate-800">
                    {q.mediaContent}
                  </div>
                )}

                {q.mediaType === 'table' && parsedTable && (
                  <div className="my-2 overflow-x-auto border border-slate-200 rounded-lg max-w-2xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 font-semibold">
                          {parsedTable.headers.map((h, i) => (
                            <th
                              key={i}
                              className="py-2 px-3 border-b border-slate-200"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {parsedTable.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((cell, ci) => (
                              <td key={ci} className="py-1.5 px-3">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt) => (
                      <div
                        key={opt.id}
                        className={`px-3 py-2 rounded-md border text-xs flex items-center gap-2 ${
                          showAnswerKeys && opt.isCorrect
                            ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold'
                            : 'border-slate-200 bg-slate-50/60 text-slate-700'
                        }`}
                      >
                        <span className="font-mono font-bold">
                          {opt.optionLabel}.
                        </span>
                        <span>{opt.optionText}</span>
                      </div>
                    ))}
                  </div>
                )}

                {showAnswerKeys && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-emerald-700">
                        Kunci Jawaban Otoritatif:{' '}
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {q.correctAnswerKey}
                      </span>
                    </div>
                    {q.explanation && (
                      <div className="text-slate-500">
                        <BookOpen className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                        Pembahasan: {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import Soal"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Import Soal Massal (Format Baris Pipa / CSV)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Masukkan 1 soal per baris dengan format:{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">
                Tipe | Kesulitan | Pertanyaan | Bobot | Kunci | Pembahasan |
                Opsi A | Opsi B | Opsi C | Opsi D | Opsi E
              </code>
            </p>
            <textarea
              rows={5}
              value={csvImportText}
              onChange={(e) => setCsvImportText(e.target.value)}
              placeholder="pilihan_ganda | Mudah | Apa protokol standar HTTPS? | 10 | A | TLS mengamankan HTTP | TLS 1.3 | FTP | Telnet | SMTP | SNMP"
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting || !csvImportText.trim()}
                onClick={handleImportSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg"
              >
                {submitting ? 'Mengimpor...' : 'Proses Import Soal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
