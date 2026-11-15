import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, X } from 'lucide-react';
import {
  ExamTimerAlertState,
  formatRemainingTime,
  getExamTimerAlertState,
} from '../utils/cbtLogic';

interface ExamCountdownTimerProps {
  remainingSeconds: number;
  totalDurationMinutes: number;
}

function playSoftTimerBeep(isCritical: boolean) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const beepCount = isCritical ? 2 : 1;
    for (let i = 0; i < beepCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = isCritical ? 880 : 660;
      const start = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    }
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Audio playback may be blocked in headless or muted environments
  }
}

export const ExamCountdownTimer: React.FC<ExamCountdownTimerProps> = ({
  remainingSeconds,
  totalDurationMinutes,
}) => {
  const alertState = getExamTimerAlertState(
    remainingSeconds,
    totalDurationMinutes
  );

  const containerStyle =
    alertState.level === 'critical_1m' || alertState.level === 'expired'
      ? 'bg-red-950/90 border-red-500 ring-2 ring-red-500/40'
      : alertState.level === 'warning_5m'
        ? 'bg-amber-950/80 border-orange-400 ring-1 ring-orange-400/40'
        : 'bg-slate-800 border-slate-700';

  const iconColor =
    alertState.level === 'critical_1m' || alertState.level === 'expired'
      ? 'text-red-400 animate-pulse'
      : alertState.level === 'warning_5m'
        ? 'text-orange-400 animate-pulse'
        : 'text-orange-400';

  const barFillColor =
    alertState.level === 'critical_1m' || alertState.level === 'expired'
      ? 'bg-red-500'
      : alertState.level === 'warning_5m'
        ? 'bg-orange-400'
        : 'bg-emerald-400';

  const timeTextColor =
    alertState.level === 'critical_1m' || alertState.level === 'expired'
      ? 'text-red-200'
      : alertState.level === 'warning_5m'
        ? 'text-orange-200'
        : 'text-white';

  return (
    <div
      data-testid="exam-countdown-timer"
      data-alert-level={alertState.level}
      className={`px-3 py-1.5 rounded-lg border transition-colors min-w-[138px] ${containerStyle}`}
    >
      <div className="flex items-center gap-2">
        {alertState.level === 'critical_1m' || alertState.level === 'expired' ? (
          <AlertTriangle className={`w-4 h-4 shrink-0 ${iconColor}`} />
        ) : (
          <Clock className={`w-4 h-4 shrink-0 ${iconColor}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-300 leading-none">
              Sisa Waktu
            </span>
            {alertState.level === 'critical_1m' && (
              <span className="text-[9px] font-bold text-red-300 uppercase leading-none">
                &lt; 1m
              </span>
            )}
            {alertState.level === 'warning_5m' && (
              <span className="text-[9px] font-bold text-orange-300 uppercase leading-none">
                &le; 5m
              </span>
            )}
          </div>
          <div
            className={`text-sm sm:text-base font-bold font-mono tabular-nums leading-tight mt-0.5 ${timeTextColor}`}
          >
            {formatRemainingTime(remainingSeconds)}
          </div>
        </div>
      </div>
      <div
        className="w-full h-1 bg-slate-900/90 rounded-full overflow-hidden mt-1.5"
        aria-hidden="true"
      >
        <div
          className={`h-full transition-all duration-500 ${barFillColor}`}
          style={{ width: `${alertState.progressPercent}%` }}
        />
      </div>
    </div>
  );
};

interface ExamTimeAlertBannerProps {
  remainingSeconds: number;
  totalDurationMinutes: number;
  onQuickSubmit?: () => void;
}

export const ExamTimeAlertBanner: React.FC<ExamTimeAlertBannerProps> = ({
  remainingSeconds,
  totalDurationMinutes,
  onQuickSubmit,
}) => {
  const alertState: ExamTimerAlertState = getExamTimerAlertState(
    remainingSeconds,
    totalDurationMinutes
  );

  const [dismissedLevel, setDismissedLevel] = useState<
    'warning_5m' | 'critical_1m' | null
  >(null);
  const announced5MinRef = useRef(false);
  const announced1MinRef = useRef(false);

  useEffect(() => {
    if (alertState.level === 'warning_5m' && !announced5MinRef.current) {
      announced5MinRef.current = true;
      playSoftTimerBeep(false);
    }
    if (alertState.level === 'critical_1m' && !announced1MinRef.current) {
      announced1MinRef.current = true;
      setDismissedLevel((prev) => (prev === 'warning_5m' ? null : prev));
      playSoftTimerBeep(true);
    }
  }, [alertState.level]);

  if (alertState.level === 'normal' || !alertState.bannerTitle) {
    return null;
  }

  if (
    (alertState.level === 'warning_5m' && dismissedLevel === 'warning_5m') ||
    (alertState.level === 'critical_1m' && dismissedLevel === 'critical_1m')
  ) {
    return null;
  }

  const isCritical =
    alertState.level === 'critical_1m' || alertState.level === 'expired';

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="exam-time-alert-banner"
      data-alert-level={alertState.level}
      className={`px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b ${
        isCritical
          ? 'bg-red-700 text-white border-red-800'
          : 'bg-orange-500 text-white border-orange-600'
      }`}
    >
      <div className="flex items-start sm:items-center gap-2.5 text-xs">
        {isCritical ? (
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 animate-pulse" />
        ) : (
          <Clock className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
        )}
        <div>
          <span className="font-bold mr-2">{alertState.bannerTitle}:</span>
          <span>{alertState.bannerMessage}</span>
          <span className="ml-2 font-mono font-bold tabular-nums underline">
            ({formatRemainingTime(remainingSeconds)})
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isCritical && onQuickSubmit && alertState.level === 'critical_1m' && (
          <button
            type="button"
            onClick={onQuickSubmit}
            className="px-3 py-1 text-xs font-bold bg-white text-red-700 hover:bg-red-50 rounded cursor-pointer"
          >
            Kumpulkan Sekarang
          </button>
        )}
        {alertState.level !== 'expired' && (
          <button
            type="button"
            aria-label="Tutup peringatan waktu"
            onClick={() =>
              setDismissedLevel(
                alertState.level === 'critical_1m' ? 'critical_1m' : 'warning_5m'
              )
            }
            className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 cursor-pointer ${
              isCritical
                ? 'bg-red-800 hover:bg-red-900 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            Mengerti
          </button>
        )}
      </div>
    </div>
  );
};
