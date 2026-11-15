import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileUp,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { CbtSystemState, StudentRecord } from '../types/cbt.ts';
import {
  downloadStudentImportTemplate,
  exportStudentsToExcel,
  mapRowsToStudentImportPayloads,
  parseStudentImportFile,
  StudentImportParseResult,
} from '../utils/studentImportExport.ts';

export interface StudentPayload {
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

export interface StudentImportSummary {
  importedCount: number;
  skippedCount: number;
  errors?: Array<{ row: number; nim: string; message: string }>;
}

interface StudentManagerProps {
  state: CbtSystemState;
  onCreateStudent: (payload: StudentPayload) => Promise<void>;
  onUpdateStudent: (studentId: number, payload: StudentPayload) => Promise<void>;
  onDeleteStudent: (studentId: number) => Promise<void>;
  onImportStudents?: (items: StudentPayload[]) => Promise<StudentImportSummary>;
  onNotify: (message: string) => void;
}

const INITIAL_FORM: StudentPayload = {
  nim: '',
  fullName: '',
  email: '',
  facultyId: null,
  studyProgramId: null,
  classId: null,
  semester: 1,
  enrollmentYear: 2026,
  avatarUrl: '',
  isActive: true,
};

export const StudentManager: React.FC<StudentManagerProps> = ({
  state,
  onCreateStudent,
  onUpdateStudent,
  onDeleteStudent,
  onImportStudents,
  onNotify,
}) => {
  const [form, setForm] = useState<StudentPayload>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProdiId, setFilterProdiId] = useState<string>('all');
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importParseResult, setImportParseResult] =
    useState<StudentImportParseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const userById = useMemo(() => {
    const map = new Map<number, (typeof state.users)[number]>();
    state.users.forEach((u) => map.set(u.id, u));
    return map;
  }, [state.users]);

  const facultyById = useMemo(() => {
    const map = new Map<number, (typeof state.faculties)[number]>();
    state.faculties.forEach((f) => map.set(f.id, f));
    return map;
  }, [state.faculties]);

  const prodiById = useMemo(() => {
    const map = new Map<number, (typeof state.studyPrograms)[number]>();
    state.studyPrograms.forEach((p) => map.set(p.id, p));
    return map;
  }, [state.studyPrograms]);

  const classById = useMemo(() => {
    const map = new Map<number, (typeof state.classes)[number]>();
    state.classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [state.classes]);

  const filteredProdiOptions = useMemo(() => {
    if (!form.facultyId) return state.studyPrograms;
    return state.studyPrograms.filter(
      (p) => !p.facultyId || p.facultyId === Number(form.facultyId)
    );
  }, [state.studyPrograms, form.facultyId]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.students.filter((student) => {
      const matchesProdi =
        filterProdiId === 'all' ||
        String(student.studyProgramId || '') === filterProdiId;
      const matchesClass =
        filterClassId === 'all' ||
        String(student.classId || '') === filterClassId;
      if (!matchesProdi || !matchesClass) return false;
      if (!q) return true;
      const linkedUser = userById.get(student.userId);
      return (
        student.nim.toLowerCase().includes(q) ||
        student.fullName.toLowerCase().includes(q) ||
        (linkedUser?.email || '').toLowerCase().includes(q)
      );
    });
  }, [state.students, searchQuery, filterProdiId, filterClassId, userById]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setFormError(null);
  };

  const handleEditClick = (student: StudentRecord) => {
    const linkedUser = userById.get(student.userId);
    setEditingId(student.id);
    setFormError(null);
    setForm({
      nim: student.nim,
      fullName: student.fullName,
      email: linkedUser?.email || '',
      facultyId: student.facultyId ?? null,
      studyProgramId: student.studyProgramId ?? null,
      classId: student.classId ?? null,
      semester: student.semester || 1,
      enrollmentYear: student.enrollmentYear || 2026,
      avatarUrl: student.avatarUrl || linkedUser?.avatarUrl || '',
      isActive: linkedUser?.isActive ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setFormError('Ukuran foto profil maksimal 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanNim = form.nim.trim();
    const cleanName = form.fullName.trim().replace(/\s+/g, ' ');
    if (!cleanNim || !cleanName) {
      setFormError('NIM dan Nama Lengkap mahasiswa wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      const payload: StudentPayload = {
        ...form,
        nim: cleanNim,
        fullName: cleanName,
        email: form.email?.trim() || '',
      };

      if (editingId) {
        await onUpdateStudent(editingId, payload);
        onNotify(`Data mahasiswa ${cleanName} (${cleanNim}) berhasil diperbarui.`);
      } else {
        await onCreateStudent(payload);
        onNotify(`Mahasiswa ${cleanName} (${cleanNim}) berhasil ditambahkan.`);
      }
      resetForm();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data mahasiswa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async (student: StudentRecord) => {
    try {
      setSubmitting(true);
      await onDeleteStudent(student.id);
      setConfirmDeleteId(null);
      if (editingId === student.id) {
        resetForm();
      }
      onNotify(`Data mahasiswa ${student.fullName} (${student.nim}) dihapus.`);
    } catch (err: any) {
      onNotify(err.message || 'Gagal menghapus data mahasiswa.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeStudentsCount = state.students.filter((s) => {
    const u = userById.get(s.userId);
    return u ? u.isActive : true;
  }).length;

  const handleDownloadTemplate = () => {
    downloadStudentImportTemplate({
      faculties: state.faculties,
      studyPrograms: state.studyPrograms,
      classes: state.classes,
    });
    onNotify('Template Excel import mahasiswa berhasil diunduh.');
  };

  const handleExportExcel = () => {
    const targetList = filteredStudents.length > 0 ? filteredStudents : state.students;
    if (targetList.length === 0) {
      onNotify('Belum ada data mahasiswa untuk diexport.');
      return;
    }
    exportStudentsToExcel(targetList, {
      users: state.users,
      faculties: state.faculties,
      studyPrograms: state.studyPrograms,
      classes: state.classes,
    });
    onNotify(`Berhasil mengexport ${targetList.length} data mahasiswa ke Excel.`);
  };

  const resetImportModalState = () => {
    setImportFileName('');
    setImportParseResult(null);
    setImportError(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportFileName(file.name);
    try {
      const rawRows = await parseStudentImportFile(file);
      if (rawRows.length === 0) {
        setImportParseResult(null);
        setImportError('File tidak berisi baris data mahasiswa.');
        return;
      }
      const parsed = mapRowsToStudentImportPayloads(rawRows, {
        faculties: state.faculties,
        studyPrograms: state.studyPrograms,
        classes: state.classes,
        existingStudents: state.students,
      });
      if (parsed.previewRows.length === 0) {
        setImportParseResult(null);
        setImportError('Tidak ada data mahasiswa valid yang ditemukan di file.');
        return;
      }
      setImportParseResult(parsed);
    } catch (err: any) {
      setImportParseResult(null);
      setImportError(err?.message || 'Gagal membaca file Excel/CSV. Pastikan format sesuai template.');
    }
  };

  const handleExecuteImport = async () => {
    if (!onImportStudents) {
      setImportError('Layanan import mahasiswa belum terhubung ke server.');
      return;
    }
    if (!importParseResult || importParseResult.validItems.length === 0) {
      setImportError('Tidak ada baris data valid untuk diimpor.');
      return;
    }
    try {
      setImporting(true);
      setImportError(null);
      const summary = await onImportStudents(importParseResult.validItems);
      if (summary.importedCount > 0) {
        onNotify(
          `Berhasil mengimpor ${summary.importedCount} mahasiswa ke database${
            summary.skippedCount > 0 ? ` (${summary.skippedCount} dilewati)` : ''
          }.`
        );
      }
      if (summary.skippedCount > 0 && summary.errors && summary.errors.length > 0) {
        setImportError(
          summary.errors
            .slice(0, 4)
            .map((e) => `Baris ${e.row} (${e.nim || '-'}): ${e.message}`)
            .join(' | ')
        );
        if (summary.importedCount === 0) {
          return;
        }
      }
      setImportModalOpen(false);
      resetImportModalState();
    } catch (err: any) {
      setImportError(err?.message || 'Gagal menyimpan data import mahasiswa ke database.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight">
            Data Mahasiswa & Peserta Ujian
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] mt-1">
            Kelola data mahasiswa terdaftar. Mahasiswa login ke ruang ujian menggunakan kombinasi{' '}
            <span className="font-semibold text-[#0F172A]">NIM</span> dan{' '}
            <span className="font-semibold text-[#0F172A]">Nama Lengkap</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          <div className="flex items-center gap-3 text-xs text-[#475569] font-mono tabular-nums mr-1">
            <span>
              Total: <strong className="text-[#0F172A]">{state.students.length}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Aktif: <strong className="text-[#16A34A]">{activeStudentsCount}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="h-9 px-3 rounded-md border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#0F172A]" />
            Template Excel
          </button>

          <button
            type="button"
            onClick={() => {
              resetImportModalState();
              setImportModalOpen(true);
            }}
            className="h-9 px-3 rounded-md border border-[#0F172A] bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileUp className="w-3.5 h-3.5 text-[#F97316]" />
            Import Excel / CSV
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={state.students.length === 0}
            className="h-9 px-3 rounded-md border border-emerald-600 bg-[#16A34A] hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Add / Edit Student Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E2E8F0] rounded-lg p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm sm:text-base font-bold text-[#0F172A]">
              {editingId ? 'Edit Data Mahasiswa' : 'Tambah Mahasiswa Baru'}
            </h2>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Batal Edit
            </button>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="p-3 rounded-md bg-red-50 border border-red-200 text-xs font-medium text-[#DC2626]"
          >
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label
              htmlFor="student-nim"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              NIM Mahasiswa <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="student-nim"
              type="text"
              required
              value={form.nim}
              onChange={(e) => setForm({ ...form, nim: e.target.value })}
              placeholder="Contoh: 2026101001"
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm font-mono focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label
              htmlFor="student-fullname"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Nama Lengkap Mahasiswa (Untuk Login){' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="student-fullname"
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Contoh: Ahmad Fauzi Pratama"
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div>
            <label
              htmlFor="student-email"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Email Akademik (Opsional)
            </label>
            <input
              id="student-email"
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Otomatis dari NIM jika kosong"
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div>
            <label
              htmlFor="student-faculty"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Fakultas
            </label>
            <select
              id="student-faculty"
              value={form.facultyId ? String(form.facultyId) : ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  facultyId: e.target.value ? Number(e.target.value) : null,
                  studyProgramId: null,
                })
              }
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#F97316]"
            >
              <option value="">-- Pilih Fakultas --</option>
              {state.faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="student-prodi"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Program Studi
            </label>
            <select
              id="student-prodi"
              value={form.studyProgramId ? String(form.studyProgramId) : ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  studyProgramId: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#F97316]"
            >
              <option value="">-- Pilih Program Studi --</option>
              {filteredProdiOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.degree} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="student-class"
              className="block text-xs font-semibold text-[#334155] mb-1.5"
            >
              Kelas Perkuliahan
            </label>
            <select
              id="student-class"
              value={form.classId ? String(form.classId) : ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  classId: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#F97316]"
            >
              <option value="">-- Pilih Kelas --</option>
              {state.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="student-semester"
                className="block text-xs font-semibold text-[#334155] mb-1.5"
              >
                Semester
              </label>
              <input
                id="student-semester"
                type="number"
                min={1}
                max={14}
                value={form.semester}
                onChange={(e) =>
                  setForm({ ...form, semester: Number(e.target.value) || 1 })
                }
                className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm font-mono tabular-nums focus:outline-none focus:border-[#F97316]"
              />
            </div>
            <div>
              <label
                htmlFor="student-year"
                className="block text-xs font-semibold text-[#334155] mb-1.5"
              >
                Angkatan
              </label>
              <input
                id="student-year"
                type="number"
                min={2015}
                max={2035}
                value={form.enrollmentYear}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enrollmentYear: Number(e.target.value) || 2026,
                  })
                }
                className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-sm font-mono tabular-nums focus:outline-none focus:border-[#F97316]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-slate-100 text-xs font-semibold text-[#0F172A] cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-[#F97316]" />
              <span>{form.avatarUrl ? 'Ganti Foto Mahasiswa' : 'Upload Foto Profil'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="sr-only"
              />
            </label>
            {form.avatarUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={form.avatarUrl}
                  alt="Preview foto mahasiswa"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-[#CBD5E1]"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, avatarUrl: '' })}
                  className="text-xs text-[#DC2626] hover:underline cursor-pointer"
                >
                  Hapus Foto
                </button>
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#334155] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 accent-[#F97316] rounded"
              />
              <span>Status Akun Aktif (Boleh Login Ujian)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto h-10 px-5 bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white font-semibold rounded-md text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {editingId ? (
              <>
                <UserCheck className="w-4 h-4" />
                {submitting ? 'Menyimpan...' : 'Simpan Perubahan Mahasiswa'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {submitting ? 'Menambahkan...' : 'Tambah Data Mahasiswa'}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Filter & Table Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
              Daftar Mahasiswa Terdaftar ({filteredStudents.length})
            </h3>
            <p className="text-xs text-[#64748B]">
              Gunakan NIM dan Nama Lengkap sesuai kolom tabel untuk masuk sebagai mahasiswa.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full lg:w-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Cari mahasiswa berdasarkan NIM atau nama"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIM atau Nama..."
                className="w-full sm:w-52 h-9 pl-8 pr-3 rounded-md border border-[#CBD5E1] text-xs focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <select
              aria-label="Filter Program Studi"
              value={filterProdiId}
              onChange={(e) => setFilterProdiId(e.target.value)}
              className="h-9 px-2.5 rounded-md border border-[#CBD5E1] text-xs bg-white focus:outline-none focus:border-[#F97316]"
            >
              <option value="all">Semua Program Studi</option>
              {state.studyPrograms.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Kelas"
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="h-9 px-2.5 rounded-md border border-[#CBD5E1] text-xs bg-white focus:outline-none focus:border-[#F97316]"
            >
              <option value="all">Semua Kelas</option>
              {state.classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-8 sm:p-10 text-center space-y-2">
            <GraduationCap className="w-8 h-8 text-[#94A3B8] mx-auto" />
            <p className="text-sm font-semibold text-[#0F172A]">
              {state.students.length === 0
                ? 'Belum ada data mahasiswa terdaftar.'
                : 'Tidak ada mahasiswa yang cocok dengan pencarian atau filter.'}
            </p>
            <p className="text-xs text-[#64748B]">
              {state.students.length === 0
                ? 'Isi formulir di atas untuk menambahkan mahasiswa baru agar dapat login dengan NIM dan Nama Lengkap.'
                : 'Coba ubah kata kunci pencarian NIM/Nama atau atur ulang filter prodi/kelas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                  <th className="py-3 px-4 whitespace-nowrap">Mahasiswa</th>
                  <th className="py-3 px-4 whitespace-nowrap">NIM (Login)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Fakultas & Prodi</th>
                  <th className="py-3 px-4 whitespace-nowrap">Kelas & Semester</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-xs">
                {filteredStudents.map((student) => {
                  const linkedUser = userById.get(student.userId);
                  const faculty = student.facultyId
                    ? facultyById.get(student.facultyId)
                    : undefined;
                  const prodi = student.studyProgramId
                    ? prodiById.get(student.studyProgramId)
                    : undefined;
                  const cls = student.classId
                    ? classById.get(student.classId)
                    : undefined;
                  const isActive = linkedUser?.isActive ?? true;
                  const avatarSrc = student.avatarUrl || linkedUser?.avatarUrl;

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-[#F8FAFC]/80 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={student.fullName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-[#E2E8F0] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {student.fullName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0F172A]">
                              {student.fullName}
                            </p>
                            <p className="text-[11px] text-[#64748B]">
                              {linkedUser?.email || `${student.nim}@student.mazcode.id`}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums font-semibold text-[#0F172A]">
                        {student.nim}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-[#334155]">
                        <span>{prodi ? `${prodi.degree} ${prodi.name}` : 'Belum diatur'}</span>
                        {faculty && (
                          <span className="block text-[11px] text-[#64748B]">
                            {faculty.name}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-[#334155] font-mono tabular-nums">
                        <span>{cls ? `${cls.code} · ${cls.name}` : 'Belum ada kelas'}</span>
                        <span className="block text-[11px] text-[#64748B]">
                          Semester {student.semester} · Angkatan {student.enrollmentYear}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-semibold">
                        {isActive ? (
                          <span className="text-[#16A34A]">Aktif</span>
                        ) : (
                          <span className="text-[#DC2626]">Nonaktif</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        {confirmDeleteId === student.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleConfirmDelete(student)}
                              className="px-2.5 py-1 rounded bg-[#DC2626] hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#475569] text-[11px] font-semibold cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Edit ${student.fullName}`}
                              onClick={() => handleEditClick(student)}
                              className="px-2.5 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`Hapus ${student.fullName}`}
                              onClick={() => setConfirmDeleteId(student.id)}
                              className="px-2.5 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-[#DC2626] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              Hapus
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Data Mahasiswa Modal */}
      {importModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-student-modal-title"
          className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white border border-[#E2E8F0] rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileUp className="w-5 h-5 text-[#F97316] shrink-0" />
                <div className="min-w-0">
                  <h2
                    id="import-student-modal-title"
                    className="text-base font-bold text-[#0F172A] truncate"
                  >
                    Import Data Mahasiswa (Excel / CSV)
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Unggah file `.xlsx`, `.xls`, atau `.csv` sesuai format template untuk menambahkan banyak mahasiswa sekaligus.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup modal import"
                onClick={() => {
                  if (!importing) {
                    setImportModalOpen(false);
                    resetImportModalState();
                  }
                }}
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-xs text-[#334155] space-y-0.5">
                  <p className="font-semibold text-[#0F172A]">
                    Gunakan Template Resmi MazCodeID
                  </p>
                  <p>
                    Kolom wajib: <span className="font-mono font-semibold">NIM</span> &amp;{' '}
                    <span className="font-mono font-semibold">Nama Lengkap</span>. Kode Fakultas, Prodi &amp; Kelas dicocokkan otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="h-9 px-3 rounded-md border border-[#CBD5E1] bg-white hover:bg-slate-100 text-[#0F172A] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#F97316]" />
                  Download Template Excel
                </button>
              </div>

              <div>
                <label
                  htmlFor="student-import-file-input"
                  className="block text-xs font-semibold text-[#334155] mb-1.5"
                >
                  Pilih File Excel / CSV (.xlsx, .xls, .csv)
                </label>
                <input
                  ref={importFileInputRef}
                  id="student-import-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  aria-label="Pilih file Excel atau CSV mahasiswa"
                  onChange={handleImportFileSelected}
                  className="block w-full text-xs text-[#334155] file:mr-3 file:py-2 file:px-3.5 file:rounded-md file:border file:border-[#CBD5E1] file:text-xs file:font-semibold file:bg-[#F8FAFC] file:text-[#0F172A] hover:file:bg-slate-100 border border-[#CBD5E1] rounded-md p-1.5 cursor-pointer"
                />
                {importFileName && (
                  <p className="text-[11px] text-[#64748B] mt-1 font-mono">
                    File dipilih: {importFileName}
                  </p>
                )}
              </div>

              {importError && (
                <div
                  role="alert"
                  className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {importParseResult && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3.5 py-2.5">
                    <span>
                      Total Terbaca:{' '}
                      <strong className="text-[#0F172A]">
                        {importParseResult.previewRows.length}
                      </strong>
                    </span>
                    <span className="text-[#16A34A] inline-flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Siap Impor: {importParseResult.validItems.length}
                    </span>
                    <span className="text-[#DC2626] inline-flex items-center gap-1 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Dilewati / Invalid: {importParseResult.invalidRows.length}
                    </span>
                  </div>

                  <div className="border border-[#E2E8F0] rounded-md overflow-x-auto max-h-64">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold uppercase text-[#475569] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Baris</th>
                          <th className="py-2 px-3">NIM</th>
                          <th className="py-2 px-3">Nama Lengkap</th>
                          <th className="py-2 px-3">Prodi / Kelas</th>
                          <th className="py-2 px-3">Validasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {importParseResult.previewRows.slice(0, 15).map((row) => (
                          <tr
                            key={`${row.rowNumber}-${row.nim}`}
                            className={row.valid ? '' : 'bg-red-50/60'}
                          >
                            <td className="py-2 px-3 font-mono tabular-nums text-[#64748B]">
                              #{row.rowNumber}
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-[#0F172A]">
                              {row.nim}
                            </td>
                            <td className="py-2 px-3 text-[#0F172A]">{row.fullName}</td>
                            <td className="py-2 px-3 text-[#475569]">
                              {row.prodiLabel} · {row.classLabel}
                            </td>
                            <td className="py-2 px-3">
                              {row.valid ? (
                                <span className="text-[#16A34A] font-semibold">Siap Diimpor</span>
                              ) : (
                                <span className="text-[#DC2626] font-medium">
                                  {row.error}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importParseResult.previewRows.length > 15 && (
                    <p className="text-[11px] text-[#64748B]">
                      Menampilkan 15 dari {importParseResult.previewRows.length} baris preview.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={importing}
                onClick={() => {
                  setImportModalOpen(false);
                  resetImportModalState();
                }}
                className="h-9 px-4 rounded-md border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#334155] text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  importing ||
                  !importParseResult ||
                  importParseResult.validItems.length === 0
                }
                onClick={handleExecuteImport}
                className="h-9 px-4 rounded-md bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" />
                {importing
                  ? 'Mengimpor ke Database...'
                  : `Import ${importParseResult?.validItems.length || 0} Mahasiswa ke Database`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
