import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  Users,
  BookOpen,
  FileText,
  Monitor,
  Camera,
  AlertTriangle,
  Award,
  Settings,
  LogOut,
  CheckCircle2,
  Clock,
  GraduationCap,
  Building2,
  Layers,
  Plus,
  Download,
  Eye,
  Lock,
  Play,
  RefreshCw,
  Bell,
  ChevronRight,
  UserCheck,
  Activity,
  FileSpreadsheet,
  Printer,
  Edit3,
  Trash2,
  Globe,
  Upload,
  X,
  Image as ImageIcon,
  Menu,
} from 'lucide-react';
import {
  CbtSystemState,
  RoleType,
  UserRecord,
  ExamRecord,
  QuestionRecord,
  WebsiteSettingRecord,
  FacultyRecord,
  StudyProgramRecord,
  ClassRecord,
  CourseRecord,
} from './types/cbt.ts';
import { QuestionBankManager } from './components/QuestionBankManager.tsx';
import { MonitoringDashboard } from './components/MonitoringDashboard.tsx';
import { StudentExamRoom } from './components/StudentExamRoom.tsx';
import { StudentManager, StudentPayload } from './components/StudentManager.tsx';
import {
  executeApiRequest,
  getSavedLocalFallbackState,
  clearSavedLocalFallbackState,
  didLastWriteUseLocalFallback,
} from './utils/clientCbtFallback.ts';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, signOut } from 'firebase/auth';
import campusHeroImg from './assets/images/unikma_campus_hero_1794677775495.jpg';

type NavTab =
  | 'dashboard'
  | 'data_master'
  | 'data_mahasiswa'
  | 'manajemen_pengguna'
  | 'fakultas_prodi'
  | 'mata_kuliah'
  | 'bank_soal'
  | 'manajemen_ujian'
  | 'monitoring_ujian'
  | 'snapshot_peserta'
  | 'pelanggaran'
  | 'nilai_laporan'
  | 'pengaturan'
  | 'buat_ujian'
  | 'jadwal_ujian'
  | 'koreksi_esai'
  | 'ujian_aktif'
  | 'riwayat_ujian'
  | 'hasil_ujian'
  | 'profil';

const DEFAULT_WEBSITE: WebsiteSettingRecord = {
  id: 0,
  siteName: 'MazCodeID SMART CBT – ANTI CHEATING EXAM SYSTEM',
  universityName: 'MazCodeID',
  tagline: 'Ujian Digital yang Aman, Transparan, dan Terpercaya.',
  description:
    'Platform Computer Based Test (CBT) resmi MazCodeID dengan pengawasan kamera WebRTC otomatis 3 tahap, deteksi perpindahan tab real-time, dan analisis integritas akademik.',
  logoText: 'MCD',
  logoImageUrl: '',
  heroImageUrl: '',
  contactEmail: 'muhtyasyugi@unikma.ac.id',
  footerText: '© 2026 MazCodeID — Smart CBT Anti-Cheating System',
  isActive: true,
};

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem('unikma_cbt_token')
  );
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(() => {
    const saved = localStorage.getItem('unikma_cbt_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [state, setState] = useState<CbtSystemState | null>(null);
  const [publicSite, setPublicSite] = useState<WebsiteSettingRecord>(DEFAULT_WEBSITE);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Login Form State
  const [loginMode, setLoginMode] = useState<'staff' | 'mahasiswa'>('staff');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginNim, setLoginNim] = useState('');
  const [loginStudentName, setLoginStudentName] = useState('');

  // Active Student Exam Mode
  const [activeExamSession, setActiveExamSession] = useState<{
    exam: ExamRecord;
    sessionId: number;
  } | null>(null);

  // Realtime WS notification banner
  const [liveNotifications, setLiveNotifications] = useState<
    Array<{ id: string; text: string; time: string; level: 'info' | 'danger' }>
  >([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ============================================================================
  // CRUD FORM STATES (Create + Edit)
  // ============================================================================

  // 1. Data Master: Kelas & Semester
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [classForm, setClassForm] = useState({
    code: '',
    name: '',
    semester: 1,
    academicYear: '2025/2026',
    studyProgramId: 0,
    capacity: 35,
  });

  // 2. Fakultas & Prodi
  const [editingFacultyId, setEditingFacultyId] = useState<number | null>(null);
  const [facultyForm, setFacultyForm] = useState({
    code: '',
    name: '',
    deanName: '',
  });

  const [editingProdiId, setEditingProdiId] = useState<number | null>(null);
  const [prodiForm, setProdiForm] = useState({
    code: '',
    name: '',
    degree: 'S1',
    facultyId: 0,
    headName: '',
  });

  // 3. Mata Kuliah
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [courseForm, setCourseForm] = useState({
    code: '',
    name: '',
    sks: 3,
    semester: 1,
    studyProgramId: 0,
    lecturerId: 0,
    description: '',
  });

  // 4. Manajemen Pengguna (Admin, Dosen, Mahasiswa)
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    roleName: 'mahasiswa' as RoleType,
    avatarUrl: '',
    isActive: true,
    identifier: '', // NIM or NIDN
    facultyId: 0,
    studyProgramId: 0,
    classId: 0,
    semester: 1,
    enrollmentYear: 2025,
    specialization: '',
    phone: '',
  });

  // 5. Manajemen Ujian / Jadwal Ujian
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [examForm, setExamForm] = useState({
    code: '',
    title: '',
    courseId: 0,
    lecturerId: 0,
    classId: 0,
    examType: 'UTS',
    durationMinutes: 60,
    totalQuestions: 20,
    startTime: '',
    endTime: '',
    passingGrade: 70,
    randomizeQuestions: true,
    randomizeOptions: true,
    maxAttempts: 1,
    requireCamera: true,
    requireFullscreen: true,
    snapshotCount: 3,
    maxViolations: 3,
    violationAction: 'warn_and_flag',
    status: 'Berlangsung',
  });

  // 6. CRUD Website Settings
  const [editingWebsiteId, setEditingWebsiteId] = useState<number | null>(null);
  const [websiteForm, setWebsiteForm] = useState({
    siteName: '',
    universityName: '',
    tagline: '',
    description: '',
    logoText: 'MCD',
    logoImageUrl: '',
    heroImageUrl: '',
    contactEmail: '',
    footerText: '',
    isActive: true,
  });

  // Essay Grading Modal State
  const [essayGradeScores, setEssayGradeScores] = useState<Record<number, number>>({});
  const [essayGradeFeedback, setEssayGradeFeedback] = useState<Record<number, string>>({});

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Load public website identity on initial load
  const fetchPublicWebsiteSettings = useCallback(async () => {
    try {
      const data = await executeApiRequest('/api/public/website-settings');
      const setting = data?.activeSetting || data;
      if (setting && setting.siteName) {
        setPublicSite(setting);
      }
    } catch {
      // Ignore network error on public fetch
    }
  }, []);

  useEffect(() => {
    fetchPublicWebsiteSettings();
  }, [fetchPublicWebsiteSettings]);

  const fetchState = useCallback(
    async (tokenOverride?: string, options?: { silent?: boolean }) => {
      const token = tokenOverride || authToken;
      if (!token) return;
      const silent = Boolean(options?.silent);
      try {
        if (!silent) {
          setLoading(true);
        }
        const data: CbtSystemState = await executeApiRequest('/api/cbt/state', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        setState(data);
        if (data.websiteSettings && data.websiteSettings.length > 0) {
          const active =
            data.websiteSettings.find((w) => w.isActive) || data.websiteSettings[0];
          setPublicSite(active);
          if (!editingWebsiteId) {
            setEditingWebsiteId(active.id);
            setWebsiteForm({
              siteName: active.siteName,
              universityName: active.universityName,
              tagline: active.tagline,
              description: active.description,
              logoText: active.logoText || 'MCD',
              logoImageUrl: active.logoImageUrl || '',
              heroImageUrl: active.heroImageUrl || '',
              contactEmail: active.contactEmail || '',
              footerText: active.footerText || '',
              isActive: active.isActive,
            });
          }
        }
        setErrorMsg(null);
      } catch (err: any) {
        if (err?.status === 401) {
          localStorage.removeItem('unikma_cbt_token');
          localStorage.removeItem('unikma_cbt_user');
          setAuthToken(null);
          setCurrentUser(null);
        }
        if (!silent) {
          setErrorMsg(err.message || 'Gagal memuat state sistem CBT');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [authToken, editingWebsiteId]
  );

  useEffect(() => {
    if (authToken) {
      fetchState(authToken);
    }
  }, [authToken, fetchState]);

  // Auto-sync any unsaved local browser fallback data into PostgreSQL/Supabase when backend DB is active
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!authToken || !currentUser || autoSyncedRef.current) return;
    if (currentUser.roleName !== 'admin' && currentUser.roleName !== 'dosen') return;
    const localData = getSavedLocalFallbackState();
    if (!localData) return;

    let cancelled = false;
    const syncIfBackendReady = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return;
        const info = await res.json();
        if (!info?.ok || info?.mode === 'browser-fallback' || !info?.dbReachable || cancelled) {
          return;
        }
        autoSyncedRef.current = true;
        const syncRes = await executeApiRequest('/api/cbt/sync-local', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(localData),
        });
        clearSavedLocalFallbackState();
        const s = syncRes?.synced || {};
        const totalSynced =
          (s.faculties || 0) +
          (s.studyPrograms || 0) +
          (s.classes || 0) +
          (s.courses || 0) +
          (s.students || 0) +
          (s.questions || 0) +
          (s.exams || 0) +
          (s.results || 0);
        if (totalSynced > 0) {
          await fetchState(authToken, { silent: true });
          showToast(`${totalSynced} data lokal berhasil disinkronkan ke database.`);
        }
      } catch {
        // Keep local data intact if sync fails so user can retry
      }
    };
    syncIfBackendReady();
    return () => {
      cancelled = true;
    };
  }, [authToken, currentUser, fetchState]);

  // Periodic background sync (essential on Vercel serverless where WebSocket is unavailable)
  useEffect(() => {
    if (!authToken || activeExamSession) return;
    const intervalId = window.setInterval(() => {
      fetchState(authToken, { silent: true });
    }, 15000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchState(authToken, { silent: true });
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [authToken, activeExamSession, fetchState]);

  // Support deterministic ?autostart=1 for automated testing using real Admin credentials
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !authToken) {
      handleCredentialLogin('muhtyasyugi@unikma.ac.id', 'muhtyasyugi@123');
    }
  }, []);

  // Connect WebSocket for real-time monitoring events when Node server is available
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    let ws: WebSocket | null = null;

    const connectIfSupported = async () => {
      try {
        const res = await fetch('/api/health');
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return;
        const info = await res.json();
        if (!info?.ok || info?.mode === 'browser-fallback' || cancelled) return;
      } catch {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws-proctoring`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'VIOLATION_DETECTED') {
            setLiveNotifications((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                text: `Pelanggaran (${msg.payload.violationType}) — ${msg.payload.studentName} (${msg.payload.nim})`,
                time: new Date().toLocaleTimeString('id-ID'),
                level: 'danger',
              },
              ...prev.slice(0, 6),
            ]);
            fetchState();
          } else if (msg.type === 'SNAPSHOT_CAPTURED') {
            setLiveNotifications((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                text: `Snapshot #${msg.payload.sequenceNumber} berhasil disimpan — ${msg.payload.studentName}`,
                time: new Date().toLocaleTimeString('id-ID'),
                level: 'info',
              },
              ...prev.slice(0, 6),
            ]);
            fetchState();
          } else if (
            msg.type === 'SESSION_UPDATED' ||
            msg.type === 'EXAM_SUBMITTED' ||
            msg.type === 'VIOLATION_VERIFIED'
          ) {
            fetchState();
          }
        } catch {
          // Ignore non-JSON messages
        }
      };
    };

    connectIfSupported();

    return () => {
      cancelled = true;
      if (ws) {
        ws.close();
      }
    };
  }, [authToken, fetchState]);

  const handleCredentialLogin = async (emailInput: string, passwordInput: string) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await executeApiRequest('/api/auth/institutional-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          password: passwordInput,
        }),
      });
      localStorage.setItem('unikma_cbt_token', data.token);
      localStorage.setItem('unikma_cbt_user', JSON.stringify(data.user));
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setActiveTab('dashboard');
      await fetchState(data.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Email atau password tidak valid');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (nimInput: string, fullNameInput: string) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await executeApiRequest('/api/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nim: nimInput.trim(),
          fullName: fullNameInput.trim(),
        }),
      });
      localStorage.setItem('unikma_cbt_token', data.token);
      localStorage.setItem('unikma_cbt_user', JSON.stringify(data.user));
      setAuthToken(data.token);
      setCurrentUser(data.user);
      setActiveTab('dashboard');
      await fetchState(data.token);
    } catch (err: any) {
      setErrorMsg(
        err.message || 'Kombinasi NIM dan Nama Lengkap mahasiswa tidak valid.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const result = await signInWithPopup(auth, googleAuthProvider);
      await handleCredentialLogin(
        result.user.email || 'muhtyasyugi@unikma.ac.id',
        'muhtyasyugi@123'
      );
    } catch {
      setErrorMsg('Login Google dibatalkan atau gagal. Gunakan akun kredensial MazCodeID.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth).catch(() => {});
    localStorage.removeItem('unikma_cbt_token');
    localStorage.removeItem('unikma_cbt_user');
    setAuthToken(null);
    setCurrentUser(null);
    setState(null);
    setActiveExamSession(null);
    setLoginEmail('');
    setLoginPassword('');
    setLoginNim('');
    setLoginStudentName('');
  };

  const apiCall = async (
    url: string,
    method: string,
    body?: any,
    options?: { skipRefresh?: boolean }
  ) => {
    if (!authToken) return null;
    const result = await executeApiRequest(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!options?.skipRefresh) {
      await fetchState();
    }
    return result;
  };

  // Helper to read uploaded image file into Base64 Data URL
  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onLoaded(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Start Student Exam
  const handleStartStudentExam = async (exam: ExamRecord) => {
    if (!state || !currentUser) return;
    const studentProfile = state.students.find((s) => s.userId === currentUser.id);
    if (!studentProfile) {
      showToast(
        'Profil mahasiswa belum terdaftar pada akun ini. Silakan tambahkan akun mahasiswa di Manajemen Pengguna.'
      );
      return;
    }
    try {
      const session = await apiCall('/api/cbt/sessions/start', 'POST', {
        examId: exam.id,
        studentId: studentProfile.id,
        durationMinutes: exam.durationMinutes,
      });
      if (session) {
        setActiveExamSession({ exam, sessionId: session.id });
      }
    } catch (e: any) {
      showToast(e.message);
    }
  };

  // Export CSV / Excel compatible report
  const handleExportResultsCsv = () => {
    if (!state) return;
    if (state.results.length === 0) {
      showToast('Belum ada data hasil ujian untuk diekspor.');
      return;
    }
    const headers = [
      'NIM',
      'Nama Mahasiswa',
      'Program Studi',
      'Mata Kuliah',
      'Benar',
      'Salah',
      'Kosong',
      'Nilai Objektif',
      'Nilai Esai',
      'Nilai Akhir',
      'Grade',
      'Durasi (Menit)',
      'Pelanggaran',
      'Status Verifikasi',
    ];
    const rows = state.results.map((r) => [
      r.nim,
      `"${r.studentName}"`,
      `"${r.studyProgramName}"`,
      `"${r.courseName}"`,
      r.correctCount,
      r.wrongCount,
      r.emptyCount,
      r.objectiveScore,
      r.essayScore,
      r.finalScore,
      r.gradeLetter,
      r.durationUsedMinutes,
      r.violationCount,
      r.verificationStatus,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Laporan_Nilai_CBT_MazCodeID_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File Laporan Excel/CSV berhasil diunduh.');
  };

  const activeWebsite: WebsiteSettingRecord =
    state?.websiteSettings?.find((w) => w.isActive) ||
    state?.websiteSettings?.[0] ||
    publicSite ||
    DEFAULT_WEBSITE;

  const heroImageToDisplay =
    activeWebsite.heroImageUrl && activeWebsite.heroImageUrl.trim() !== ''
      ? activeWebsite.heroImageUrl
      : campusHeroImg;

  // ============================================================================
  // 1. LOGIN PORTAL VIEW (When unauthenticated)
  // ============================================================================
  if (!authToken || !currentUser) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col lg:flex-row">
        {/* Left Brand & Institutional Security Showcase */}
        <div className="order-2 lg:order-1 lg:w-7/12 bg-[#0F172A] text-white p-5 sm:p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageToDisplay})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#0F172A]/95 to-[#1E293B]/80" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              {activeWebsite.logoImageUrl ? (
                <img
                  src={activeWebsite.logoImageUrl}
                  alt={activeWebsite.logoText}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover border border-white/20 shadow-lg shrink-0"
                />
              ) : (
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#F97316] flex items-center justify-center font-black text-lg sm:text-xl tracking-tighter text-white shadow-lg shrink-0">
                  {activeWebsite.logoText?.slice(0, 2) || 'MC'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.16em] text-[#FB923C] truncate">
                  {activeWebsite.universityName}
                </p>
                <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-white leading-snug">
                  {activeWebsite.siteName}
                </h1>
              </div>
            </div>

            <div className="mt-7 sm:mt-10 lg:mt-12 max-w-2xl">
              <p className="text-[11px] sm:text-xs font-mono uppercase tracking-widest text-[#FB923C] mb-2 sm:mb-3">
                ONLINE PROCTORING & ACADEMIC INTEGRITY PLATFORM
              </p>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15] text-white text-balance">
                {activeWebsite.tagline}
              </h2>
              <p className="mt-3 sm:mt-5 text-slate-300 text-sm sm:text-base leading-relaxed">
                {activeWebsite.description}
              </p>
            </div>

            <div className="mt-7 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl">
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3.5 sm:p-4">
                <Camera className="w-5 h-5 text-[#F97316] mb-1.5 sm:mb-2" />
                <p className="text-sm font-bold text-white">3x Auto-Snapshot</p>
                <p className="text-xs text-slate-300 mt-1">
                  Tangkapan wajah otomatis awal, tengah acak, dan akhir sesi ujian.
                </p>
              </div>
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3.5 sm:p-4">
                <Monitor className="w-5 h-5 text-[#F97316] mb-1.5 sm:mb-2" />
                <p className="text-sm font-bold text-white">Fullscreen & Focus</p>
                <p className="text-xs text-slate-300 mt-1">
                  Deteksi pindah tab, kehilangan fokus jendela, dan peringatan 3 tingkat.
                </p>
              </div>
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-lg p-3.5 sm:p-4">
                <Shield className="w-5 h-5 text-[#F97316] mb-1.5 sm:mb-2" />
                <p className="text-sm font-bold text-white">Offline Autosave</p>
                <p className="text-xs text-slate-300 mt-1">
                  Jawaban tersimpan otomatis dan tersinkronisasi saat koneksi pulih.
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-8 sm:mt-12 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 sm:gap-4 text-xs text-slate-400">
            <span>
              {activeWebsite.footerText ||
                '© 2026 MazCodeID — Sistem Ujian Terpadu'}
            </span>
            <span className="font-mono text-slate-300">
              WebRTC Proctoring • Fullscreen Lock • Audit Trail
            </span>
          </div>
        </div>

        {/* Right Authentication Panel */}
        <div className="order-1 lg:order-2 lg:w-5/12 p-5 sm:p-10 lg:p-14 flex flex-col justify-center bg-white">
          <div className="max-w-md mx-auto w-full">
            <div className="lg:hidden flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              {activeWebsite.logoImageUrl ? (
                <img
                  src={activeWebsite.logoImageUrl}
                  alt={activeWebsite.logoText}
                  className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-[#F97316] flex items-center justify-center font-black text-base tracking-tighter text-white shrink-0">
                  {activeWebsite.logoText?.slice(0, 2) || 'MC'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F97316] truncate">
                  {activeWebsite.universityName}
                </p>
                <p className="text-sm font-extrabold text-[#0F172A] truncate">
                  {activeWebsite.siteName}
                </p>
              </div>
            </div>
            <div className="mb-5 sm:mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[#F97316]">
                PORTAL AUTENTIKASI SIVITAS AKADEMIKA
              </span>
              <h2 className="text-2xl font-extrabold text-[#0F172A] mt-1">
                Masuk ke {activeWebsite.logoText || 'MazCodeID'} Smart CBT
              </h2>
              <p className="text-sm text-[#475569] mt-1">
                {loginMode === 'mahasiswa'
                  ? 'Masukkan NIM dan Nama Lengkap sesuai data mahasiswa yang terdaftar.'
                  : 'Gunakan email dan kata sandi resmi Admin atau Dosen pengampu.'}
              </p>
            </div>

            {/* Mode Switcher: Admin/Dosen vs Mahasiswa (NIM & Nama Lengkap) */}
            <div
              role="tablist"
              aria-label="Metode Login"
              className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'mahasiswa'}
                onClick={() => {
                  setLoginMode('mahasiswa');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  loginMode === 'mahasiswa'
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                Mahasiswa (NIM & Nama)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'staff'}
                onClick={() => {
                  setLoginMode('staff');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  loginMode === 'staff'
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                Admin / Dosen (Email)
              </button>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {loginMode === 'mahasiswa' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStudentLogin(loginNim, loginStudentName);
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="login-nim"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                  >
                    NIM Mahasiswa
                  </label>
                  <input
                    id="login-nim"
                    type="text"
                    required
                    value={loginNim}
                    onChange={(e) => setLoginNim(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-md border border-[#CBD5E1] text-sm font-mono focus:outline-none focus:border-[#F97316]"
                    placeholder="Contoh: 2026101001"
                  />
                </div>
                <div>
                  <label
                    htmlFor="login-student-name"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                  >
                    Nama Lengkap Mahasiswa
                  </label>
                  <input
                    id="login-student-name"
                    type="text"
                    required
                    value={loginStudentName}
                    onChange={(e) => setLoginStudentName(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#F97316]"
                    placeholder="Masukkan Nama Lengkap sesuai data"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold rounded-md text-sm transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <GraduationCap className="w-4 h-4" />
                  {loading ? 'Memverifikasi Mahasiswa...' : 'Masuk Ujian Mahasiswa'}
                </button>
              </form>
            ) : (
              <>
                <form
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCredentialLogin(loginEmail, loginPassword);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                    >
                      Email / Username Institusi
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="off"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#F97316]"
                      placeholder="Masukkan email institusi"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                    >
                      Kata Sandi
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#F97316]"
                      placeholder="Masukkan kata sandi"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold rounded-md text-sm transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    {loading ? 'Memverifikasi Akses...' : 'Masuk Portal Ujian'}
                  </button>
                </form>

                <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full h-10 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-[#F97316]" />
                    Login SSO Google Workspace Kampus
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. ACTIVE STUDENT EXAM ROOM (FULLSCREEN PROCTORING)
  // ============================================================================
  if (activeExamSession && state) {
    const studentProfile = state.students.find((s) => s.userId === currentUser.id) || {
      id: currentUser.id,
      userId: currentUser.id,
      nim: 'MHS-MAZCODEID',
      fullName: currentUser.fullName,
      semester: 1,
      enrollmentYear: 2025,
    };
    const course =
      state.courses.find((c) => c.id === activeExamSession.exam.courseId) || {
        id: 0,
        code: 'MK-CBT',
        name: activeExamSession.exam.title,
        sks: 3,
        semester: 1,
      };
    const examQuestions = state.questions.filter(
      (q) =>
        q.courseId === activeExamSession.exam.courseId ||
        q.examId === activeExamSession.exam.id ||
        !q.courseId
    );
    const existingSession = state.sessions.find(
      (s) => s.id === activeExamSession.sessionId
    );
    const existingAnswers = state.answers.filter(
      (a) => a.sessionId === activeExamSession.sessionId
    );

    return (
      <StudentExamRoom
        exam={activeExamSession.exam}
        course={course}
        student={studentProfile}
        questions={examQuestions}
        existingSession={existingSession}
        existingAnswers={existingAnswers}
        onStartSession={async (examId, studentId) => {
          return await apiCall('/api/cbt/sessions/start', 'POST', {
            examId,
            studentId,
            durationMinutes: activeExamSession.exam.durationMinutes,
          });
        }}
        onCaptureSnapshot={async (payload) => {
          await apiCall('/api/cbt/snapshots', 'POST', payload, {
            skipRefresh: true,
          });
        }}
        onReportViolation={async (payload) => {
          return await apiCall('/api/cbt/violations', 'POST', payload, {
            skipRefresh: true,
          });
        }}
        onSaveAnswer={async (payload) => {
          await apiCall('/api/cbt/sessions/autosave', 'POST', payload, {
            skipRefresh: true,
          });
        }}
        onSubmitExam={async (payload) => {
          return await apiCall('/api/cbt/sessions/submit', 'POST', payload);
        }}
        onExitExamRoom={() => {
          setActiveExamSession(null);
          setActiveTab('hasil_ujian');
          fetchState();
          showToast('Ujian telah selesai dan jawaban Anda berhasil dikumpulkan.');
        }}
      />
    );
  }

  // ============================================================================
  // 3. ROLE-BASED LMS & PROCTORING DASHBOARD
  // ============================================================================
  const role: RoleType = currentUser.roleName;

  const adminNavItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
    { id: 'data_master', label: 'Data Master (Kelas)', icon: <Layers className="w-4 h-4" /> },
    {
      id: 'data_mahasiswa',
      label: 'Data Mahasiswa',
      icon: <GraduationCap className="w-4 h-4" />,
    },
    {
      id: 'manajemen_pengguna',
      label: 'Manajemen Pengguna',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'fakultas_prodi',
      label: 'Fakultas & Prodi',
      icon: <Building2 className="w-4 h-4" />,
    },
    { id: 'mata_kuliah', label: 'Mata Kuliah', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'bank_soal', label: 'Bank Soal', icon: <FileText className="w-4 h-4" /> },
    {
      id: 'manajemen_ujian',
      label: 'Manajemen Ujian',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: 'monitoring_ujian',
      label: 'Monitoring Ujian',
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      id: 'snapshot_peserta',
      label: 'Snapshot Peserta',
      icon: <Camera className="w-4 h-4" />,
    },
    {
      id: 'pelanggaran',
      label: 'Pelanggaran',
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    {
      id: 'nilai_laporan',
      label: 'Nilai & Laporan',
      icon: <Award className="w-4 h-4" />,
    },
    {
      id: 'pengaturan',
      label: 'Website & Sistem',
      icon: <Globe className="w-4 h-4" />,
    },
  ];

  const dosenNavItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
    {
      id: 'data_mahasiswa',
      label: 'Data Mahasiswa',
      icon: <GraduationCap className="w-4 h-4" />,
    },
    { id: 'mata_kuliah', label: 'Mata Kuliah', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'bank_soal', label: 'Bank Soal', icon: <FileText className="w-4 h-4" /> },
    { id: 'buat_ujian', label: 'Buat Ujian', icon: <Plus className="w-4 h-4" /> },
    { id: 'jadwal_ujian', label: 'Jadwal Ujian', icon: <Clock className="w-4 h-4" /> },
    {
      id: 'monitoring_ujian',
      label: 'Monitoring Ujian',
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      id: 'snapshot_peserta',
      label: 'Snapshot Mahasiswa',
      icon: <Camera className="w-4 h-4" />,
    },
    { id: 'koreksi_esai', label: 'Koreksi Esai', icon: <Edit3 className="w-4 h-4" /> },
    { id: 'nilai_laporan', label: 'Nilai Ujian', icon: <Award className="w-4 h-4" /> },
    { id: 'profil', label: 'Profil', icon: <Users className="w-4 h-4" /> },
  ];

  const mahasiswaNavItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
    { id: 'jadwal_ujian', label: 'Jadwal Ujian', icon: <Clock className="w-4 h-4" /> },
    { id: 'ujian_aktif', label: 'Ujian Aktif', icon: <Play className="w-4 h-4" /> },
    {
      id: 'riwayat_ujian',
      label: 'Riwayat Ujian',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    { id: 'hasil_ujian', label: 'Hasil Ujian', icon: <Award className="w-4 h-4" /> },
    { id: 'profil', label: 'Profil', icon: <GraduationCap className="w-4 h-4" /> },
  ];

  const navItems =
    role === 'admin'
      ? adminNavItems
      : role === 'dosen'
      ? dosenNavItems
      : mahasiswaNavItems;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex overflow-x-hidden">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Left Navigation Sidebar (Off-canvas Drawer on Mobile/Tablet, Fixed on Desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 lg:sticky lg:top-0 lg:h-screen bg-[#0F172A] text-[#F8FAFC] flex flex-col shrink-0 select-none transform transition-transform duration-200 ease-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-14 sm:h-16 px-4 sm:px-5 flex items-center justify-between gap-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3 min-w-0">
            {activeWebsite.logoImageUrl ? (
              <img
                src={activeWebsite.logoImageUrl}
                alt={activeWebsite.logoText}
                className="w-9 h-9 rounded-md object-cover border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-[#F97316] flex items-center justify-center font-black text-white text-sm tracking-tighter shrink-0">
                {activeWebsite.logoText?.slice(0, 2) || 'MC'}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-xs font-extrabold tracking-wider text-white truncate">
                {activeWebsite.logoText || 'MazCodeID'} SMART CBT
              </p>
              <p className="text-[11px] text-[#94A3B8] truncate">
                {activeWebsite.universityName}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup Menu Navigasi"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1E293B] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Role Summary */}
        <div className="px-5 py-3.5 bg-[#1E293B]/60 border-b border-[#1E293B]">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#FB923C]">
            HAK AKSES: {role.toUpperCase()}
          </p>
          <p className="text-xs font-semibold text-white truncate mt-0.5">
            {currentUser.fullName}
          </p>
          <p className="text-[11px] text-[#94A3B8] truncate">{currentUser.email}</p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1E293B] text-white border-l-[3px] border-[#F97316] font-semibold'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50'
                }`}
              >
                <span className={active ? 'text-[#F97316]' : 'text-[#94A3B8]'}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1E293B]">
          <button
            onClick={handleLogout}
            className="w-full h-10 px-3 rounded-md bg-red-950/60 hover:bg-red-900/80 text-red-200 border border-red-800/50 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Sistem
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Utility Header */}
        <header className="h-14 sm:h-16 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 text-xs text-[#475569] min-w-0">
            <button
              type="button"
              aria-label="Buka Menu Navigasi"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1.5 rounded-md text-[#0F172A] hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-[#0F172A] truncate hidden sm:inline">
              {activeWebsite.universityName}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] shrink-0 hidden sm:inline" />
            <span className="uppercase font-mono text-[11px] text-[#F97316] font-semibold truncate">
              {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {liveNotifications.length > 0 && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <Bell className="w-3.5 h-3.5 text-[#F97316] animate-bounce" />
                <span className="truncate max-w-xs">{liveNotifications[0].text}</span>
              </div>
            )}

            <button
              onClick={() => fetchState()}
              className="h-9 px-3 rounded-md border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-medium text-[#475569] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Sinkronisasi Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sinkronisasi</span>
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-md z-50 bg-[#0F172A] text-white px-4 py-3 rounded-lg shadow-xl border border-[#1E293B] text-xs font-medium flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#F97316] shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-5 sm:space-y-6 min-w-0">
          {!state ? (
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 sm:p-12 text-center">
              <RefreshCw className="w-6 h-6 text-[#F97316] animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-[#475569]">
                Memuat basis data {activeWebsite.siteName}...
              </p>
            </div>
          ) : (
            <>
              {/* ================================================================
                  TAB: DASHBOARD (ROLE-SPECIFIC)
              ================================================================ */}
              {activeTab === 'dashboard' && (
                <div className="space-y-5 sm:space-y-6">
                  {/* Top Banner with Dynamic Hero Image */}
                  <div className="bg-[#0F172A] text-white rounded-lg p-5 sm:p-6 border border-[#1E293B] flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden">
                    <div
                      className="absolute inset-0 opacity-20 bg-cover bg-center"
                      style={{ backgroundImage: `url(${heroImageToDisplay})` }}
                    />
                    <div className="relative z-10 min-w-0">
                      <p className="text-[11px] sm:text-xs font-mono uppercase tracking-widest text-[#FB923C] truncate">
                        {activeWebsite.siteName}
                      </p>
                      <h1 className="text-xl sm:text-2xl font-bold mt-1 leading-snug">
                        Selamat Datang, {currentUser.fullName}
                      </h1>
                      <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                        {activeWebsite.tagline}
                      </p>
                    </div>
                    <div className="relative z-10 flex flex-wrap gap-2.5">
                      {role === 'admin' && (
                        <>
                          <button
                            onClick={() => setActiveTab('pengaturan')}
                            className="h-10 px-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold rounded-md flex items-center gap-2 cursor-pointer whitespace-nowrap"
                          >
                            <Globe className="w-4 h-4 text-[#FB923C]" />
                            Identitas Website
                          </button>
                          <button
                            onClick={() => setActiveTab('manajemen_pengguna')}
                            className="h-10 px-4 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-md flex items-center gap-2 cursor-pointer whitespace-nowrap"
                          >
                            <Users className="w-4 h-4" />
                            Kelola Pengguna
                          </button>
                        </>
                      )}
                      {role === 'dosen' && (
                        <button
                          onClick={() => setActiveTab('monitoring_ujian')}
                          className="h-10 px-4 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-md flex items-center gap-2 cursor-pointer whitespace-nowrap"
                        >
                          <Monitor className="w-4 h-4" />
                          Buka Live Proctoring
                        </button>
                      )}
                      {role === 'mahasiswa' && (
                        <button
                          onClick={() => setActiveTab('ujian_aktif')}
                          className="h-10 px-4 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-md flex items-center gap-2 cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-4 h-4" />
                          Lihat Ujian Aktif
                        </button>
                      )}
                    </div>
                  </div>

                  {/* KPI Metrics Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 sm:p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Total Pengguna
                      </p>
                      <p className="text-2xl font-bold text-[#0F172A] mt-2 font-mono tabular-nums">
                        {state.users.length}
                      </p>
                      <p className="text-xs text-[#475569] mt-1">
                        {state.lecturers.length} Dosen • {state.students.length} Mahasiswa
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Fakultas & Prodi
                      </p>
                      <p className="text-2xl font-bold text-[#0F172A] mt-2 font-mono tabular-nums">
                        {state.faculties.length} / {state.studyPrograms.length}
                      </p>
                      <p className="text-xs text-[#16A34A] mt-1">
                        {state.courses.length} Mata Kuliah • {state.classes.length} Kelas
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Bank Soal & Ujian
                      </p>
                      <p className="text-2xl font-bold text-[#F97316] mt-2 font-mono tabular-nums">
                        {state.questions.length} Soal
                      </p>
                      <p className="text-xs text-[#475569] mt-1">
                        {state.exams.length} Jadwal Ujian Terdaftar
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Snapshot & Integritas
                      </p>
                      <p className="text-2xl font-bold text-[#DC2626] mt-2 font-mono tabular-nums">
                        {state.violations.length} Log
                      </p>
                      <p className="text-xs text-[#475569] mt-1">
                        {state.snapshots.length} Bukti Snapshot Kamera
                      </p>
                    </div>
                  </div>

                  {/* Quick Admin Setup Shortcuts when database has no academic data yet */}
                  {role === 'admin' && (
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
                      <h2 className="text-base font-bold text-[#0F172A] mb-3">
                        Manajemen Cepat Administrator
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                        <button
                          onClick={() => setActiveTab('fakultas_prodi')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <Building2 className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            1. Fakultas & Prodi
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.faculties.length} Fak / {state.studyPrograms.length} Prodi
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('data_master')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <Layers className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            2. Data Master Kelas
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.classes.length} Kelas Aktif
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('data_mahasiswa')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <GraduationCap className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            3. Data Mahasiswa
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.students.length} Mahasiswa
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('manajemen_pengguna')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <Users className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            4. Akun Pengguna
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.users.length} Akun Terdaftar
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('mata_kuliah')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            5. Mata Kuliah
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.courses.length} Mata Kuliah
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('bank_soal')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <FileText className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">6. Bank Soal</p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {state.questions.length} Butir Soal
                          </p>
                        </button>
                        <button
                          onClick={() => setActiveTab('pengaturan')}
                          className="p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#F97316] text-left transition-colors cursor-pointer"
                        >
                          <Globe className="w-5 h-5 text-[#F97316] mb-1.5" />
                          <p className="text-xs font-bold text-[#0F172A]">
                            7. Identitas Website
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            Foto, Nama & Logo
                          </p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active Exam Schedule Table */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#0F172A]">
                          Daftar Jadwal Ujian CBT
                        </h2>
                        <p className="text-xs text-[#475569]">
                          Daftar sesi ujian resmi {activeWebsite.universityName}
                        </p>
                      </div>
                      {role === 'admin' && (
                        <button
                          onClick={() => setActiveTab('manajemen_ujian')}
                          className="h-9 px-3.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Kelola Ujian
                        </button>
                      )}
                    </div>
                    {state.exams.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#64748B]">
                        Belum ada jadwal ujian. Tambahkan ujian baru melalui menu Manajemen Ujian.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F1F5F9] text-[#475569] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0]">
                              <th className="py-3 px-4">Kode</th>
                              <th className="py-3 px-4">Judul Ujian & Mata Kuliah</th>
                              <th className="py-3 px-4">Durasi</th>
                              <th className="py-3 px-4">Kebijakan Anti-Cheating</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] text-sm">
                            {state.exams.map((ex) => {
                              const course = state.courses.find((c) => c.id === ex.courseId);
                              return (
                                <tr key={ex.id} className="hover:bg-[#F8FAFC]">
                                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-[#0F172A]">
                                    {ex.code}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <p className="font-semibold text-[#0F172A]">{ex.title}</p>
                                    <p className="text-xs text-[#64748B]">
                                      {course?.name || 'Umum'} • {ex.examType}
                                    </p>
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                                    {ex.durationMinutes} Menit
                                  </td>
                                  <td className="py-3.5 px-4 text-xs text-[#475569]">
                                    Kamera Wajib • {ex.snapshotCount}x Snapshot • Fullscreen
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                                      <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                                      {ex.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    {role === 'mahasiswa' ? (
                                      <button
                                        onClick={() => handleStartStudentExam(ex)}
                                        className="h-8 px-3.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Play className="w-3.5 h-3.5" />
                                        Mulai Ujian
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setActiveTab('monitoring_ujian')}
                                        className="h-8 px-3 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        Pantau
                                      </button>
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
                </div>
              )}

              {/* ================================================================
                  TAB: DATA MASTER (CRUD KELAS & SEMESTER + RINGKASAN MASTER)
              ================================================================ */}
              {activeTab === 'data_master' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Data Master Akademik (Kelas & Semester)
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Tambah, ubah, dan hapus data master kelas perkuliahan, semester, tahun akademik, dan kapasitas peserta.
                    </p>
                  </div>

                  {/* Summary Master Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                      <p className="text-xs text-[#64748B] font-semibold uppercase">
                        Master Fakultas
                      </p>
                      <p className="text-xl font-bold font-mono mt-1">
                        {state.faculties.length}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                      <p className="text-xs text-[#64748B] font-semibold uppercase">
                        Master Program Studi
                      </p>
                      <p className="text-xl font-bold font-mono mt-1">
                        {state.studyPrograms.length}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                      <p className="text-xs text-[#64748B] font-semibold uppercase">
                        Master Kelas & Semester
                      </p>
                      <p className="text-xl font-bold text-[#F97316] font-mono mt-1">
                        {state.classes.length}
                      </p>
                    </div>
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
                      <p className="text-xs text-[#64748B] font-semibold uppercase">
                        Master Mata Kuliah
                      </p>
                      <p className="text-xl font-bold font-mono mt-1">
                        {state.courses.length}
                      </p>
                    </div>
                  </div>

                  {/* Form Create / Edit Kelas */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        if (editingClassId) {
                          await apiCall(`/api/cbt/classes/${editingClassId}`, 'PUT', classForm);
                          showToast('Data Kelas berhasil diperbarui.');
                        } else {
                          await apiCall('/api/cbt/classes', 'POST', classForm);
                          showToast('Kelas baru berhasil ditambahkan.');
                        }
                        setEditingClassId(null);
                        setClassForm({
                          code: '',
                          name: '',
                          semester: 1,
                          academicYear: '2025/2026',
                          studyProgramId: 0,
                          capacity: 35,
                        });
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                    className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-[#0F172A]">
                        {editingClassId ? 'Edit Data Kelas' : 'Tambah Kelas & Semester Baru'}
                      </h2>
                      {editingClassId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingClassId(null);
                            setClassForm({
                              code: '',
                              name: '',
                              semester: 1,
                              academicYear: '2025/2026',
                              studyProgramId: 0,
                              capacity: 35,
                            });
                          }}
                          className="text-xs text-red-600 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Batal Edit
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Kode Kelas (TI-3A)"
                        value={classForm.code}
                        onChange={(e) =>
                          setClassForm({ ...classForm, code: e.target.value })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Nama Kelas (Informatika 3A)"
                        value={classForm.name}
                        onChange={(e) =>
                          setClassForm({ ...classForm, name: e.target.value })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      />
                      <input
                        type="number"
                        required
                        min={1}
                        max={14}
                        placeholder="Semester"
                        value={classForm.semester}
                        onChange={(e) =>
                          setClassForm({
                            ...classForm,
                            semester: Number(e.target.value),
                          })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Thn Akademik (2025/2026)"
                        value={classForm.academicYear}
                        onChange={(e) =>
                          setClassForm({
                            ...classForm,
                            academicYear: e.target.value,
                          })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      />
                      <select
                        value={classForm.studyProgramId}
                        onChange={(e) =>
                          setClassForm({
                            ...classForm,
                            studyProgramId: Number(e.target.value),
                          })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      >
                        <option value={0}>-- Pilih Prodi (Opsional) --</option>
                        {state.studyPrograms.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        required
                        min={1}
                        placeholder="Kapasitas"
                        value={classForm.capacity}
                        onChange={(e) =>
                          setClassForm({
                            ...classForm,
                            capacity: Number(e.target.value),
                          })
                        }
                        className="h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-10 px-5 w-full sm:w-auto bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold cursor-pointer"
                    >
                      {editingClassId ? 'Simpan Perubahan Kelas' : '+ Simpan Kelas Baru'}
                    </button>
                  </form>

                  {/* Table Classes */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0]">
                      <h3 className="text-sm font-bold text-[#0F172A]">
                        Daftar Kelas & Semester ({state.classes.length})
                      </h3>
                    </div>
                    {state.classes.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#64748B]">
                        Belum ada data kelas. Silakan tambahkan kelas baru pada form di atas.
                      </div>
                    ) : (
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F1F5F9] text-[#475569] text-[11px] font-bold uppercase border-b border-[#E2E8F0] whitespace-nowrap">
                              <th className="py-3 px-4">Kode</th>
                              <th className="py-3 px-4">Nama Kelas</th>
                              <th className="py-3 px-4">Program Studi</th>
                              <th className="py-3 px-4">Semester</th>
                              <th className="py-3 px-4">Tahun Akademik</th>
                              <th className="py-3 px-4">Kapasitas</th>
                              <th className="py-3 px-4 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] text-sm">
                            {state.classes.map((c: ClassRecord) => {
                              const prodi = state.studyPrograms.find(
                                (sp) => sp.id === c.studyProgramId
                              );
                              return (
                                <tr key={c.id} className="hover:bg-[#F8FAFC]">
                                  <td className="py-3 px-4 font-mono text-xs font-semibold whitespace-nowrap">
                                    {c.code}
                                  </td>
                                  <td className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                                    {c.name}
                                  </td>
                                  <td className="py-3 px-4 text-xs text-[#475569] whitespace-nowrap">
                                    {prodi?.name || '-'}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                                    Semester {c.semester}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                                    {c.academicYear}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                                    {c.capacity} Mahasiswa
                                  </td>
                                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                                    <button
                                      onClick={() => {
                                        setEditingClassId(c.id);
                                        setClassForm({
                                          code: c.code,
                                          name: c.name,
                                          semester: c.semester,
                                          academicYear: c.academicYear,
                                          studyProgramId: c.studyProgramId || 0,
                                          capacity: c.capacity,
                                        });
                                      }}
                                      className="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" /> Edit
                                    </button>
                                    <button
                                      onClick={async () => {
                                        await apiCall(`/api/cbt/classes/${c.id}`, 'DELETE');
                                        showToast('Data Kelas berhasil dihapus.');
                                      }}
                                      className="h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" /> Hapus
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: DATA MAHASISWA (DEDICATED CRUD MAHASISWA)
              ================================================================ */}
              {activeTab === 'data_mahasiswa' && (
                <StudentManager
                  state={state}
                  onCreateStudent={async (payload: StudentPayload) => {
                    await apiCall('/api/cbt/students', 'POST', payload);
                  }}
                  onUpdateStudent={async (studentId: number, payload: StudentPayload) => {
                    await apiCall(`/api/cbt/students/${studentId}`, 'PUT', payload);
                  }}
                  onDeleteStudent={async (studentId: number) => {
                    await apiCall(`/api/cbt/students/${studentId}`, 'DELETE');
                  }}
                  onImportStudents={async (items: StudentPayload[]) => {
                    return await apiCall('/api/cbt/students/import', 'POST', { items });
                  }}
                  onNotify={(msg: string) => showToast(msg)}
                />
              )}

              {/* ================================================================
                  TAB: MANAJEMEN PENGGUNA (FULL CRUD ADMIN, DOSEN, MAHASISWA)
              ================================================================ */}
              {activeTab === 'manajemen_pengguna' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Manajemen Pengguna (Admin, Dosen & Mahasiswa)
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Kelola akun pengguna, email, password login, foto profil, serta atribut akademik NIM/NIDN.
                    </p>
                  </div>

                  {/* Form Create / Update User */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        if (editingUserId) {
                          await apiCall(`/api/cbt/users/${editingUserId}`, 'PUT', userForm);
                          showToast('Data Akun Pengguna berhasil diperbarui.');
                        } else {
                          await apiCall('/api/cbt/users', 'POST', userForm);
                          showToast('Akun Pengguna baru berhasil ditambahkan.');
                        }
                        setEditingUserId(null);
                        setUserForm({
                          email: '',
                          password: '',
                          fullName: '',
                          roleName: 'mahasiswa',
                          avatarUrl: '',
                          isActive: true,
                          identifier: '',
                          facultyId: 0,
                          studyProgramId: 0,
                          classId: 0,
                          semester: 1,
                          enrollmentYear: 2025,
                          specialization: '',
                          phone: '',
                        });
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                    className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-[#0F172A]">
                        {editingUserId
                          ? 'Edit Akun Pengguna'
                          : 'Tambah Akun Pengguna Baru'}
                      </h2>
                      {editingUserId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(null);
                            setUserForm({
                              email: '',
                              password: '',
                              fullName: '',
                              roleName: 'mahasiswa',
                              avatarUrl: '',
                              isActive: true,
                              identifier: '',
                              facultyId: 0,
                              studyProgramId: 0,
                              classId: 0,
                              semester: 1,
                              enrollmentYear: 2025,
                              specialization: '',
                              phone: '',
                            });
                          }}
                          className="text-xs text-red-600 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Batal Edit
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                          Nama Lengkap
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Nama Lengkap & Gelar"
                          value={userForm.fullName}
                          onChange={(e) =>
                            setUserForm({ ...userForm, fullName: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                          Email Login
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="nama@unikma.ac.id"
                          value={userForm.email}
                          onChange={(e) =>
                            setUserForm({ ...userForm, email: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                          Password Login {editingUserId && '(Kosongkan jika tetap)'}
                        </label>
                        <input
                          type="text"
                          required={!editingUserId}
                          placeholder="Password Akun"
                          value={userForm.password}
                          onChange={(e) =>
                            setUserForm({ ...userForm, password: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                          Hak Akses (Role)
                        </label>
                        <select
                          value={userForm.roleName}
                          onChange={(e) =>
                            setUserForm({
                              ...userForm,
                              roleName: e.target.value as RoleType,
                            })
                          }
                          className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                        >
                          <option value="mahasiswa">Mahasiswa</option>
                          <option value="dosen">Dosen</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>

                    {/* Conditional Academic Fields for Dosen / Mahasiswa */}
                    {userForm.roleName !== 'admin' && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-[#E2E8F0]">
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                            {userForm.roleName === 'dosen' ? 'NIDN Dosen' : 'NIM Mahasiswa'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={
                              userForm.roleName === 'dosen'
                                ? 'Contoh: 0614088901'
                                : 'Contoh: 2023101001'
                            }
                            value={userForm.identifier}
                            onChange={(e) =>
                              setUserForm({ ...userForm, identifier: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                            Fakultas
                          </label>
                          <select
                            value={userForm.facultyId}
                            onChange={(e) =>
                              setUserForm({
                                ...userForm,
                                facultyId: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          >
                            <option value={0}>-- Pilih Fakultas --</option>
                            {state.faculties.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                            Program Studi
                          </label>
                          <select
                            value={userForm.studyProgramId}
                            onChange={(e) =>
                              setUserForm({
                                ...userForm,
                                studyProgramId: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          >
                            <option value={0}>-- Pilih Program Studi --</option>
                            {state.studyPrograms.map((sp) => (
                              <option key={sp.id} value={sp.id}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {userForm.roleName === 'mahasiswa' ? (
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                              Kelas Perkuliahan
                            </label>
                            <select
                              value={userForm.classId}
                              onChange={(e) =>
                                setUserForm({
                                  ...userForm,
                                  classId: Number(e.target.value),
                                })
                              }
                              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                            >
                              <option value={0}>-- Pilih Kelas --</option>
                              {state.classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.code} - {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#475569] mb-1">
                              Bidang Keahlian Dosen
                            </label>
                            <input
                              type="text"
                              placeholder="Contoh: Keamanan Siber & AI"
                              value={userForm.specialization}
                              onChange={(e) =>
                                setUserForm({
                                  ...userForm,
                                  specialization: e.target.value,
                                })
                              }
                              className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Avatar Upload / URL */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E2E8F0]">
                      <div className="flex items-center gap-3">
                        <label className="h-9 px-3 rounded-md border border-[#CBD5E1] hover:bg-[#F8FAFC] text-xs font-semibold text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                          Upload Foto Profil
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageFileUpload(e, (dataUrl) =>
                                setUserForm({ ...userForm, avatarUrl: dataUrl })
                              )
                            }
                          />
                        </label>
                        {userForm.avatarUrl && (
                          <img
                            src={userForm.avatarUrl}
                            alt="Preview"
                            className="w-9 h-9 rounded-full object-cover border border-[#CBD5E1]"
                          />
                        )}
                      </div>
                      <button
                        type="submit"
                        className="h-10 px-5 w-full sm:w-auto bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold cursor-pointer"
                      >
                        {editingUserId
                          ? 'Simpan Perubahan Akun'
                          : '+ Tambah Akun Pengguna'}
                      </button>
                    </div>
                  </form>

                  {/* Users Table */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    <div className="px-4 sm:px-5 py-3.5 border-b border-[#E2E8F0]">
                      <h3 className="text-sm font-bold text-[#0F172A]">
                        Daftar Seluruh Akun Pengguna ({state.users.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#F1F5F9] text-[#475569] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0] whitespace-nowrap">
                            <th className="py-3 px-4">Pengguna</th>
                            <th className="py-3 px-4">Email Login</th>
                            <th className="py-3 px-4">NIM / NIDN</th>
                            <th className="py-3 px-4">Peran</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] text-sm">
                          {state.users.map((u) => {
                            const mhs = state.students.find((s) => s.userId === u.id);
                            const dsn = state.lecturers.find((l) => l.userId === u.id);
                            return (
                              <tr key={u.id} className="hover:bg-[#F8FAFC]">
                                <td className="py-3 px-4 flex items-center gap-3 whitespace-nowrap">
                                  {u.avatarUrl ? (
                                    <img
                                      src={u.avatarUrl}
                                      alt={u.fullName}
                                      className="w-8 h-8 rounded-full object-cover border border-[#CBD5E1] shrink-0"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                                      {u.fullName.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="font-semibold text-[#0F172A]">
                                    {u.fullName}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono text-xs text-[#475569] whitespace-nowrap">
                                  {u.email}
                                </td>
                                <td className="py-3 px-4 font-mono text-xs text-[#0F172A] whitespace-nowrap">
                                  {mhs?.nim || dsn?.nidn || 'ADMIN-UTAMA'}
                                </td>
                                <td className="py-3 px-4 uppercase font-mono text-xs font-bold text-[#F97316] whitespace-nowrap">
                                  {u.roleName}
                                </td>
                                <td className="py-3 px-4 text-xs text-[#16A34A] font-semibold whitespace-nowrap">
                                  {u.isActive ? 'Aktif' : 'Nonaktif'}
                                </td>
                                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                                  <button
                                    onClick={() => {
                                      setEditingUserId(u.id);
                                      setUserForm({
                                        email: u.email,
                                        password: '',
                                        fullName: u.fullName,
                                        roleName: u.roleName,
                                        avatarUrl: u.avatarUrl || '',
                                        isActive: u.isActive,
                                        identifier: mhs?.nim || dsn?.nidn || '',
                                        facultyId:
                                          mhs?.facultyId || dsn?.facultyId || 0,
                                        studyProgramId:
                                          mhs?.studyProgramId ||
                                          dsn?.studyProgramId ||
                                          0,
                                        classId: mhs?.classId || 0,
                                        semester: mhs?.semester || 1,
                                        enrollmentYear: mhs?.enrollmentYear || 2025,
                                        specialization: dsn?.specialization || '',
                                        phone: dsn?.phone || '',
                                      });
                                    }}
                                    className="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (u.id === currentUser.id) {
                                        showToast(
                                          'Tidak dapat menghapus akun Admin yang sedang aktif digunakan.'
                                        );
                                        return;
                                      }
                                      await apiCall(`/api/cbt/users/${u.id}`, 'DELETE');
                                      showToast('Akun pengguna berhasil dihapus.');
                                    }}
                                    className="h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" /> Hapus
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: FAKULTAS & PRODI (FULL CRUD)
              ================================================================ */}
              {activeTab === 'fakultas_prodi' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Manajemen Fakultas & Program Studi
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Tambah, ubah, dan hapus data Fakultas serta Program Studi MazCodeID.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* CRUD Fakultas */}
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {editingFacultyId
                            ? 'Edit Data Fakultas'
                            : 'Daftar & Tambah Fakultas'}
                        </h2>
                        {editingFacultyId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFacultyId(null);
                              setFacultyForm({ code: '', name: '', deanName: '' });
                            }}
                            className="text-xs text-red-600 font-semibold cursor-pointer"
                          >
                            Batal Edit
                          </button>
                        )}
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (editingFacultyId) {
                            await apiCall(
                              `/api/cbt/faculties/${editingFacultyId}`,
                              'PUT',
                              facultyForm
                            );
                            showToast('Data Fakultas berhasil diperbarui.');
                          } else {
                            await apiCall('/api/cbt/faculties', 'POST', facultyForm);
                            showToast('Fakultas baru berhasil ditambahkan.');
                          }
                          setEditingFacultyId(null);
                          setFacultyForm({ code: '', name: '', deanName: '' });
                        }}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                      >
                        <input
                          type="text"
                          required
                          placeholder="Kode (FTIK)"
                          value={facultyForm.code}
                          onChange={(e) =>
                            setFacultyForm({ ...facultyForm, code: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Nama Fakultas"
                          value={facultyForm.name}
                          onChange={(e) =>
                            setFacultyForm({ ...facultyForm, name: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Nama Dekan"
                          value={facultyForm.deanName}
                          onChange={(e) =>
                            setFacultyForm({ ...facultyForm, deanName: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <button
                          type="submit"
                          className="sm:col-span-3 h-9 bg-[#F97316] hover:bg-[#EA580C] text-white rounded text-xs font-semibold cursor-pointer"
                        >
                          {editingFacultyId
                            ? 'Simpan Perubahan Fakultas'
                            : '+ Simpan Fakultas'}
                        </button>
                      </form>

                      {state.faculties.length === 0 ? (
                        <p className="text-xs text-[#64748B] py-4 text-center">
                          Belum ada data fakultas.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#E2E8F0]">
                          {state.faculties.map((f: FacultyRecord) => (
                            <div
                              key={f.id}
                              className="py-3 flex items-center justify-between gap-2"
                            >
                              <div>
                                <p className="text-sm font-bold text-[#0F172A]">
                                  [{f.code}] {f.name}
                                </p>
                                <p className="text-xs text-[#64748B]">
                                  Dekan: {f.deanName}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingFacultyId(f.id);
                                    setFacultyForm({
                                      code: f.code,
                                      name: f.name,
                                      deanName: f.deanName,
                                    });
                                  }}
                                  className="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={async () => {
                                    await apiCall(`/api/cbt/faculties/${f.id}`, 'DELETE');
                                    showToast('Fakultas berhasil dihapus.');
                                  }}
                                  className="h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* CRUD Program Studi */}
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {editingProdiId
                            ? 'Edit Program Studi'
                            : 'Daftar & Tambah Program Studi'}
                        </h2>
                        {editingProdiId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProdiId(null);
                              setProdiForm({
                                code: '',
                                name: '',
                                degree: 'S1',
                                facultyId: 0,
                                headName: '',
                              });
                            }}
                            className="text-xs text-red-600 font-semibold cursor-pointer"
                          >
                            Batal Edit
                          </button>
                        )}
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (editingProdiId) {
                            await apiCall(
                              `/api/cbt/study-programs/${editingProdiId}`,
                              'PUT',
                              prodiForm
                            );
                            showToast('Program Studi berhasil diperbarui.');
                          } else {
                            await apiCall('/api/cbt/study-programs', 'POST', prodiForm);
                            showToast('Program Studi baru berhasil ditambahkan.');
                          }
                          setEditingProdiId(null);
                          setProdiForm({
                            code: '',
                            name: '',
                            degree: 'S1',
                            facultyId: 0,
                            headName: '',
                          });
                        }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                      >
                        <input
                          type="text"
                          required
                          placeholder="Kode Prodi (TI-S1)"
                          value={prodiForm.code}
                          onChange={(e) =>
                            setProdiForm({ ...prodiForm, code: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Nama Program Studi"
                          value={prodiForm.name}
                          onChange={(e) =>
                            setProdiForm({ ...prodiForm, name: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <select
                          value={prodiForm.facultyId}
                          onChange={(e) =>
                            setProdiForm({
                              ...prodiForm,
                              facultyId: Number(e.target.value),
                            })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        >
                          <option value={0}>-- Pilih Fakultas --</option>
                          {state.faculties.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          required
                          placeholder="Nama Kaprodi"
                          value={prodiForm.headName}
                          onChange={(e) =>
                            setProdiForm({ ...prodiForm, headName: e.target.value })
                          }
                          className="h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                        <button
                          type="submit"
                          className="sm:col-span-2 h-9 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded text-xs font-semibold cursor-pointer"
                        >
                          {editingProdiId
                            ? 'Simpan Perubahan Prodi'
                            : '+ Simpan Program Studi'}
                        </button>
                      </form>

                      {state.studyPrograms.length === 0 ? (
                        <p className="text-xs text-[#64748B] py-4 text-center">
                          Belum ada data program studi.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#E2E8F0]">
                          {state.studyPrograms.map((sp: StudyProgramRecord) => (
                            <div
                              key={sp.id}
                              className="py-3 flex items-center justify-between gap-2"
                            >
                              <div>
                                <p className="text-sm font-bold text-[#0F172A]">
                                  [{sp.code}] {sp.degree} - {sp.name}
                                </p>
                                <p className="text-xs text-[#64748B]">
                                  Kaprodi: {sp.headName}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingProdiId(sp.id);
                                    setProdiForm({
                                      code: sp.code,
                                      name: sp.name,
                                      degree: sp.degree,
                                      facultyId: sp.facultyId || 0,
                                      headName: sp.headName,
                                    });
                                  }}
                                  className="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={async () => {
                                    await apiCall(
                                      `/api/cbt/study-programs/${sp.id}`,
                                      'DELETE'
                                    );
                                    showToast('Program Studi berhasil dihapus.');
                                  }}
                                  className="h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: MATA KULIAH (FULL CRUD)
              ================================================================ */}
              {activeTab === 'mata_kuliah' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Manajemen Mata Kuliah
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Tambah, ubah, dan hapus mata kuliah beserta bobot SKS, semester, dan dosen pengampu.
                    </p>
                  </div>

                  {role === 'admin' && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (submittingCourse) return;
                        try {
                          setSubmittingCourse(true);
                          setErrorMsg(null);
                          if (editingCourseId) {
                            await apiCall(
                              `/api/cbt/courses/${editingCourseId}`,
                              'PUT',
                              courseForm
                            );
                            showToast(
                              didLastWriteUseLocalFallback()
                                ? 'Perubahan Mata Kuliah disimpan di browser lokal (database server belum terhubung di URL ini).'
                                : 'Data Mata Kuliah berhasil diperbarui di database.'
                            );
                          } else {
                            await apiCall('/api/cbt/courses', 'POST', courseForm);
                            showToast(
                              didLastWriteUseLocalFallback()
                                ? 'Mata Kuliah disimpan di browser lokal (database server belum terhubung di URL ini).'
                                : 'Mata Kuliah baru berhasil disimpan ke database.'
                            );
                          }
                          setEditingCourseId(null);
                          setCourseForm({
                            code: '',
                            name: '',
                            sks: 3,
                            semester: 1,
                            studyProgramId: 0,
                            lecturerId: 0,
                            description: '',
                          });
                        } catch (err: any) {
                          const msg =
                            err?.message || 'Gagal menyimpan mata kuliah ke database.';
                          setErrorMsg(msg);
                          showToast(msg);
                        } finally {
                          setSubmittingCourse(false);
                        }
                      }}
                      className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {editingCourseId
                            ? 'Edit Mata Kuliah'
                            : 'Tambah Mata Kuliah Baru'}
                        </h2>
                        {editingCourseId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCourseId(null);
                              setCourseForm({
                                code: '',
                                name: '',
                                sks: 3,
                                semester: 1,
                                studyProgramId: 0,
                                lecturerId: 0,
                                description: '',
                              });
                            }}
                            className="text-xs text-red-600 font-semibold cursor-pointer"
                          >
                            Batal Edit
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                        <div className="lg:col-span-2">
                          <label
                            htmlFor="course-code"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            Kode MK
                          </label>
                          <input
                            id="course-code"
                            type="text"
                            required
                            placeholder="Contoh: IF301"
                            value={courseForm.code}
                            onChange={(e) =>
                              setCourseForm({ ...courseForm, code: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <label
                            htmlFor="course-name"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            Nama Mata Kuliah
                          </label>
                          <input
                            id="course-name"
                            type="text"
                            required
                            placeholder="Nama Mata Kuliah"
                            value={courseForm.name}
                            onChange={(e) =>
                              setCourseForm({ ...courseForm, name: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          />
                        </div>
                        <div className="lg:col-span-1">
                          <label
                            htmlFor="course-sks"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            SKS
                          </label>
                          <input
                            id="course-sks"
                            type="number"
                            required
                            min={1}
                            max={6}
                            placeholder="SKS"
                            value={courseForm.sks}
                            onChange={(e) =>
                              setCourseForm({
                                ...courseForm,
                                sks: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <label
                            htmlFor="course-semester"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            Semester
                          </label>
                          <select
                            id="course-semester"
                            value={courseForm.semester}
                            onChange={(e) =>
                              setCourseForm({
                                ...courseForm,
                                semester: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs bg-white"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                              <option key={sem} value={sem}>
                                Semester {sem}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="lg:col-span-2">
                          <label
                            htmlFor="course-prodi"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            Program Studi
                          </label>
                          <select
                            id="course-prodi"
                            value={courseForm.studyProgramId}
                            onChange={(e) =>
                              setCourseForm({
                                ...courseForm,
                                studyProgramId: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs bg-white"
                          >
                            <option value={0}>-- Pilih Prodi --</option>
                            {state.studyPrograms.map((sp) => (
                              <option key={sp.id} value={sp.id}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="lg:col-span-2">
                          <label
                            htmlFor="course-lecturer"
                            className="block text-[11px] font-semibold text-[#475569] mb-1"
                          >
                            Dosen Pengampu
                          </label>
                          <select
                            id="course-lecturer"
                            value={courseForm.lecturerId}
                            onChange={(e) =>
                              setCourseForm({
                                ...courseForm,
                                lecturerId: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs bg-white"
                          >
                            <option value={0}>-- Pilih Dosen --</option>
                            {state.lecturers.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.fullName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={submittingCourse}
                        className="h-10 px-5 w-full sm:w-auto bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white rounded-md text-xs font-semibold cursor-pointer"
                      >
                        {submittingCourse
                          ? 'Menyimpan ke Database...'
                          : editingCourseId
                            ? 'Simpan Perubahan Mata Kuliah'
                            : '+ Tambah Mata Kuliah'}
                      </button>
                    </form>
                  )}

                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    {state.courses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#64748B]">
                        Belum ada data mata kuliah. Silakan tambahkan mata kuliah di atas.
                      </div>
                    ) : (
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F1F5F9] text-[#475569] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0] whitespace-nowrap">
                              <th className="py-3 px-4">Kode MK</th>
                              <th className="py-3 px-4">Nama Mata Kuliah</th>
                              <th className="py-3 px-4">SKS / Semester</th>
                              <th className="py-3 px-4">Dosen Pengampu</th>
                              <th className="py-3 px-4">Jumlah Soal</th>
                              {role === 'admin' && (
                                <th className="py-3 px-4 text-right">Aksi</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] text-sm">
                            {state.courses.map((c: CourseRecord) => {
                              const lecturer = state.lecturers.find(
                                (l) => l.id === c.lecturerId
                              );
                              const qCount = state.questions.filter(
                                (q) => q.courseId === c.id
                              ).length;
                              return (
                                <tr key={c.id} className="hover:bg-[#F8FAFC]">
                                  <td className="py-3.5 px-4 font-mono text-xs font-bold whitespace-nowrap">
                                    {c.code}
                                  </td>
                                  <td className="py-3.5 px-4 font-semibold text-[#0F172A] whitespace-nowrap">
                                    {c.name}
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                                    {c.sks} SKS • Sem {c.semester}
                                  </td>
                                  <td className="py-3.5 px-4 text-xs text-[#475569] whitespace-nowrap">
                                    {lecturer?.fullName || '-'}
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-[#F97316] whitespace-nowrap">
                                    {qCount} Butir Soal
                                  </td>
                                  {role === 'admin' && (
                                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                                      <button
                                        onClick={() => {
                                          setEditingCourseId(c.id);
                                          setCourseForm({
                                            code: c.code,
                                            name: c.name,
                                            sks: c.sks,
                                            semester: c.semester,
                                            studyProgramId: c.studyProgramId || 0,
                                            lecturerId: c.lecturerId || 0,
                                            description: c.description || '',
                                          });
                                        }}
                                        className="h-7 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold cursor-pointer"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={async () => {
                                          try {
                                            setErrorMsg(null);
                                            await apiCall(
                                              `/api/cbt/courses/${c.id}`,
                                              'DELETE'
                                            );
                                            showToast('Mata Kuliah berhasil dihapus.');
                                          } catch (err: any) {
                                            const msg =
                                              err?.message ||
                                              'Gagal menghapus mata kuliah.';
                                            setErrorMsg(msg);
                                            showToast(msg);
                                          }
                                        }}
                                        className="h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold cursor-pointer"
                                      >
                                        Hapus
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: BANK SOAL (FULL CRUD VIA QuestionBankManager)
              ================================================================ */}
              {activeTab === 'bank_soal' && (
                <QuestionBankManager
                  state={state}
                  onCreateQuestion={async (payload) => {
                    await apiCall('/api/cbt/questions', 'POST', payload);
                    showToast('Butir soal berhasil disimpan ke Bank Soal.');
                  }}
                  onUpdateQuestion={async (id, payload) => {
                    await apiCall(`/api/cbt/questions/${id}`, 'PUT', payload);
                    showToast('Butir soal berhasil diperbarui.');
                  }}
                  onImportQuestions={async (items) => {
                    await apiCall('/api/cbt/questions/import', 'POST', { items });
                    showToast('Import soal berhasil disimpan ke Bank Soal.');
                  }}
                  onDeleteQuestion={async (id) => {
                    await apiCall(`/api/cbt/questions/${id}`, 'DELETE');
                    showToast('Butir soal berhasil dihapus.');
                  }}
                />
              )}

              {/* ================================================================
                  TAB: MANAJEMEN UJIAN / BUAT UJIAN / JADWAL UJIAN (FULL CRUD)
              ================================================================ */}
              {(activeTab === 'manajemen_ujian' ||
                activeTab === 'buat_ujian' ||
                activeTab === 'jadwal_ujian') && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Manajemen & Jadwal Ujian CBT
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Atur jadwal ujian, durasi, acak urutan soal & opsi, serta kebijakan wajib kamera dan 3x snapshot.
                    </p>
                  </div>

                  {(role === 'admin' || role === 'dosen') && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const durationMinutes = Math.max(
                          5,
                          Number(examForm.durationMinutes) || 60
                        );
                        const totalQuestions = Math.max(
                          1,
                          Number(examForm.totalQuestions) || 20
                        );
                        const nowMs = Date.now();
                        const startTime =
                          examForm.startTime && examForm.startTime.trim() !== ''
                            ? examForm.startTime.trim()
                            : new Date(nowMs).toISOString();
                        const parsedStart = Date.parse(startTime);
                        const endTime =
                          examForm.endTime && examForm.endTime.trim() !== ''
                            ? examForm.endTime.trim()
                            : new Date(
                                (Number.isFinite(parsedStart)
                                  ? parsedStart
                                  : nowMs) +
                                  durationMinutes * 60 * 1000
                              ).toISOString();
                        const payload = {
                          ...examForm,
                          code: examForm.code.trim(),
                          title: examForm.title.trim(),
                          durationMinutes,
                          totalQuestions,
                          startTime,
                          endTime,
                          randomizeOptions: examForm.randomizeQuestions,
                        };
                        try {
                          if (editingExamId) {
                            await apiCall(
                              `/api/cbt/exams/${editingExamId}`,
                              'PUT',
                              payload
                            );
                            showToast('Jadwal Ujian berhasil diperbarui.');
                          } else {
                            await apiCall('/api/cbt/exams', 'POST', payload);
                            showToast('Jadwal Ujian CBT baru berhasil diterbitkan.');
                          }
                          setEditingExamId(null);
                          setExamForm({
                            ...examForm,
                            code: '',
                            title: '',
                            startTime: '',
                            endTime: '',
                          });
                        } catch (err: any) {
                          showToast(
                            err?.message || 'Gagal menyimpan jadwal ujian.'
                          );
                        }
                      }}
                      className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {editingExamId
                            ? 'Edit Konfigurasi Jadwal Ujian'
                            : 'Buat Sesi Ujian Baru'}
                        </h2>
                        {editingExamId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExamId(null);
                              setExamForm({
                                ...examForm,
                                code: '',
                                title: '',
                                startTime: '',
                                endTime: '',
                              });
                            }}
                            className="text-xs text-red-600 font-semibold cursor-pointer"
                          >
                            Batal Edit
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Kode Ujian
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: CBT-2026-01"
                            value={examForm.code}
                            onChange={(e) =>
                              setExamForm({ ...examForm, code: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Judul Ujian Lengkap
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: UTS Sistem Terdistribusi"
                            value={examForm.title}
                            onChange={(e) =>
                              setExamForm({ ...examForm, title: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Mata Kuliah
                          </label>
                          <select
                            value={examForm.courseId}
                            onChange={(e) =>
                              setExamForm({
                                ...examForm,
                                courseId: Number(e.target.value),
                              })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs bg-white"
                          >
                            <option value={0}>-- Pilih Mata Kuliah --</option>
                            {state.courses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} - {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Jenis Ujian
                          </label>
                          <select
                            value={examForm.examType}
                            onChange={(e) =>
                              setExamForm({ ...examForm, examType: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] text-xs bg-white"
                          >
                            <option value="UTS">Ujian Tengah Semester (UTS)</option>
                            <option value="UAS">Ujian Akhir Semester (UAS)</option>
                            <option value="Kuis">Kuis Evaluasi</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Waktu / Durasi Ujian (Menit)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={5}
                              max={300}
                              required
                              value={examForm.durationMinutes || ''}
                              onChange={(e) =>
                                setExamForm({
                                  ...examForm,
                                  durationMinutes:
                                    e.target.value === ''
                                      ? 0
                                      : Number(e.target.value),
                                })
                              }
                              placeholder="60"
                              className="w-full h-10 pl-3 pr-14 rounded-md border border-[#CBD5E1] text-xs font-mono tabular-nums"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#64748B] pointer-events-none">
                              Menit
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
                            Jumlah Soal
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={1}
                              max={200}
                              required
                              value={examForm.totalQuestions || ''}
                              onChange={(e) =>
                                setExamForm({
                                  ...examForm,
                                  totalQuestions:
                                    e.target.value === ''
                                      ? 0
                                      : Number(e.target.value),
                                })
                              }
                              placeholder="50"
                              className="w-full h-10 pl-3 pr-12 rounded-md border border-[#CBD5E1] text-xs font-mono tabular-nums"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#64748B] pointer-events-none">
                              Soal
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col justify-end gap-2">
                          <label className="flex items-center gap-2 text-xs text-[#0F172A] px-1">
                            <input
                              type="checkbox"
                              checked={examForm.randomizeQuestions}
                              onChange={(e) =>
                                setExamForm({
                                  ...examForm,
                                  randomizeQuestions: e.target.checked,
                                })
                              }
                            />
                            Acak Soal & Opsi
                          </label>
                          <button
                            type="submit"
                            className="h-10 px-4 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold cursor-pointer"
                          >
                            {editingExamId
                              ? 'Simpan Perubahan Ujian'
                              : '+ Terbitkan Jadwal Ujian'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {state.exams.length === 0 ? (
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-xs text-[#64748B]">
                      Belum ada jadwal ujian yang diterbitkan.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {state.exams.map((ex) => {
                        const course = state.courses.find((c) => c.id === ex.courseId);
                        return (
                          <div
                            key={ex.id}
                            className="bg-white border border-[#E2E8F0] rounded-lg p-5 flex flex-col justify-between gap-4"
                          >
                            <div>
                              <div className="flex items-center justify-between text-xs font-mono text-[#64748B]">
                                <span>
                                  {ex.code} • {ex.examType}
                                </span>
                                <span className="text-[#16A34A] font-bold uppercase">
                                  {ex.status}
                                </span>
                              </div>
                              <h3 className="text-base font-bold text-[#0F172A] mt-1">
                                {ex.title}
                              </h3>
                              <p className="text-xs text-[#475569] mt-0.5">
                                Mata Kuliah: {course?.name || 'Umum'}
                              </p>
                              <div className="mt-3 pt-3 border-t border-[#E2E8F0] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div>
                                  <span className="text-[#64748B] block">Durasi</span>
                                  <span className="font-mono font-bold">
                                    {ex.durationMinutes} Menit
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Jumlah Soal</span>
                                  <span className="font-mono font-bold">
                                    {ex.totalQuestions} Soal
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Snapshot</span>
                                  <span className="font-mono font-bold">
                                    {ex.snapshotCount}x Otomatis
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Batas</span>
                                  <span className="font-mono font-bold">
                                    Maks {ex.maxViolations}x
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              {role === 'mahasiswa' ? (
                                <button
                                  onClick={() => handleStartStudentExam(ex)}
                                  className="h-9 px-4 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  Ikuti Ujian Sekarang
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingExamId(ex.id);
                                      setExamForm({
                                        code: ex.code,
                                        title: ex.title,
                                        courseId: ex.courseId || 0,
                                        lecturerId: ex.lecturerId || 0,
                                        classId: ex.classId || 0,
                                        examType: ex.examType,
                                        durationMinutes: ex.durationMinutes,
                                        totalQuestions: ex.totalQuestions,
                                        startTime: ex.startTime || '',
                                        endTime: ex.endTime || '',
                                        passingGrade: ex.passingGrade,
                                        randomizeQuestions: ex.randomizeQuestions,
                                        randomizeOptions: ex.randomizeOptions,
                                        maxAttempts: ex.maxAttempts,
                                        requireCamera: ex.requireCamera,
                                        requireFullscreen: ex.requireFullscreen,
                                        snapshotCount: ex.snapshotCount,
                                        maxViolations: ex.maxViolations,
                                        violationAction: ex.violationAction,
                                        status: ex.status,
                                      });
                                    }}
                                    className="h-8 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold rounded-md cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await apiCall(`/api/cbt/exams/${ex.id}`, 'DELETE');
                                      showToast('Jadwal ujian berhasil dihapus.');
                                    }}
                                    className="h-8 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                  <button
                                    onClick={() => setActiveTab('monitoring_ujian')}
                                    className="h-8 px-3 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold rounded-md cursor-pointer"
                                  >
                                    Monitor
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ================================================================
                  TAB: MONITORING UJIAN, SNAPSHOT PESERTA, PELANGGARAN
              ================================================================ */}
              {(activeTab === 'monitoring_ujian' ||
                activeTab === 'snapshot_peserta' ||
                activeTab === 'pelanggaran') && (
                <MonitoringDashboard
                  state={state}
                  liveEvents={liveNotifications.map((n) => ({
                    type: n.level,
                    message: n.text,
                    timestamp: n.time,
                  }))}
                  onVerifyViolation={async (
                    violationId: number,
                    actionTaken: string,
                    verifiedByAdmin: boolean
                  ) => {
                    await apiCall(`/api/cbt/violations/${violationId}/verify`, 'POST', {
                      actionTaken,
                      verifiedByAdmin,
                    });
                    showToast('Status verifikasi pelanggaran berhasil diperbarui.');
                  }}
                  onDeleteSnapshot={async (snapshotId: number) => {
                    await apiCall(`/api/cbt/snapshots/${snapshotId}`, 'DELETE');
                    showToast('File snapshot berhasil dihapus dari penyimpanan.');
                  }}
                  onPurgeSnapshots={async (options) => {
                    const res = await apiCall(
                      '/api/cbt/snapshots/purge',
                      'POST',
                      options
                    );
                    showToast(
                      `${res?.deletedCount ?? 0} snapshot berhasil dibersihkan.`
                    );
                    return res;
                  }}
                />
              )}

              {/* ================================================================
                  TAB: KOREKSI ESAI (DOSEN & ADMIN)
              ================================================================ */}
              {activeTab === 'koreksi_esai' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Pemeriksaan & Koreksi Jawaban Esai Mahasiswa
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Berikan penilaian manual pada soal tipe Esai dan Isian Singkat untuk dikalkulasikan ke Nilai Akhir.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {state.answers
                      .filter((ans) => {
                        const q = state.questions.find((qu) => qu.id === ans.questionId);
                        return (
                          q?.questionType === 'esai' ||
                          q?.questionType === 'isian_singkat'
                        );
                      })
                      .map((ans) => {
                        const q = state.questions.find((qu) => qu.id === ans.questionId);
                        const sess = state.sessions.find((s) => s.id === ans.sessionId);
                        const student = state.students.find(
                          (st) => st.id === sess?.studentId
                        );
                        return (
                          <div
                            key={ans.id}
                            className="bg-white border border-[#E2E8F0] rounded-lg p-5 space-y-3"
                          >
                            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                              <div>
                                <span className="text-xs font-bold text-[#F97316] uppercase font-mono">
                                  {student?.nim} — {student?.fullName}
                                </span>
                                <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                                  Soal: {q?.questionText}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-bold text-[#475569]">
                                Bobot Maks: {q?.weight || 10} Poin
                              </span>
                            </div>

                            <div className="p-3.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#0F172A] leading-relaxed">
                              <p className="font-bold text-[#64748B] mb-1">
                                Jawaban Mahasiswa:
                              </p>
                              {ans.answerValue || '(Kosong)'}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="Skor Esai (0-100)"
                                value={essayGradeScores[ans.id] ?? ans.scoreEarned}
                                onChange={(e) =>
                                  setEssayGradeScores({
                                    ...essayGradeScores,
                                    [ans.id]: Number(e.target.value),
                                  })
                                }
                                className="w-full sm:w-36 h-10 sm:h-9 px-3 rounded border border-[#CBD5E1] text-xs font-mono"
                              />
                              <input
                                type="text"
                                placeholder="Catatan Umpan Balik Dosen..."
                                value={
                                  essayGradeFeedback[ans.id] ??
                                  (ans.lecturerFeedback || '')
                                }
                                onChange={(e) =>
                                  setEssayGradeFeedback({
                                    ...essayGradeFeedback,
                                    [ans.id]: e.target.value,
                                  })
                                }
                                className="flex-1 w-full h-10 sm:h-9 px-3 rounded border border-[#CBD5E1] text-xs"
                              />
                              <button
                                onClick={async () => {
                                  const resRecord = state.results.find(
                                    (r) => r.sessionId === ans.sessionId
                                  );
                                  await apiCall('/api/cbt/results/grade-essay', 'POST', {
                                    answerId: ans.id,
                                    resultId: resRecord?.id || 0,
                                    essayScore:
                                      essayGradeScores[ans.id] ?? ans.scoreEarned ?? 85,
                                    feedback:
                                      essayGradeFeedback[ans.id] ||
                                      'Jawaban esai telah dinilai oleh dosen pengampu.',
                                  });
                                  showToast('Nilai esai berhasil disimpan.');
                                }}
                                className="h-10 sm:h-9 px-4 w-full sm:w-auto bg-[#16A34A] hover:bg-[#15803D] text-white rounded text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Simpan Nilai Esai
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {state.answers.filter((ans) => {
                      const q = state.questions.find((qu) => qu.id === ans.questionId);
                      return (
                        q?.questionType === 'esai' ||
                        q?.questionType === 'isian_singkat'
                      );
                    }).length === 0 && (
                      <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-xs text-[#64748B]">
                        Belum ada jawaban esai mahasiswa yang masuk.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: NILAI & LAPORAN / HASIL UJIAN / RIWAYAT UJIAN
              ================================================================ */}
              {(activeTab === 'nilai_laporan' ||
                activeTab === 'hasil_ujian' ||
                activeTab === 'riwayat_ujian') && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold text-[#0F172A]">
                        Laporan Hasil Ujian & Analisis Nilai Akademik
                      </h1>
                      <p className="text-xs text-[#475569]">
                        Rekapitulasi nilai objektif otomatis, koreksi esai, durasi pengerjaan, dan status verifikasi integritas.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={handleExportResultsCsv}
                        className="h-10 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export Excel (CSV)
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="h-10 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-md text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                      >
                        <Printer className="w-4 h-4" />
                        Cetak / Export PDF
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    {state.results.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#64748B]">
                        Belum ada data hasil ujian yang terkumpul.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F1F5F9] text-[#475569] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0]">
                              <th className="py-3 px-4">NIM & Mahasiswa</th>
                              <th className="py-3 px-4">Program Studi</th>
                              <th className="py-3 px-4">Mata Kuliah</th>
                              <th className="py-3 px-4">B / S / K</th>
                              <th className="py-3 px-4">Skor Objektif</th>
                              <th className="py-3 px-4">Skor Esai</th>
                              <th className="py-3 px-4">Nilai Akhir</th>
                              <th className="py-3 px-4">Pelanggaran</th>
                              <th className="py-3 px-4">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] text-sm">
                            {state.results.map((r) => (
                              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                                <td className="py-3.5 px-4">
                                  <p className="font-semibold text-[#0F172A]">
                                    {r.studentName}
                                  </p>
                                  <p className="text-xs font-mono text-[#64748B]">
                                    {r.nim}
                                  </p>
                                </td>
                                <td className="py-3.5 px-4 text-xs text-[#475569]">
                                  {r.studyProgramName}
                                </td>
                                <td className="py-3.5 px-4 text-xs font-semibold text-[#0F172A]">
                                  {r.courseName}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                                  <span className="text-[#16A34A] font-bold">
                                    {r.correctCount}
                                  </span>{' '}
                                  /{' '}
                                  <span className="text-[#DC2626] font-bold">
                                    {r.wrongCount}
                                  </span>{' '}
                                  / <span>{r.emptyCount}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                                  {r.objectiveScore}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                                  {r.essayScore}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-sm font-extrabold text-[#F97316] tabular-nums">
                                  {r.finalScore} ({r.gradeLetter})
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                                  {r.violationCount}x
                                </td>
                                <td className="py-3.5 px-4 text-xs">
                                  <span className="font-semibold text-[#16A34A]">
                                    {r.isPublished ? 'Dipublikasikan' : 'Draft'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: UJIAN AKTIF (MAHASISWA)
              ================================================================ */}
              {activeTab === 'ujian_aktif' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Sesi Ujian Aktif — Verifikasi Kamera & Perangkat
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Pastikan kamera depan aktif dan browser mendukung mode layar penuh sebelum memulai ujian.
                    </p>
                  </div>

                  {state.exams.length === 0 ? (
                    <div className="bg-white border border-[#E2E8F0] rounded-lg p-8 text-center text-xs text-[#64748B]">
                      Belum ada ujian aktif yang dijadwalkan saat ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {state.exams.map((ex) => {
                        const course = state.courses.find((c) => c.id === ex.courseId);
                        return (
                          <div
                            key={ex.id}
                            className="bg-white border-2 border-[#F97316]/30 rounded-lg p-6 space-y-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold uppercase text-[#F97316]">
                                {ex.code} • {ex.examType}
                              </span>
                              <span className="text-xs font-semibold text-[#16A34A] flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-ping" />
                                SIAP DIIKUTI
                              </span>
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-[#0F172A]">
                                {ex.title}
                              </h2>
                              <p className="text-xs text-[#475569] mt-1">
                                Mata Kuliah: {course?.name || 'Umum'} ({course?.sks || 3}{' '}
                                SKS)
                              </p>
                            </div>
                            <div className="bg-[#F8FAFC] p-3.5 rounded-md border border-[#E2E8F0] text-xs space-y-1.5 text-[#475569]">
                              <p className="font-semibold text-[#0F172A]">
                                Ketentuan Anti-Cheating Wajib:
                              </p>
                              <p>• Kamera WebRTC wajib aktif selama ujian berlangsung.</p>
                              <p>
                                • Sistem mengambil 3x snapshot otomatis (Awal, Tengah Acak, Akhir).
                              </p>
                              <p>
                                • Mode layar penuh (Fullscreen) wajib dipertahankan.
                              </p>
                            </div>
                            <button
                              onClick={() => handleStartStudentExam(ex)}
                              className="w-full h-11 bg-[#F97316] hover:bg-[#EA580C] text-white font-semibold rounded-md text-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Camera className="w-4 h-4" />
                              Verifikasi Kamera & Mulai Ujian
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ================================================================
                  TAB: PENGATURAN (CRUD WEBSITE IDENTITY, FOTO, NAMA WEBSITE & ANTI-CHEATING)
              ================================================================ */}
              {activeTab === 'pengaturan' && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">
                      Identitas Website, Foto Banner, Logo & Konfigurasi Sistem
                    </h1>
                    <p className="text-xs text-[#475569]">
                      Ubah nama website, nama universitas, tagline, foto hero/banner halaman login, foto logo website, serta kelola profil tema website.
                    </p>
                  </div>

                  {/* CRUD Website Settings Form */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        if (editingWebsiteId) {
                          await apiCall(
                            `/api/cbt/website-settings/${editingWebsiteId}`,
                            'PUT',
                            websiteForm
                          );
                          showToast('Identitas Website & Foto berhasil diperbarui.');
                        } else {
                          await apiCall(
                            '/api/cbt/website-settings',
                            'POST',
                            websiteForm
                          );
                          showToast('Profil Website baru berhasil ditambahkan.');
                        }
                        await fetchPublicWebsiteSettings();
                      } catch (err: any) {
                        showToast(err.message);
                      }
                    }}
                    className="bg-white border border-[#E2E8F0] rounded-lg p-4 sm:p-6 space-y-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                      <div className="flex items-center gap-2.5">
                        <Globe className="w-5 h-5 text-[#F97316] shrink-0" />
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {editingWebsiteId
                            ? `Edit Profil Website Aktif (#${editingWebsiteId})`
                            : 'Tambah Profil Identitas Website Baru'}
                        </h2>
                      </div>
                      {editingWebsiteId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingWebsiteId(null);
                            setWebsiteForm({
                              siteName: '',
                              universityName: '',
                              tagline: '',
                              description: '',
                              logoText: 'MCD',
                              logoImageUrl: '',
                              heroImageUrl: '',
                              contactEmail: 'muhtyasyugi@unikma.ac.id',
                              footerText: '',
                              isActive: true,
                            });
                          }}
                          className="h-8 px-3 rounded border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] cursor-pointer whitespace-nowrap"
                        >
                          + Buat Profil Website Baru
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Nama Website / Aplikasi CBT
                        </label>
                        <input
                          type="text"
                          required
                          value={websiteForm.siteName}
                          onChange={(e) =>
                            setWebsiteForm({ ...websiteForm, siteName: e.target.value })
                          }
                          placeholder="MazCodeID SMART CBT – ANTI CHEATING EXAM SYSTEM"
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Nama Institusi / Platform
                        </label>
                        <input
                          type="text"
                          required
                          value={websiteForm.universityName}
                          onChange={(e) =>
                            setWebsiteForm({
                              ...websiteForm,
                              universityName: e.target.value,
                            })
                          }
                          placeholder="MazCodeID"
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Singkatan / Teks Logo
                        </label>
                        <input
                          type="text"
                          required
                          value={websiteForm.logoText}
                          onChange={(e) =>
                            setWebsiteForm({ ...websiteForm, logoText: e.target.value })
                          }
                          placeholder="MCD"
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Tagline Utama Website
                        </label>
                        <input
                          type="text"
                          required
                          value={websiteForm.tagline}
                          onChange={(e) =>
                            setWebsiteForm({ ...websiteForm, tagline: e.target.value })
                          }
                          placeholder="Ujian Digital yang Aman, Transparan, dan Terpercaya."
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Email Kontak Administrator
                        </label>
                        <input
                          type="email"
                          value={websiteForm.contactEmail}
                          onChange={(e) =>
                            setWebsiteForm({
                              ...websiteForm,
                              contactEmail: e.target.value,
                            })
                          }
                          placeholder="muhtyasyugi@unikma.ac.id"
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#475569] mb-1">
                        Deskripsi Portal Website
                      </label>
                      <textarea
                        rows={2}
                        value={websiteForm.description}
                        onChange={(e) =>
                          setWebsiteForm({
                            ...websiteForm,
                            description: e.target.value,
                          })
                        }
                        className="w-full p-3 rounded border border-[#CBD5E1] text-xs"
                      />
                    </div>

                    {/* Photo Upload for Logo & Hero Banner */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F0]">
                      {/* Logo Image Upload */}
                      <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-[#F97316] shrink-0" />
                            Foto Logo Website / Universitas
                          </span>
                          {websiteForm.logoImageUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setWebsiteForm({ ...websiteForm, logoImageUrl: '' })
                              }
                              className="text-[11px] text-red-600 font-semibold cursor-pointer shrink-0"
                            >
                              Hapus Foto Logo
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                          <label className="h-9 px-3 rounded bg-white border border-[#CBD5E1] hover:border-[#F97316] text-xs font-semibold text-[#0F172A] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                            <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                            Pilih File Foto Logo
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleImageFileUpload(e, (dataUrl) =>
                                  setWebsiteForm({
                                    ...websiteForm,
                                    logoImageUrl: dataUrl,
                                  })
                                )
                              }
                            />
                          </label>
                          <input
                            type="text"
                            placeholder="Atau tempel URL Foto Logo..."
                            value={websiteForm.logoImageUrl}
                            onChange={(e) =>
                              setWebsiteForm({
                                ...websiteForm,
                                logoImageUrl: e.target.value,
                              })
                            }
                            className="flex-1 w-full h-9 px-3 rounded border border-[#CBD5E1] text-xs bg-white"
                          />
                        </div>
                        {websiteForm.logoImageUrl && (
                          <img
                            src={websiteForm.logoImageUrl}
                            alt="Logo Preview"
                            className="h-14 w-14 object-cover rounded-md border border-[#CBD5E1]"
                          />
                        )}
                      </div>

                      {/* Hero / Banner Image Upload */}
                      <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-[#F97316] shrink-0" />
                            Foto Banner / Hero Halaman Utama
                          </span>
                          {websiteForm.heroImageUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setWebsiteForm({ ...websiteForm, heroImageUrl: '' })
                              }
                              className="text-[11px] text-red-600 font-semibold cursor-pointer shrink-0"
                            >
                              Reset ke Default
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                          <label className="h-9 px-3 rounded bg-white border border-[#CBD5E1] hover:border-[#F97316] text-xs font-semibold text-[#0F172A] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                            <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                            Pilih File Foto Banner
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleImageFileUpload(e, (dataUrl) =>
                                  setWebsiteForm({
                                    ...websiteForm,
                                    heroImageUrl: dataUrl,
                                  })
                                )
                              }
                            />
                          </label>
                          <input
                            type="text"
                            placeholder="Atau tempel URL Foto Banner..."
                            value={websiteForm.heroImageUrl}
                            onChange={(e) =>
                              setWebsiteForm({
                                ...websiteForm,
                                heroImageUrl: e.target.value,
                              })
                            }
                            className="flex-1 w-full h-9 px-3 rounded border border-[#CBD5E1] text-xs bg-white"
                          />
                        </div>
                        {websiteForm.heroImageUrl && (
                          <img
                            src={websiteForm.heroImageUrl}
                            alt="Hero Preview"
                            className="h-20 w-full object-cover rounded-md border border-[#CBD5E1]"
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#475569] mb-1">
                          Teks Footer Hak Cipta
                        </label>
                        <input
                          type="text"
                          value={websiteForm.footerText}
                          onChange={(e) =>
                            setWebsiteForm({
                              ...websiteForm,
                              footerText: e.target.value,
                            })
                          }
                          placeholder="© 2026 MazCodeID"
                          className="w-full h-10 px-3 rounded border border-[#CBD5E1] text-xs"
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <button
                          type="submit"
                          className="h-10 px-6 w-full sm:w-auto bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold cursor-pointer"
                        >
                          {editingWebsiteId
                            ? 'Simpan Perubahan Identitas Website'
                            : '+ Simpan Profil Website Baru'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Saved Website Profiles List (Read, Activate/Edit, Delete) */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
                      <h3 className="text-sm font-bold text-[#0F172A]">
                        Daftar Profil Identitas Website ({state.websiteSettings.length})
                      </h3>
                    </div>
                    <div className="divide-y divide-[#E2E8F0]">
                      {state.websiteSettings.map((ws) => (
                        <div
                          key={ws.id}
                          className="p-4 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3.5">
                            {ws.logoImageUrl ? (
                              <img
                                src={ws.logoImageUrl}
                                alt={ws.logoText}
                                className="w-12 h-12 rounded-md object-cover border border-[#CBD5E1]"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-md bg-[#0F172A] text-white flex items-center justify-center font-black text-sm">
                                {ws.logoText}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-[#0F172A]">
                                  {ws.siteName}
                                </p>
                                {ws.isActive && (
                                  <span className="text-[11px] font-bold text-[#16A34A]">
                                    • AKTIF DIGUNAKAN
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#475569]">
                                {ws.universityName} — {ws.tagline}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingWebsiteId(ws.id);
                                setWebsiteForm({
                                  siteName: ws.siteName,
                                  universityName: ws.universityName,
                                  tagline: ws.tagline,
                                  description: ws.description,
                                  logoText: ws.logoText,
                                  logoImageUrl: ws.logoImageUrl || '',
                                  heroImageUrl: ws.heroImageUrl || '',
                                  contactEmail: ws.contactEmail || '',
                                  footerText: ws.footerText || '',
                                  isActive: ws.isActive,
                                });
                              }}
                              className="h-8 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold cursor-pointer"
                            >
                              Edit Profil
                            </button>
                            {state.websiteSettings.length > 1 && (
                              <button
                                onClick={async () => {
                                  await apiCall(
                                    `/api/cbt/website-settings/${ws.id}`,
                                    'DELETE'
                                  );
                                  showToast('Profil Website berhasil dihapus.');
                                }}
                                className="h-8 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold cursor-pointer"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Portable JSON Backup Export, Sync & Restore */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">
                        Cadangan & Sinkronisasi Data ke Database (.json)
                      </h3>
                      <p className="text-xs text-[#475569] mt-0.5">
                        Unduh salinan lengkap data sistem, sinkronkan data lokal browser ke database, atau impor file cadangan JSON dari perangkat lain.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const localData = getSavedLocalFallbackState();
                          if (!localData) {
                            showToast('Tidak ada data lokal browser yang tertunda untuk disinkronkan.');
                            return;
                          }
                          try {
                            const res = await apiCall('/api/cbt/sync-local', 'POST', localData);
                            clearSavedLocalFallbackState();
                            const s = res?.synced || {};
                            const total =
                              (s.faculties || 0) +
                              (s.studyPrograms || 0) +
                              (s.classes || 0) +
                              (s.courses || 0) +
                              (s.students || 0) +
                              (s.questions || 0) +
                              (s.exams || 0) +
                              (s.results || 0);
                            showToast(
                              total > 0
                                ? `Sinkronisasi berhasil: ${total} item baru dikirim ke database.`
                                : 'Semua data lokal sudah sama dengan database.'
                            );
                          } catch (err: any) {
                            showToast(err?.message || 'Gagal menyinkronkan data lokal.');
                          }
                        }}
                        className="h-9 px-3.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#F97316]" />
                        Sinkronkan Data Lokal
                      </button>

                      <label className="h-9 px-3.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        Impor & Sinkronkan (.json)
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            try {
                              const text = await file.text();
                              const parsed = JSON.parse(text);
                              const res = await apiCall('/api/cbt/sync-local', 'POST', parsed);
                              const s = res?.synced || {};
                              const total =
                                (s.faculties || 0) +
                                (s.studyPrograms || 0) +
                                (s.classes || 0) +
                                (s.courses || 0) +
                                (s.students || 0) +
                                (s.questions || 0) +
                                (s.exams || 0) +
                                (s.results || 0);
                              showToast(
                                total > 0
                                  ? `Berhasil menyinkronkan ${total} data dari file backup ke database.`
                                  : 'Seluruh data dalam file backup sudah ada di database.'
                              );
                            } catch (err: any) {
                              showToast(err?.message || 'File JSON tidak valid atau gagal disinkronkan.');
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(state, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `Backup_MazCodeID_CBT_${new Date().toISOString().slice(0, 10)}.json`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          showToast('Cadangan data JSON berhasil diunduh.');
                        }}
                        className="h-9 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Backup (.json)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================
                  TAB: PROFIL PENGGUNA
              ================================================================ */}
              {activeTab === 'profil' && (
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 max-w-xl space-y-4">
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Profil Sivitas Akademika {activeWebsite.logoText}
                  </h2>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-[#64748B] w-36 inline-block">
                        Nama Lengkap:
                      </span>
                      <span className="font-semibold text-[#0F172A]">
                        {currentUser.fullName}
                      </span>
                    </p>
                    <p>
                      <span className="text-[#64748B] w-36 inline-block">
                        Email Institusi:
                      </span>
                      <span className="font-mono text-xs">{currentUser.email}</span>
                    </p>
                    <p>
                      <span className="text-[#64748B] w-36 inline-block">
                        Peran Sistem:
                      </span>
                      <span className="uppercase font-mono text-xs font-bold text-[#F97316]">
                        {currentUser.roleName}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
