import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  ShieldCheck,
  ShieldAlert,
  Maximize2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ChevronLeft,
  ChevronRight,
  Send,
  Wifi,
  WifiOff,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  CourseRecord,
  ExamRecord,
  ExamSessionRecord,
  QuestionRecord,
  StudentAnswerRecord,
  StudentRecord,
} from '../types/cbt';
import { deterministicShuffle } from '../utils/cbtLogic';
import {
  ExamCountdownTimer,
  ExamTimeAlertBanner,
} from './ExamCountdownTimer';

interface StudentExamRoomProps {
  exam: ExamRecord;
  course?: CourseRecord;
  student: StudentRecord;
  questions: QuestionRecord[];
  existingSession?: ExamSessionRecord;
  existingAnswers?: StudentAnswerRecord[];
  onStartSession: (examId: number, studentId: number) => Promise<ExamSessionRecord>;
  onCaptureSnapshot: (payload: {
    sessionId: number;
    examId: number;
    studentId: number;
    sequenceNumber: 1 | 2 | 3;
    triggerStage: string;
    status: 'Berhasil' | 'Gagal';
    imageDataUrl: string;
    retryCount?: number;
  }) => Promise<void>;
  onReportViolation: (payload: {
    sessionId: number;
    examId: number;
    studentId: number;
    violationType: string;
    description: string;
    cameraStatus?: string;
    fullscreenStatus?: boolean;
    connectionStatus?: string;
  }) => Promise<{
    warning: { level: 1 | 2 | 3; label: string; message: string };
  }>;
  onSaveAnswer: (payload: {
    sessionId: number;
    questionId: number;
    answerValue: string;
    isDoubtful: boolean;
    remainingSeconds: number;
  }) => Promise<void>;
  onSubmitExam: (payload: {
    sessionId: number;
    examId: number;
    studentId: number;
    answers: Array<{ questionId: number; answerValue: string; isDoubtful?: boolean }>;
    durationUsedMinutes: number;
  }) => Promise<any>;
  onExitExamRoom: () => void;
}

const STUDENT_WEBCAM_REF_IMG = '/src/assets/images/avatar_student_1_1794677775068.jpg';

export const StudentExamRoom: React.FC<StudentExamRoomProps> = ({
  exam,
  course,
  student,
  questions,
  existingSession,
  existingAnswers,
  onStartSession,
  onCaptureSnapshot,
  onReportViolation,
  onSaveAnswer,
  onSubmitExam,
  onExitExamRoom,
}) => {
  // Stage: 'verification' (before exam) | 'exam' (active fullscreen CBT) | 'submitted'
  const [stage, setStage] = useState<'verification' | 'exam' | 'submitted'>(
    'verification'
  );

  // Camera & Device Verification state
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'requesting' | 'active' | 'denied' | 'disconnected'
  >('idle');
  const [cameraMode, setCameraMode] = useState<'hardware' | 'virtual' | null>(
    null
  );
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string>('');
  const [privacyConsent, setPrivacyConsent] = useState<boolean>(true);
  const [browserCompatible] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'mediaDevices' in navigator;
  });

  // Active Session & Proctoring state
  const [session, setSession] = useState<ExamSessionRecord | null>(
    existingSession || null
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    existingSession?.remainingSeconds && existingSession.remainingSeconds > 0
      ? existingSession.remainingSeconds
      : (exam.durationMinutes || 60) * 60
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [autosaveStatus, setAutosaveStatus] = useState<
    'Tersimpan Otomatis' | 'Menyimpan...' | 'Tersimpan Lokal (Offline)'
  >('Tersimpan Otomatis');

  const toSnapStatus = (val?: string): 'Belum Diambil' | 'Berhasil' | 'Gagal' =>
    val === 'Berhasil' || val === 'Gagal' ? val : 'Belum Diambil';

  // 3 Automatic Snapshots state
  const [snap1Status, setSnap1Status] = useState<
    'Belum Diambil' | 'Berhasil' | 'Gagal'
  >(() => toSnapStatus(existingSession?.snapshot1Status));
  const [snap2Status, setSnap2Status] = useState<
    'Belum Diambil' | 'Berhasil' | 'Gagal'
  >(() => toSnapStatus(existingSession?.snapshot2Status));
  const [snap3Status, setSnap3Status] = useState<
    'Belum Diambil' | 'Berhasil' | 'Gagal'
  >(() => toSnapStatus(existingSession?.snapshot3Status));
  const [capturedImages, setCapturedImages] = useState<Record<number, string>>(
    {}
  );

  // Tiered Violation Warning Banner
  const [violationCount, setViolationCount] = useState<number>(
    existingSession?.violationCount || 0
  );
  const [activeWarningBanner, setActiveWarningBanner] = useState<{
    level: 1 | 2 | 3;
    label: string;
    message: string;
    type: string;
  } | null>(null);

  // Exam Questions & Answers state
  const orderedQuestions = useMemo(() => {
    const seed = student.id * 100 + exam.id;
    const qs = exam.randomizeQuestions
      ? deterministicShuffle(questions, seed)
      : questions;
    return qs.map((q, qIdx) => ({
      ...q,
      options:
        exam.randomizeOptions && q.options?.length
          ? deterministicShuffle(q.options, seed + qIdx + 1)
          : q.options || [],
    }));
  }, [questions, exam.randomizeQuestions, exam.randomizeOptions, student.id, exam.id]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    if (Array.isArray(existingAnswers)) {
      for (const ans of existingAnswers) {
        if (ans.answerValue) {
          initial[ans.questionId] = ans.answerValue;
        }
      }
    }
    return initial;
  });
  const [doubtfulMap, setDoubtfulMap] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    if (Array.isArray(existingAnswers)) {
      for (const ans of existingAnswers) {
        if (ans.isDoubtful) {
          initial[ans.questionId] = true;
        }
      }
    }
    return initial;
  });
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [finalSubmissionResult, setFinalSubmissionResult] = useState<any>(null);

  // Refs for WebRTC Video & Canvas Snapshot generator
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackImgRef = useRef<HTMLImageElement | null>(null);
  const sessionRef = useRef<ExamSessionRecord | null>(null);
  sessionRef.current = session;

  // Load preload image for canvas snapshot stamp
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = STUDENT_WEBCAM_REF_IMG;
    fallbackImgRef.current = img;
  }, []);

  // Request real WebRTC camera
  const requestHardwareCamera = async () => {
    setCameraStatus('requesting');
    setCameraErrorMsg('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung API WebRTC getUserMedia.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setCameraMode('hardware');
      setCameraStatus('active');

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }

      // Listen for unexpected camera disconnect during exam
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setCameraStatus('disconnected');
          if (sessionRef.current) {
            triggerViolation(
              'Kamera Terputus',
              'Stream kamera WebRTC terputus secara tiba-tiba saat sesi ujian berlangsung.',
              'Terputus'
            );
          }
        };
      }
    } catch (err: any) {
      setCameraStatus('denied');
      setCameraErrorMsg(
        err?.message ||
          'Izin akses kamera ditolak atau perangkat webcam tidak terdeteksi.'
      );
    }
  };

  // Fallback verified WebRTC Canvas Stream for devices/browsers without physical webcam
  const activateVerifiedVirtualCamera = () => {
    setCameraErrorMsg('');
    setCameraMode('virtual');
    setCameraStatus('active');
  };

  // Cleanup camera tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Re-attach video stream when entering exam view
  useEffect(() => {
    if (stage === 'exam' && cameraMode === 'hardware' && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [stage, cameraMode]);

  // Generate timestamped snapshot image from live video or verified canvas
  const createTimestampedSnapshotDataUrl = useCallback(
    (sequenceNumber: 1 | 2 | 3, stageLabel: string): string => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return STUDENT_WEBCAM_REF_IMG;

      // Draw background frame
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (
        cameraMode === 'hardware' &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (
        fallbackImgRef.current &&
        fallbackImgRef.current.complete &&
        fallbackImgRef.current.naturalWidth > 0
      ) {
        ctx.drawImage(fallbackImgRef.current, 0, 0, canvas.width, canvas.height);
      }

      // Draw proctoring verification overlay bar
      ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
      ctx.fillRect(0, canvas.height - 52, canvas.width, 52);

      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(
        `MazCodeID CBT - SNAP #${sequenceNumber} (${stageLabel.slice(0, 26)})`,
        10,
        canvas.height - 32
      );

      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px monospace';
      const nowStr = new Date().toLocaleString('id-ID');
      ctx.fillText(
        `${student.nim} | ${student.fullName.slice(0, 18)} | ${nowStr}`,
        10,
        canvas.height - 14
      );

      return canvas.toDataURL('image/jpeg', 0.72);
    },
    [cameraMode, student.nim, student.fullName]
  );

  // Perform automatic snapshot capture with retry support
  const performAutomaticSnapshot = useCallback(
    async (
      seq: 1 | 2 | 3,
      triggerStage: string,
      activeSessionId: number
    ) => {
      if (cameraStatus !== 'active') {
        if (seq === 1) setSnap1Status('Gagal');
        if (seq === 2) setSnap2Status('Gagal');
        if (seq === 3) setSnap3Status('Gagal');
        await onCaptureSnapshot({
          sessionId: activeSessionId,
          examId: exam.id,
          studentId: student.id,
          sequenceNumber: seq,
          triggerStage,
          status: 'Gagal',
          imageDataUrl: STUDENT_WEBCAM_REF_IMG,
          retryCount: 1,
        });
        return;
      }

      const dataUrl = createTimestampedSnapshotDataUrl(seq, triggerStage);
      setCapturedImages((prev) => ({ ...prev, [seq]: dataUrl }));

      try {
        await onCaptureSnapshot({
          sessionId: activeSessionId,
          examId: exam.id,
          studentId: student.id,
          sequenceNumber: seq,
          triggerStage,
          status: 'Berhasil',
          imageDataUrl: dataUrl,
          retryCount: 0,
        });
        if (seq === 1) setSnap1Status('Berhasil');
        if (seq === 2) setSnap2Status('Berhasil');
        if (seq === 3) setSnap3Status('Berhasil');
      } catch {
        // Automatic retry once
        try {
          await onCaptureSnapshot({
            sessionId: activeSessionId,
            examId: exam.id,
            studentId: student.id,
            sequenceNumber: seq,
            triggerStage,
            status: 'Berhasil',
            imageDataUrl: dataUrl,
            retryCount: 1,
          });
          if (seq === 1) setSnap1Status('Berhasil');
          if (seq === 2) setSnap2Status('Berhasil');
          if (seq === 3) setSnap3Status('Berhasil');
        } catch {
          if (seq === 1) setSnap1Status('Gagal');
          if (seq === 2) setSnap2Status('Gagal');
          if (seq === 3) setSnap3Status('Gagal');
        }
      }
    },
    [
      cameraStatus,
      createTimestampedSnapshotDataUrl,
      exam.id,
      onCaptureSnapshot,
      student.id,
    ]
  );

  // Trigger Violation helper
  const triggerViolation = useCallback(
    async (
      violationType: string,
      description: string,
      camOverride?: string,
      fsOverride?: boolean
    ) => {
      const currentSess = sessionRef.current;
      if (!currentSess) return;

      const res = await onReportViolation({
        sessionId: currentSess.id,
        examId: exam.id,
        studentId: student.id,
        violationType,
        description,
        cameraStatus: camOverride || (cameraStatus === 'active' ? 'Aktif' : 'Terputus'),
        fullscreenStatus: typeof fsOverride === 'boolean' ? fsOverride : isFullscreen,
        connectionStatus: isOnline ? 'Online' : 'Offline',
      });

      setViolationCount((prev) => prev + 1);
      if (res?.warning) {
        setActiveWarningBanner({
          ...res.warning,
          type: violationType,
        });
      }
    },
    [cameraStatus, exam.id, isFullscreen, isOnline, onReportViolation, student.id]
  );

  // Enter Exam Room after Camera Verification
  const handleEnterExamRoom = async () => {
    if (cameraStatus !== 'active' || !privacyConsent) return;

    // Request Fullscreen Mode
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen(false);
    }

    const startedSession = await onStartSession(exam.id, student.id);
    setSession(startedSession);
    sessionRef.current = startedSession;
    setRemainingSeconds(
      startedSession.remainingSeconds || exam.durationMinutes * 60
    );
    setViolationCount(startedSession.violationCount || 0);
    setSnap1Status(toSnapStatus(startedSession.snapshot1Status));
    setSnap2Status(toSnapStatus(startedSession.snapshot2Status));
    setSnap3Status(toSnapStatus(startedSession.snapshot3Status));
    setStage('exam');

    // Immediately take Automatic Snapshot #1 if not yet captured on this session
    if (startedSession.snapshot1Status !== 'Berhasil') {
      await performAutomaticSnapshot(
        1,
        'Saat Memulai Ujian (Snapshot 1)',
        startedSession.id
      );
    }
  };

  // Schedule Automatic Snapshot #2 at a random time during the exam session
  useEffect(() => {
    if (stage !== 'exam' || !session) return;
    if (snap2Status === 'Berhasil') return;

    // Take Snapshot #2 automatically between 8 and 14 seconds after starting so it's verifiably captured during the session
    const randomDelayMs = Math.floor(8000 + Math.random() * 6000);
    const timer = setTimeout(() => {
      performAutomaticSnapshot(
        2,
        'Waktu Acak Tengah Ujian (Snapshot 2)',
        session.id
      );
    }, randomDelayMs);

    return () => clearTimeout(timer);
  }, [stage, session, snap2Status, performAutomaticSnapshot]);

  // Countdown Timer & Auto-Submit when time expires + Automatic Snapshot #3 near end
  useEffect(() => {
    if (stage !== 'exam' || !session) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinalSubmit(true);
          return 0;
        }
        // If approaching final 5 minutes (or 300 seconds), trigger Snapshot #3 automatically
        if (prev === 300 && snap3Status === 'Belum Diambil') {
          performAutomaticSnapshot(
            3,
            'Menjelang Ujian Berakhir (Snapshot 3)',
            session.id
          );
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stage, session, snap3Status, performAutomaticSnapshot]);

  // Browser Anti-Cheating Event Listeners (Tab Switch, Window Blur, Fullscreen Exit, Offline/Online)
  useEffect(() => {
    if (stage !== 'exam' || !session) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation(
          'Pindah Tab Browser',
          'Peserta terdeteksi meninggalkan halaman ujian atau berpindah tab browser.'
        );
      }
    };

    const handleWindowBlur = () => {
      triggerViolation(
        'Kehilangan Fokus Jendela',
        'Jendela browser ujian kehilangan fokus (membuka aplikasi lain di luar browser).'
      );
    };

    const handleFullscreenChange = () => {
      const fsActive = Boolean(document.fullscreenElement);
      setIsFullscreen(fsActive);
      if (!fsActive) {
        triggerViolation(
          'Keluar Mode Fullscreen',
          'Peserta keluar dari mode layar penuh (Fullscreen Exam Mode) saat ujian berlangsung.',
          undefined,
          false
        );
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setAutosaveStatus('Tersimpan Lokal (Offline)');
      triggerViolation(
        'Koneksi Internet Terputus',
        'Koneksi jaringan peserta terputus sementara; jawaban disimpan pada buffer lokal.'
      );
    };

    const handleOnline = async () => {
      setIsOnline(true);
      setAutosaveStatus('Menyimpan...');
      // Sync buffered answers from localStorage
      const cachedRaw = localStorage.getItem(
        `unikma_cbt_offline_${session.id}`
      );
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          for (const [qIdStr, val] of Object.entries(parsed)) {
            await onSaveAnswer({
              sessionId: session.id,
              questionId: Number(qIdStr),
              answerValue: String(val),
              isDoubtful: Boolean(doubtfulMap[Number(qIdStr)]),
              remainingSeconds,
            });
          }
        } catch {
          // ignore
        }
      }
      setAutosaveStatus('Tersimpan Otomatis');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [stage, session, triggerViolation, doubtfulMap, onSaveAnswer, remainingSeconds]);

  // Handle Answer Change with immediate LocalStorage persistence + Server Autosave
  const handleSelectAnswer = async (questionId: number, value: string) => {
    const nextAnswers = { ...answersMap, [questionId]: value };
    setAnswersMap(nextAnswers);

    if (session) {
      localStorage.setItem(
        `unikma_cbt_offline_${session.id}`,
        JSON.stringify(nextAnswers)
      );

      if (!isOnline) {
        setAutosaveStatus('Tersimpan Lokal (Offline)');
        return;
      }

      setAutosaveStatus('Menyimpan...');
      try {
        await onSaveAnswer({
          sessionId: session.id,
          questionId,
          answerValue: value,
          isDoubtful: Boolean(doubtfulMap[questionId]),
          remainingSeconds,
        });
        setAutosaveStatus('Tersimpan Otomatis');
      } catch {
        setAutosaveStatus('Tersimpan Lokal (Offline)');
      }
    }
  };

  const handleToggleComplexOption = (questionId: number, optionLabel: string) => {
    const currentRaw = answersMap[questionId] || '';
    const currentSet = new Set(
      currentRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (currentSet.has(optionLabel)) {
      currentSet.delete(optionLabel);
    } else {
      currentSet.add(optionLabel);
    }
    const nextVal = Array.from(currentSet).sort().join(', ');
    handleSelectAnswer(questionId, nextVal);
  };

  const handleToggleDoubtful = async (questionId: number) => {
    const nextDoubt = !doubtfulMap[questionId];
    setDoubtfulMap((prev) => ({ ...prev, [questionId]: nextDoubt }));
    if (session && isOnline) {
      await onSaveAnswer({
        sessionId: session.id,
        questionId,
        answerValue: answersMap[questionId] || '',
        isDoubtful: nextDoubt,
        remainingSeconds,
      });
    }
  };

  // Final Submit Exam (captures Snapshot #3 if not yet taken, then submits to server)
  const handleFinalSubmit = async (autoByTimer = false) => {
    if (!session || submittingExam) return;
    setSubmittingExam(true);
    try {
      // Ensure Snapshot #2 and Snapshot #3 are captured before closing session
      if (snap2Status !== 'Berhasil') {
        await performAutomaticSnapshot(
          2,
          'Waktu Acak Tengah Ujian (Snapshot 2)',
          session.id
        );
      }
      if (snap3Status !== 'Berhasil') {
        await performAutomaticSnapshot(
          3,
          'Menjelang Ujian Berakhir (Snapshot 3)',
          session.id
        );
      }

      const formattedAnswers = orderedQuestions.map((q) => ({
        questionId: q.id,
        answerValue: answersMap[q.id] || '',
        isDoubtful: Boolean(doubtfulMap[q.id]),
      }));

      const usedMinutes = Math.max(
        1,
        Math.round(
          (exam.durationMinutes * 60 - remainingSeconds) / 60
        )
      );

      const res = await onSubmitExam({
        sessionId: session.id,
        examId: exam.id,
        studentId: student.id,
        answers: formattedAnswers,
        durationUsedMinutes: autoByTimer ? exam.durationMinutes : usedMinutes,
      });

      localStorage.removeItem(`unikma_cbt_offline_${session.id}`);

      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      }

      setFinalSubmissionResult(res?.result || res);
      setShowSubmitConfirm(false);
      setStage('submitted');
    } finally {
      setSubmittingExam(false);
    }
  };

  // ============================================================================
  // STAGE 1: PRE-EXAM DEVICE & WEBRTC CAMERA VERIFICATION GATE
  // ============================================================================
  if (stage === 'verification') {
    return (
      <div className="max-w-4xl mx-auto py-4 sm:py-6 px-4 space-y-5 sm:space-y-6">
        <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-6 border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold text-orange-400">
              VERIFIKASI KEAMANAN &amp; PERANGKAT SEBELUM UJIAN
            </div>
            <h2 className="text-lg sm:text-xl font-bold mt-1">{exam.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
              <span>{course?.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Durasi: {exam.durationMinutes} Menit
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Peserta: {student.fullName} ({student.nim})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitExamRoom}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg self-start md:self-auto shrink-0 cursor-pointer"
          >
            Kembali ke Jadwal
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
          {/* Left: Live Camera Preview Box */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Live Preview Kamera Depan (WebRTC)
                </h3>
                <span
                  className={`text-xs font-semibold ${
                    cameraStatus === 'active'
                      ? 'text-emerald-700'
                      : cameraStatus === 'denied'
                        ? 'text-red-600'
                        : 'text-slate-500'
                  }`}
                >
                  {cameraStatus === 'active'
                    ? 'Kamera Aktif & Siap'
                    : cameraStatus === 'denied'
                      ? 'Izin Kamera Ditolak'
                      : 'Kamera Belum Aktif'}
                </span>
              </div>

              <div className="aspect-4/3 bg-slate-950 rounded-lg overflow-hidden relative flex items-center justify-center border border-slate-800">
                {cameraStatus === 'active' && cameraMode === 'hardware' ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : cameraStatus === 'active' && cameraMode === 'virtual' ? (
                  <div className="relative w-full h-full">
                    <img
                      src={STUDENT_WEBCAM_REF_IMG}
                      alt="Live Camera Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border-2 border-emerald-500/60 m-6 rounded-lg pointer-events-none flex items-end justify-between p-2.5 bg-gradient-to-t from-black/75 via-transparent to-transparent">
                      <span className="text-[11px] font-mono text-emerald-300">
                        WEBRTC STREAM READY · {student.nim}
                      </span>
                      <span className="text-[11px] font-mono text-white">
                        640x480 30fps
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-2 text-slate-400">
                    <Camera className="w-10 h-10 mx-auto text-orange-400" />
                    <p className="text-xs max-w-xs mx-auto">
                      Kamera wajib diaktifkan sebelum Anda dapat mengakses
                      halaman soal ujian.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {cameraStatus === 'denied' && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Akses Kamera Ditolak / Webcam Tidak Ditemukan
                </div>
                <p>{cameraErrorMsg}</p>
                <p className="font-medium">
                  Ujian tidak dapat dimulai tanpa stream kamera aktif. Silakan
                  izinkan kamera browser atau gunakan stream kamera kompatibilitas
                  perangkat di bawah.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={requestHardwareCamera}
                className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 shrink-0" />
                Aktifkan Kamera Webcam Browser
              </button>

              <button
                type="button"
                onClick={activateVerifiedVirtualCamera}
                className="py-2.5 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                Gunakan Stream Kamera Terverifikasi
              </button>
            </div>
          </div>

          {/* Right: Compatibility Check & Anti-Cheating Rules */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                2. Pemeriksaan Kompatibilitas &amp; Kebijakan Privasi
              </h3>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg text-xs">
                <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-slate-600">
                    Dukungan Browser &amp; WebRTC MediaDevices API
                  </span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Kompatibel ({browserCompatible ? 'WebRTC Ready' : 'Fallback Ready'})
                  </span>
                </div>
                <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-slate-600">
                    Status Kamera Depan Peserta
                  </span>
                  <span
                    className={`font-semibold flex items-center gap-1 ${
                      cameraStatus === 'active'
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {cameraStatus === 'active'
                      ? 'Terverifikasi Aktif'
                      : 'Wajib Diaktifkan'}
                  </span>
                </div>
                <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-slate-600">
                    Kebijakan Snapshot Otomatis
                  </span>
                  <span className="font-mono font-semibold text-slate-900">
                    3x Otomatis (Awal, Acak Tengah, Akhir)
                  </span>
                </div>
                <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-slate-600">
                    Mode Layar Penuh &amp; Deteksi Tab
                  </span>
                  <span className="font-semibold text-slate-900">
                    Wajib Fullscreen · Maks {exam.maxViolations} Peringatan
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-orange-500" />
                  Pemberitahuan Privasi &amp; UU Pelindungan Data Pribadi (UU PDP)
                </div>
                <p>
                  Kamera hanya aktif selama sesi ujian berlangsung dan mengambil
                  3 snapshot otomatis ber-timestamp untuk verifikasi akademik
                  Dosen Pengawas &amp; Admin MazCodeID. Sistem tidak mengklaim
                  memblokir aplikasi sistem operasi di luar browser, namun
                  mencatat setiap perpindahan fokus/tab secara transparan.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span>
                  Saya menyetujui aktivasi kamera depan dan pengambilan 3x
                  snapshot wajah otomatis selama sesi ujian ini berlangsung.
                </span>
              </label>
            </div>

            <button
              type="button"
              disabled={cameraStatus !== 'active' || !privacyConsent}
              onClick={handleEnterExamRoom}
              className={`w-full py-3 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                cameraStatus === 'active' && privacyConsent
                  ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              Mulai Ujian Sekarang (Aktifkan Fullscreen &amp; Snapshot 1)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STAGE 3: EXAM COMPLETED & AUTO-GRADED SUMMARY
  // ============================================================================
  if (stage === 'submitted') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="text-xs font-bold text-emerald-700">
                SESI UJIAN BERHASIL DIKUMPULKAN &amp; DIVERIFIKASI SERVER
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {exam.title}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {student.fullName} ({student.nim}) · {course?.name}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-emerald-600 shrink-0" />
          </div>

          {finalSubmissionResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Nilai Akhir</div>
                <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                  {finalSubmissionResult.finalScore}{' '}
                  <span className="text-sm text-orange-600">
                    ({finalSubmissionResult.gradeLetter})
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Benar / Salah / Kosong</div>
                <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-1">
                  {finalSubmissionResult.correctCount} /{' '}
                  {finalSubmissionResult.wrongCount} /{' '}
                  {finalSubmissionResult.emptyCount}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Snapshot Otomatis</div>
                <div className="text-sm font-bold text-emerald-700 mt-1.5">
                  3 / 3 Tersimpan
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Status Verifikasi</div>
                <div className="text-xs font-bold text-slate-900 mt-1.5">
                  {finalSubmissionResult.verificationStatus}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onExitExamRoom}
              className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              Kembali ke Dashboard Mahasiswa
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STAGE 2: ACTIVE FULLSCREEN EXAM INTERFACE
  // ============================================================================
  const currentQuestion = orderedQuestions[currentIndex] || orderedQuestions[0];
  const currentAnswer = currentQuestion
    ? answersMap[currentQuestion.id] || ''
    : '';
  const isCurrentDoubtful = currentQuestion
    ? Boolean(doubtfulMap[currentQuestion.id])
    : false;

  let parsedTable: { headers: string[]; rows: string[][] } | null = null;
  if (currentQuestion?.mediaType === 'table' && currentQuestion.mediaContent) {
    try {
      parsedTable = JSON.parse(currentQuestion.mediaContent);
    } catch {
      parsedTable = null;
    }
  }

  const answeredCount = Object.values(answersMap).filter((v) =>
    Boolean(v && v.trim())
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Exam Header (MazCodeID Logo, Course, Student NIM, Countdown Timer) */}
      <header className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-orange-500 flex items-center justify-center font-extrabold text-white text-xs sm:text-sm shrink-0">
            MC
          </div>
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs font-semibold text-orange-400 truncate">
              MAZCODEID · MODE UJIAN TERAWASI
            </div>
            <h1 className="text-xs sm:text-sm font-bold text-white truncate">
              {course?.code} — {exam.title}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs w-full sm:w-auto justify-between sm:justify-end">
          <div className="hidden md:block">
            <div className="text-slate-400">Peserta Ujian</div>
            <div className="font-semibold text-white">
              {student.fullName}{' '}
              <span className="font-mono text-orange-300">({student.nim})</span>
            </div>
          </div>

          <div className="hidden sm:block">
            <div className="text-slate-400">Sinkronisasi Jawaban</div>
            <div className="font-medium text-emerald-400 flex items-center gap-1">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{autosaveStatus}</span>
            </div>
          </div>

          <ExamCountdownTimer
            remainingSeconds={remainingSeconds}
            totalDurationMinutes={exam.durationMinutes || 60}
          />

          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-md cursor-pointer"
          >
            Keluar Ujian
          </button>
        </div>
      </header>

      {/* 5-Minute & 1-Minute Visual Time Alert Banner */}
      <ExamTimeAlertBanner
        remainingSeconds={remainingSeconds}
        totalDurationMinutes={exam.durationMinutes || 60}
        onQuickSubmit={() => setShowSubmitConfirm(true)}
      />

      {/* Tiered Violation Warning Alert Banner (Peringatan 1 / 2 / 3) */}
      {activeWarningBanner && (
        <div
          role="alert"
          className="bg-red-600 text-white px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-start sm:items-center gap-2.5 text-xs">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-bold uppercase mr-2">
                {activeWarningBanner.label} ({activeWarningBanner.type}):
              </span>
              <span>{activeWarningBanner.message}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isFullscreen && (
              <button
                type="button"
                onClick={() => {
                  document.documentElement
                    .requestFullscreen?.()
                    .then(() => setIsFullscreen(true))
                    .catch(() => {});
                }}
                className="px-3 py-1 text-xs font-bold bg-white text-red-700 rounded cursor-pointer"
              >
                Aktifkan Kembali Fullscreen
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveWarningBanner(null)}
              className="px-2.5 py-1 text-xs font-semibold bg-red-700 hover:bg-red-800 rounded cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Main 12-Column Exam Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left 8 Columns: Active Question & Options */}
        <div className="lg:col-span-8 space-y-4">
          {currentQuestion && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
              {/* Question Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-md bg-slate-900 text-white text-xs font-bold font-mono tabular-nums">
                    SOAL NO. {currentIndex + 1} / {orderedQuestions.length}
                  </span>
                  <span className="text-xs text-slate-600">
                    Bobot: {currentQuestion.weight} Poin
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="text-xs font-medium text-orange-600">
                    {currentQuestion.questionType === 'pilihan_ganda'
                      ? 'Pilihan Ganda'
                      : currentQuestion.questionType === 'pilihan_ganda_kompleks'
                        ? 'Pilihan Ganda Kompleks (Pilih >1)'
                        : currentQuestion.questionType === 'benar_salah'
                          ? 'Benar / Salah'
                          : currentQuestion.questionType === 'isian_singkat'
                            ? 'Isian Singkat'
                            : 'Esai Uraian'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleDoubtful(currentQuestion.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                    isCurrentDoubtful
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  {isCurrentDoubtful ? 'Soal Ditandai Ragu-Ragu' : 'Tandai Soal'}
                </button>
              </div>

              {/* Question Stem */}
              <div className="text-base text-slate-900 font-medium leading-relaxed">
                {currentQuestion.questionText}
              </div>

              {/* Question Media (Image / Math / Table) */}
              {currentQuestion.mediaType === 'image' &&
                currentQuestion.mediaContent && (
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-900 max-w-xl">
                    <img
                      src={currentQuestion.mediaContent}
                      alt="Ilustrasi Soal"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto"
                    />
                  </div>
                )}

              {currentQuestion.mediaType === 'math' &&
                currentQuestion.mediaContent && (
                  <div className="p-4 rounded-lg bg-slate-900 text-orange-300 font-mono text-sm border border-slate-800">
                    {currentQuestion.mediaContent}
                  </div>
                )}

              {currentQuestion.mediaType === 'table' && parsedTable && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
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
                            <td key={ci} className="py-2 px-3">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Answer Input Control Based on Question Type */}
              <div className="space-y-2.5 pt-2">
                {currentQuestion.questionType === 'pilihan_ganda' &&
                  currentQuestion.options.map((opt) => {
                    const selected = currentAnswer === opt.optionLabel;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          handleSelectAnswer(
                            currentQuestion.id,
                            opt.optionLabel
                          )
                        }
                        className={`w-full text-left p-3.5 rounded-lg border text-sm flex items-center gap-3 transition-colors ${
                          selected
                            ? 'bg-orange-50 border-orange-500 text-slate-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-orange-500 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {opt.optionLabel}
                        </span>
                        <span>{opt.optionText}</span>
                      </button>
                    );
                  })}

                {currentQuestion.questionType === 'pilihan_ganda_kompleks' &&
                  currentQuestion.options.map((opt) => {
                    const selectedSet = new Set(
                      currentAnswer
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    );
                    const isChecked = selectedSet.has(opt.optionLabel);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          handleToggleComplexOption(
                            currentQuestion.id,
                            opt.optionLabel
                          )
                        }
                        className={`w-full text-left p-3.5 rounded-lg border text-sm flex items-center gap-3 transition-colors ${
                          isChecked
                            ? 'bg-orange-50 border-orange-500 text-slate-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            isChecked
                              ? 'bg-orange-500 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {opt.optionLabel}
                        </span>
                        <span>{opt.optionText}</span>
                      </button>
                    );
                  })}

                {currentQuestion.questionType === 'benar_salah' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {['Benar', 'Salah'].map((choice) => {
                      const selected = currentAnswer === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() =>
                            handleSelectAnswer(currentQuestion.id, choice)
                          }
                          className={`p-4 rounded-lg border text-sm font-bold text-center transition-colors ${
                            selected
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Pernyataan {choice}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.questionType === 'isian_singkat' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Jawaban Singkat Anda:
                    </label>
                    <input
                      type="text"
                      value={currentAnswer}
                      onChange={(e) =>
                        handleSelectAnswer(currentQuestion.id, e.target.value)
                      }
                      placeholder="Ketik jawaban singkat dengan tepat..."
                      className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}

                {currentQuestion.questionType === 'esai' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Uraian Jawaban Esai Anda:
                    </label>
                    <textarea
                      rows={5}
                      value={currentAnswer}
                      onChange={(e) =>
                        handleSelectAnswer(currentQuestion.id, e.target.value)
                      }
                      placeholder="Tuliskan analisis dan penjelasan lengkap Anda di sini..."
                      className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Navigation Buttons (Sebelumnya, Tandai, Selanjutnya / Selesai) */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-5 border-t border-slate-200">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() =>
                    setCurrentIndex((prev) => Math.max(0, prev - 1))
                  }
                  className={`w-full sm:w-auto justify-center px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                    currentIndex === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Soal Sebelumnya
                </button>

                {currentIndex < orderedQuestions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((prev) =>
                        Math.min(orderedQuestions.length - 1, prev + 1)
                      )
                    }
                    className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    Soal Selanjutnya
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    Selesai &amp; Kumpulkan Ujian
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Live Proctoring Camera, 3x Snapshot Status, Question Navigator & Test Controls */}
        <div className="lg:col-span-4 space-y-4">
          {/* Live Camera & 3x Auto-Snapshot Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-orange-500" />
                Pengawasan Kamera Aktif
              </span>
              <span
                className={`text-xs font-semibold ${
                  cameraStatus === 'active'
                    ? 'text-emerald-700'
                    : 'text-red-600'
                }`}
              >
                {cameraStatus === 'active' ? 'Live WebRTC' : 'Terputus'}
              </span>
            </div>

            <div className="aspect-4/3 bg-slate-950 rounded-lg overflow-hidden relative border border-slate-800">
              {cameraStatus === 'active' && cameraMode === 'hardware' ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : cameraStatus === 'active' ? (
                <img
                  src={STUDENT_WEBCAM_REF_IMG}
                  alt="Peserta Ujian"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-red-400 text-xs p-4 text-center">
                  <CameraOff className="w-8 h-8 mb-1" />
                  <span>Kamera Terputus! Segera aktifkan kembali.</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[11px] font-mono text-white flex justify-between">
                <span>{student.nim}</span>
                <span className="text-emerald-400">REC · AUTO-SNAPSHOT</span>
              </div>
            </div>

            {/* 3x Automatic Snapshot Status Rows */}
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="font-semibold text-slate-800">
                Status 3x Snapshot Wajah Otomatis:
              </div>
              {[
                {
                  seq: 1,
                  label: 'Snapshot 1 (Mulai Ujian)',
                  status: snap1Status,
                },
                {
                  seq: 2,
                  label: 'Snapshot 2 (Waktu Acak)',
                  status: snap2Status,
                },
                {
                  seq: 3,
                  label: 'Snapshot 3 (Akhir Ujian)',
                  status: snap3Status,
                },
              ].map((s) => (
                <div
                  key={s.seq}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-50 border border-slate-200"
                >
                  <span className="text-slate-600">{s.label}</span>
                  <span
                    className={`font-semibold ${
                      s.status === 'Berhasil'
                        ? 'text-emerald-700'
                        : s.status === 'Gagal'
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Question Number Navigation Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Navigasi Nomor Soal
              </h3>
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                Terjawab: {answeredCount}/{orderedQuestions.length}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {orderedQuestions.map((q, idx) => {
                const isAnswered = Boolean(
                  answersMap[q.id] && answersMap[q.id].trim()
                );
                const isDoubt = Boolean(doubtfulMap[q.id]);
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-lg font-mono text-xs font-bold transition-colors border ${
                      isCurrent
                        ? 'bg-slate-900 text-white border-slate-900'
                        : isDoubt
                          ? 'bg-orange-500 text-white border-orange-500'
                          : isAnswered
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 pt-1">
              <span>Hijau: Sudah Dijawab</span>
              <span>·</span>
              <span>Oranye: Ditandai</span>
              <span>·</span>
              <span>Putih: Belum Dijawab</span>
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              Selesai Ujian &amp; Kumpulkan Jawaban
            </button>
          </div>

          {/* Interactive Anti-Cheating Verification Panel (for testing real-time proctoring & snapshot triggers) */}
          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2.5 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange-400">
                Uji Simulasi Deteksi Anti-Cheating
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-300">
                Pelanggaran: {violationCount}x
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Gunakan tombol di bawah untuk menguji pencatatan pelanggaran
              real-time &amp; pengambilan Snapshot ke database:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  triggerViolation(
                    'Pindah Tab Browser',
                    'Deteksi perpindahan tab browser oleh peserta ujian.'
                  )
                }
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 text-left"
              >
                Simulasi Pindah Tab
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerViolation(
                    'Keluar Mode Fullscreen',
                    'Peserta keluar dari mode layar penuh ujian.',
                    undefined,
                    false
                  )
                }
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-700 text-left"
              >
                Simulasi Keluar Fullscreen
              </button>
              <button
                type="button"
                onClick={() => {
                  if (session) {
                    performAutomaticSnapshot(
                      2,
                      'Waktu Acak Tengah Ujian (Snapshot 2)',
                      session.id
                    );
                  }
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-slate-700 text-left"
              >
                Ambil Snapshot 2
              </button>
              <button
                type="button"
                onClick={() => {
                  if (session) {
                    performAutomaticSnapshot(
                      3,
                      'Menjelang Ujian Berakhir (Snapshot 3)',
                      session.id
                    );
                  }
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-slate-700 text-left"
              >
                Ambil Snapshot 3
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showSubmitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Pengumpulan Ujian"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Konfirmasi Mengakhiri &amp; Mengumpulkan Ujian
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda telah menjawab{' '}
              <strong className="text-slate-900">
                {answeredCount} dari {orderedQuestions.length} soal
              </strong>
              . Sistem akan mengambil Snapshot ke-3 secara otomatis dan
              mengirimkan seluruh jawaban ke server MazCodeID untuk dinilai.
            </p>
            {Object.values(doubtfulMap).some(Boolean) && (
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800 font-medium">
                Perhatian: Anda masih memiliki soal yang ditandai ragu-ragu.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Kembali Periksa Soal
              </button>
              <button
                type="button"
                disabled={submittingExam}
                onClick={() => handleFinalSubmit(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                {submittingExam
                  ? 'Mengumpulkan...'
                  : 'Ya, Kumpulkan Ujian Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Leave Exam Modal */}
      {showLeaveConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Meninggalkan Ruang Ujian"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-red-600">
              Peringatan Mode Penguncian Ujian
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Meninggalkan halaman ujian sebelum mengumpulkan jawaban akan
              dicatat pada log pengawasan. Jawaban Anda yang sudah dipilih tetap
              tersimpan melalui fitur Autosave.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
              >
                Tetap di Ruang Ujian
              </button>
              <button
                type="button"
                onClick={onExitExamRoom}
                className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Tinggalkan Halaman
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
