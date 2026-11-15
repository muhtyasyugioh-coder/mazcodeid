import React, { useState, useMemo } from 'react';
import {
  Camera,
  CameraOff,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Trash2,
  HardDrive,
} from 'lucide-react';
import {
  CbtSystemState,
  ExamSessionRecord,
  ExamSnapshotRecord,
  ViolationLogRecord,
} from '../types/cbt';

interface MonitoringDashboardProps {
  state: CbtSystemState;
  liveEvents: Array<{ type: string; message: string; timestamp: string }>;
  onVerifyViolation: (
    violationId: number,
    actionTaken: string,
    verifiedByAdmin: boolean
  ) => Promise<void>;
  onDeleteSnapshot?: (snapshotId: number) => Promise<void>;
  onPurgeSnapshots?: (options: {
    examId?: number;
    olderThanDays?: number;
  }) => Promise<{ deletedCount: number }>;
}

const FALLBACK_AVATAR = '/src/assets/images/avatar_student_1_1794677775068.jpg';

export const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  state,
  liveEvents,
  onVerifyViolation,
  onDeleteSnapshot,
  onPurgeSnapshots,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [inspectingSessionId, setInspectingSessionId] = useState<number | null>(
    null
  );
  const [purgeMode, setPurgeMode] = useState<string>('older_30');
  const [confirmPurge, setConfirmPurge] = useState<boolean>(false);
  const [purging, setPurging] = useState<boolean>(false);
  const [purgeFeedback, setPurgeFeedback] = useState<string | null>(null);
  const [confirmDeleteSnapId, setConfirmDeleteSnapId] = useState<number | null>(
    null
  );
  const [deletingSnapId, setDeletingSnapId] = useState<number | null>(null);

  const handleExecutePurge = async () => {
    if (!onPurgeSnapshots || purging) return;
    setPurging(true);
    setPurgeFeedback(null);
    try {
      const payload: { examId?: number; olderThanDays?: number } = {};
      if (purgeMode === 'older_30') {
        payload.olderThanDays = 30;
      } else if (purgeMode.startsWith('exam_')) {
        payload.examId = Number(purgeMode.replace('exam_', ''));
      }
      const res = await onPurgeSnapshots(payload);
      setPurgeFeedback(
        `${res?.deletedCount ?? 0} snapshot berhasil dibersihkan dari disk & database.`
      );
      setConfirmPurge(false);
    } finally {
      setPurging(false);
    }
  };

  const enrichedRows = useMemo(() => {
    // Combine active/completed exam sessions and any scheduled students who haven't started
    const rows = state.sessions.map((session) => {
      const student = state.students.find((s) => s.id === session.studentId);
      const exam = state.exams.find((e) => e.id === session.examId);
      const course = state.courses.find((c) => c.id === exam?.courseId);
      const prodi = state.studyPrograms.find(
        (p) => p.id === student?.studyProgramId
      );
      const cls = state.classes.find((c) => c.id === student?.classId);
      const sessionSnapshots = state.snapshots.filter(
        (sn) => sn.sessionId === session.id
      );
      const sessionViolations = state.violations.filter(
        (v) => v.sessionId === session.id
      );

      return {
        session,
        student,
        exam,
        course,
        prodi,
        cls,
        snapshots: sessionSnapshots,
        violations: sessionViolations,
      };
    });

    return rows.filter((row) => {
      const matchesSearch =
        !searchQuery.trim() ||
        row.student?.fullName
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        row.student?.nim.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCourse =
        selectedCourseId === 'all' ||
        String(row.course?.id) === selectedCourseId;

      const matchesClass =
        selectedClassId === 'all' || String(row.cls?.id) === selectedClassId;

      const matchesStatus =
        selectedStatus === 'all' || row.session.status === selectedStatus;

      return matchesSearch && matchesCourse && matchesClass && matchesStatus;
    });
  }, [
    state,
    searchQuery,
    selectedCourseId,
    selectedClassId,
    selectedStatus,
  ]);

  const inspectedRow = useMemo(
    () =>
      enrichedRows.find((r) => r.session.id === inspectingSessionId) ||
      null,
    [enrichedRows, inspectingSessionId]
  );

  const formatRemainingTime = (seconds: number, status: string) => {
    if (status === 'Selesai' || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const statusFilters = [
    'all',
    'Sedang Ujian',
    'Terindikasi Pelanggaran',
    'Kamera Terputus',
    'Selesai',
    'Belum Memulai',
  ];

  return (
    <div className="space-y-6">
      {/* Header & Real-time Proctoring Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Monitoring Pengawasan Ujian Real-Time (Online Proctoring)
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Pemantauan kamera WebRTC, 3x Snapshot wajah otomatis, status layar
            penuh, dan deteksi pelanggaran peserta ujian secara langsung.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="font-medium text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Saluran WebSocket Proctoring Aktif
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Total Sesi Terpantau: {state.sessions.length}
          </span>
        </div>
      </div>

      {/* Real-time Notification Stream */}
      {liveEvents.length > 0 && (
        <div className="bg-slate-900 text-white rounded-lg p-4 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-orange-400">
              Notifikasi Pengawasan Real-Time Terbaru
            </span>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {liveEvents[0]?.timestamp}
            </span>
          </div>
          <div className="space-y-1.5">
            {liveEvents.slice(0, 3).map((ev, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs text-slate-200 py-1 border-b border-slate-800 last:border-0"
              >
                <span>{ev.message}</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {ev.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Snapshot Storage Optimization & Retention Cleanup Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-orange-400 flex items-center justify-center shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">
              Optimasi &amp; Pembersihan Penyimpanan Snapshot
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              Penyimpanan File Disk · Lazy Load Aktif ·{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {state.snapshots.length}
              </span>{' '}
              file snapshot tersimpan
            </div>
            {purgeFeedback && (
              <div className="text-[11px] font-semibold text-emerald-700 mt-1">
                {purgeFeedback}
              </div>
            )}
          </div>
        </div>

        {onPurgeSnapshots && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Target pembersihan snapshot"
              value={purgeMode}
              onChange={(e) => {
                setPurgeMode(e.target.value);
                setConfirmPurge(false);
              }}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="older_30">Snapshot &gt; 30 Hari</option>
              <option value="all">Semua Snapshot ({state.snapshots.length})</option>
              {state.exams.map((ex) => (
                <option key={ex.id} value={`exam_${ex.id}`}>
                  Ujian: {ex.title}
                </option>
              ))}
            </select>

            {!confirmPurge ? (
              <button
                type="button"
                disabled={state.snapshots.length === 0}
                onClick={() => setConfirmPurge(true)}
                className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan Snapshot
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={purging}
                  onClick={handleExecutePurge}
                  className="px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer"
                >
                  {purging ? 'Membersihkan...' : 'Konfirmasi Hapus'}
                </button>
                <button
                  type="button"
                  disabled={purging}
                  onClick={() => setConfirmPurge(false)}
                  className="px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 sm:p-4 rounded-lg border border-slate-200">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Cari nama mahasiswa atau NIM"
            placeholder="Cari nama mahasiswa atau NIM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <select
            aria-label="Filter Mata Kuliah"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Semua Mata Kuliah</option>
            {state.courses.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            aria-label="Filter Kelas"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Semua Kelas</option>
            {state.classes.map((cls) => (
              <option key={cls.id} value={String(cls.id)}>
                {cls.code} ({cls.name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-fit">
        {statusFilters.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setSelectedStatus(st)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedStatus === st
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {st === 'all' ? 'Semua Status Peserta' : st}
          </button>
        ))}
      </div>

      {/* 13-Column Real-Time Monitoring Data Grid */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-semibold">
                <th className="py-2.5 px-2">Foto</th>
                <th className="py-2.5 px-2">Mahasiswa</th>
                <th className="py-2.5 px-2">NIM</th>
                <th className="py-2.5 px-2">Prodi</th>
                <th className="py-2.5 px-2">Mata Kuliah</th>
                <th className="py-2.5 px-2">Status Ujian</th>
                <th className="py-2.5 px-2">Kamera</th>
                <th className="py-2.5 px-2">Snap 1</th>
                <th className="py-2.5 px-2">Snap 2</th>
                <th className="py-2.5 px-2">Snap 3</th>
                <th className="py-2.5 px-2 text-right">Pelanggaran</th>
                <th className="py-2.5 px-2 text-right">Sisa Waktu</th>
                <th className="py-2.5 px-2">Koneksi &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
              {enrichedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Tidak ada peserta ujian yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                enrichedRows.map((row) => {
                  const { session, student, course, prodi, snapshots } = row;
                  const snap1 = snapshots.find((s) => s.sequenceNumber === 1);
                  const snap2 = snapshots.find((s) => s.sequenceNumber === 2);
                  const snap3 = snapshots.find((s) => s.sequenceNumber === 3);

                  const isViolation =
                    session.status === 'Terindikasi Pelanggaran' ||
                    session.violationCount > 0;
                  const isCamDisconnected =
                    session.cameraStatus === 'Terputus' ||
                    session.status === 'Kamera Terputus';

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2 px-2">
                        <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-200 border border-slate-300">
                          <img
                            src={student?.avatarUrl || FALLBACK_AVATAR}
                            alt={student?.fullName || 'Peserta'}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2 font-semibold text-slate-900 whitespace-nowrap">
                        {student?.fullName || 'Mahasiswa'}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {student?.nim || '-'}
                      </td>
                      <td
                        className="py-2 px-2 max-w-[120px] truncate"
                        title={prodi ? `${prodi.name} (${prodi.degree})` : '-'}
                      >
                        {prodi ? `${prodi.name} (${prodi.degree})` : '-'}
                      </td>
                      <td
                        className="py-2 px-2 font-medium text-slate-800 max-w-[145px] truncate"
                        title={course?.name || '-'}
                      >
                        {course?.name || '-'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span
                          className={`font-semibold flex items-center gap-1 ${
                            session.status === 'Terindikasi Pelanggaran'
                              ? 'text-red-600'
                              : session.status === 'Kamera Terputus'
                                ? 'text-amber-600'
                                : session.status === 'Selesai'
                                  ? 'text-emerald-700'
                                  : 'text-slate-900'
                          }`}
                        >
                          {session.status === 'Terindikasi Pelanggaran' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          )}
                          {session.status === 'Selesai' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          {session.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {isCamDisconnected ? (
                          <span className="text-red-600 font-semibold flex items-center gap-1">
                            <CameraOff className="w-3.5 h-3.5" />
                            Terputus
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" />
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <SnapshotStatusCell
                          status={session.snapshot1Status}
                          snapshot={snap1}
                          onInspect={() => setInspectingSessionId(session.id)}
                        />
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <SnapshotStatusCell
                          status={session.snapshot2Status}
                          snapshot={snap2}
                          onInspect={() => setInspectingSessionId(session.id)}
                        />
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <SnapshotStatusCell
                          status={session.snapshot3Status}
                          snapshot={snap3}
                          onInspect={() => setInspectingSessionId(session.id)}
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            isViolation ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {session.violationCount}x
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatRemainingTime(
                          session.remainingSeconds,
                          session.status
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              session.connectionStatus === 'Online'
                                ? 'text-emerald-700'
                                : 'text-amber-600'
                            }`}
                          >
                            {session.connectionStatus === 'Online' ? (
                              <Wifi className="w-3.5 h-3.5" />
                            ) : (
                              <WifiOff className="w-3.5 h-3.5" />
                            )}
                            {session.connectionStatus}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInspectingSessionId(session.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Proctoring Detail & Snapshot Preview Modal */}
      {inspectedRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detail Pengawasan Peserta"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Detail Pengawasan &amp; Bukti Snapshot Peserta
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                  <span className="font-semibold text-slate-900">
                    {inspectedRow.student?.fullName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    NIM: {inspectedRow.student?.nim}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectedRow.course?.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-orange-600">
                    Status: {inspectedRow.session.status}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup modal detail"
                onClick={() => setInspectingSessionId(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3-Snapshot Gallery */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                Hasil Bukti 3x Snapshot Kamera Otomatis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((seq) => {
                  const snap = inspectedRow.snapshots.find(
                    (s) => s.sequenceNumber === seq
                  );
                  const statusLabel =
                    seq === 1
                      ? inspectedRow.session.snapshot1Status
                      : seq === 2
                        ? inspectedRow.session.snapshot2Status
                        : inspectedRow.session.snapshot3Status;

                  const stageName =
                    seq === 1
                      ? 'Snapshot 1: Saat Memulai Ujian'
                      : seq === 2
                        ? 'Snapshot 2: Waktu Acak Tengah Ujian'
                        : 'Snapshot 3: Menjelang Akhir Ujian';

                  return (
                    <div
                      key={seq}
                      className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex flex-col"
                    >
                      <div className="aspect-4/3 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                        {snap ? (
                          <>
                            <img
                              src={snap.imageDataUrl}
                              alt={stageName}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2.5 text-[11px] text-white font-mono tabular-nums">
                              <div>
                                {snap.nim} · {snap.studentName}
                              </div>
                              <div className="text-orange-300">
                                {new Date(snap.capturedAt).toLocaleString(
                                  'id-ID'
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-4 text-slate-400 text-xs">
                            <Camera className="w-7 h-7 mx-auto mb-1.5 opacity-50" />
                            <span>Belum Diambil oleh Sistem</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 text-xs space-y-1.5 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900">
                            {stageName}
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Status:</span>
                            <span
                              className={`font-semibold ${
                                statusLabel === 'Berhasil'
                                  ? 'text-emerald-700'
                                  : statusLabel === 'Gagal'
                                    ? 'text-red-600'
                                    : 'text-slate-500'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        {snap && onDeleteSnapshot && (
                          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-1.5">
                            {confirmDeleteSnapId === snap.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={deletingSnapId === snap.id}
                                  onClick={async () => {
                                    setDeletingSnapId(snap.id);
                                    try {
                                      await onDeleteSnapshot(snap.id);
                                      setConfirmDeleteSnapId(null);
                                    } finally {
                                      setDeletingSnapId(null);
                                    }
                                  }}
                                  className="px-2 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                                >
                                  {deletingSnapId === snap.id
                                    ? 'Menghapus...'
                                    : 'Konfirmasi'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSnapId(null)}
                                  className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 rounded cursor-pointer"
                                >
                                  Batal
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Hapus snapshot ${seq}`}
                                onClick={() => setConfirmDeleteSnapId(snap.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 rounded flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                Hapus Snapshot
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Violation Timeline for this Student */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">
                Riwayat Deteksi Pelanggaran Berdasarkan Waktu (
                {inspectedRow.violations.length} Kejadian)
              </h4>
              {inspectedRow.violations.length === 0 ? (
                <div className="p-4 border border-slate-200 rounded-lg text-xs text-emerald-700 bg-emerald-50/50 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Peserta ini tidak memiliki catatan pelanggaran. Kamera dan
                  mode Fullscreen berjalan normal.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 max-h-52 overflow-y-auto">
                  {inspectedRow.violations.map((v: ViolationLogRecord) => (
                    <div
                      key={v.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-600">
                            Peringatan {v.warningLevel}: {v.violationType}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {new Date(v.detectedAt).toLocaleTimeString('id-ID')}
                          </span>
                        </div>
                        <p className="text-slate-600">{v.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onVerifyViolation(
                              v.id,
                              'Diverifikasi Pengawas (Aman/Toleransi Teknis)',
                              true
                            )
                          }
                          className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors whitespace-nowrap"
                        >
                          {v.verifiedByAdmin
                            ? 'Terverifikasi'
                            : 'Verifikasi Pengawas'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setInspectingSessionId(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800"
              >
                Tutup Detail Pengawasan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SnapshotStatusCell: React.FC<{
  status: string;
  snapshot?: ExamSnapshotRecord;
  onInspect: () => void;
}> = ({ status, snapshot, onInspect }) => {
  if (status === 'Berhasil' && snapshot) {
    return (
      <button
        type="button"
        onClick={onInspect}
        className="flex items-center gap-1.5 text-emerald-700 hover:underline font-medium"
      >
        <img
          src={snapshot.imageDataUrl}
          alt="Snapshot"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-6 h-6 rounded object-cover border border-emerald-500"
        />
        <span>Berhasil</span>
      </button>
    );
  }

  if (status === 'Gagal') {
    return (
      <button
        type="button"
        onClick={onInspect}
        className="flex items-center gap-1 text-red-600 font-semibold hover:underline"
      >
        <XCircle className="w-3.5 h-3.5" />
        <span>Gagal (Retry)</span>
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 text-slate-400">
      <Clock className="w-3.5 h-3.5" />
      <span>Belum Diambil</span>
    </span>
  );
};
