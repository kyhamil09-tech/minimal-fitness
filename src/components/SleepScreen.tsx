import React, { useMemo, useState } from 'react';
import {
  Moon,
  Heart,
  Clock,
  Plus,
  Calendar,
  Star,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Layers,
} from 'lucide-react';
import { parseDateKey, todayKey } from '../lib/dates';
import { InsightTone, buildSleepInsight, formatHM } from '../lib/sleepInsight';
import { ColorPalette } from '../types/theme';
import { SleepLogEntry } from '../types/health';
import { SleepDashboard } from './sleep/SleepDashboard';
import { SleepCalendar } from './sleep/SleepCalendar';
import { SleepSources } from './sleep/SleepSources';
import { swapVersion } from '../lib/sleepSources';
import { SmartAlarmCard } from './SmartAlarmCard';
import { SleepPlanCard } from './sleep/SleepPlanCard';
import { DEFAULT_SLEEP_PREFS, SleepPrefs } from '../lib/sleepPlan';
import { Hypnogram } from './ui/charts';
import { STAGE_COLORS } from '../lib/sleepMetrics';


interface SleepScreenProps {
  theme: ColorPalette;
  sleepLogs: SleepLogEntry[];
  setSleepLogs: React.Dispatch<React.SetStateAction<SleepLogEntry[]>>;
  /** Inside the Health hub the hub supplies the big title. */
  hideHeader?: boolean;
  /** The sleep goal and wind-down settings (kept in the app so the nudge is scheduled even when this screen is closed). */
  sleepPrefs?: SleepPrefs;
  onSleepPrefs?: (p: SleepPrefs) => void;
}

export const SleepScreen: React.FC<SleepScreenProps> = ({ theme, sleepLogs, setSleepLogs, hideHeader = false, sleepPrefs = DEFAULT_SLEEP_PREFS, onSleepPrefs }) => {
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  // The day a hand-logged night is for (the day you woke up). Today unless a day in the calendar was picked.
  const [manualDate, setManualDate] = useState<string>(todayKey());

  // Manual sleep modal state
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [qualityRating, setQualityRating] = useState(4);
  const [notes, setNotes] = useState('');

  // Local, offline comparison of the latest night with your recent average.
  const insight = useMemo(() => buildSleepInsight(sleepLogs, todayKey()), [sleepLogs]);
  const toneColor: Record<InsightTone, string> = { good: '#81C995', neutral: '#8AB4F8', warn: '#FDD663' };

  const getStageColor = (name: string) => {
    switch (name) {
      case 'Deep':
        return theme.sleepStages.deep;
      case 'REM':
        return theme.sleepStages.rem;
      case 'Light':
        return theme.sleepStages.light;
      case 'Awake':
      default:
        return theme.sleepStages.awake;
    }
  };

  const handleSaveManualSleep = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate duration between bedtime and wakeTime
    const [bH, bM] = bedtime.split(':').map(Number);
    const [wH, wM] = wakeTime.split(':').map(Number);

    let totalMins = wH * 60 + wM - (bH * 60 + bM);
    if (totalMins < 0) totalMins += 24 * 60; // Crosses midnight

    const deep = Math.round(totalMins * 0.22);
    const rem = Math.round(totalMins * 0.25);
    const light = Math.round(totalMins * 0.45);
    const awake = Math.max(10, totalMins - (deep + rem + light));

    const newLog: SleepLogEntry = {
      id: `sleep-manual-${Date.now()}`,
      dateIso: manualDate,
      displayDate: parseDateKey(manualDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      bedtime,
      wakeTime,
      durationMinutes: totalMins,
      qualityRating,
      notes: notes.trim() || undefined,
      isManualEntry: true,
      deepSleepMinutes: deep,
      remSleepMinutes: rem,
      lightSleepMinutes: light,
      awakeMinutes: awake,
      efficiencyScore: Math.round(85 + qualityRating * 2.5),
    };

    setSleepLogs((prev) => [newLog, ...prev]);
    setShowManualModal(false);
    setNotes('');
  };

  const latestLog: SleepLogEntry | undefined = sleepLogs[0];

  const pageHeader = (
    <div className="flex items-center justify-between">
      <div>
        {hideHeader ? <h2 className="gh-title">Your nights</h2> : <h1 className="text-xl font-bold text-white tracking-tight">Sleep</h1>}
        <p className="text-xs text-[#9AA3B2] mt-0.5">Measured by your watch through Health Connect, plus anything you log yourself.</p>
      </div>
      <button
        onClick={() => {
          setManualDate(todayKey());
          setShowManualModal(true);
        }}
        className="px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-neutral-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5 text-indigo-400" />
        <span>Log Sleep</span>
      </button>
    </div>
  );

  const manualModal = showManualModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div role="dialog" aria-modal="true" aria-label="Log sleep manually" className="w-full max-w-sm bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            Log Sleep Manually
          </h3>
          <button onClick={() => setShowManualModal(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSaveManualSleep} className="space-y-3 mt-3">
          <div className="space-y-1">
            <label htmlFor="manual-sleep-date" className="text-xs text-neutral-400">
              Night ending (the day you woke up)
            </label>
            <input
              id="manual-sleep-date"
              type="date"
              value={manualDate}
              max={todayKey()}
              onChange={(e) => e.target.value && setManualDate(e.target.value)}
              className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400 font-mono"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="manual-sleep-bed" className="text-xs text-neutral-400">Bedtime</label>
              <input
                id="manual-sleep-bed"
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400 font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="manual-sleep-wake" className="text-xs text-neutral-400">Wake Time</label>
              <input
                id="manual-sleep-wake"
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400 font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-400">Restoration Quality</label>
            <div className="flex items-center justify-between p-2 rounded-xl bg-black border border-[#1A1E26]">
              {[1, 2, 3, 4, 5].map((star) => (
                <button type="button" key={star} onClick={() => setQualityRating(star)} aria-label={`${star} of 5 stars`} aria-pressed={star === qualityRating} className="p-1.5 focus:outline-none">
                  <Star
                    className={`w-5 h-5 ${star <= qualityRating ? 'text-amber-400 fill-amber-400' : 'text-neutral-700'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-400">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400"
              placeholder="e.g. Dark room, no caffeine after 2 PM"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg mt-2"
          >
            Save Sleep
          </button>
        </form>
      </div>
    </div>
  );

  if (!latestLog) {
    return (
      <div className="space-y-4 pb-8 max-w-lg mx-auto">
        {pageHeader}
        <section
          className="rounded-3xl border p-8 text-center space-y-2"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <Moon className="w-8 h-8 mx-auto text-indigo-400" />
          <p className="text-sm font-semibold text-white">No sleep logged yet</p>
          <p className="text-xs text-[#9AA3B2]">Tap �Log Sleep� to record last night.</p>
        </section>
        {manualModal}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      {pageHeader}

      {/* Sleep insight: local comparison with your recent average, no network involved */}
      {insight && (
        <section
          className="rounded-[28px] border p-5"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
          aria-label="Sleep insight"
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: `${toneColor[insight.tone]}26`, color: toneColor[insight.tone] }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white leading-tight">Sleep insight</div>
              <div className="text-xs text-neutral-400">
                {insight.baselineNights >= 2 ? `Compared with your last ${insight.baselineNights} nights` : 'Building your baseline'}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-neutral-100">{insight.text}</p>
          {insight.durationDeltaMin !== undefined && (
            <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
              {[
                {
                  label: 'Duration',
                  value: Math.abs(insight.durationDeltaMin) < 15 ? 'Same' : `${insight.durationDeltaMin > 0 ? '+' : '-'}${formatHM(insight.durationDeltaMin)}`,
                  good: insight.durationDeltaMin >= -15,
                },
                {
                  label: 'Bedtime',
                  value: Math.abs(insight.bedtimeDeltaMin ?? 0) < 15 ? 'Same' : `${(insight.bedtimeDeltaMin ?? 0) > 0 ? 'Later' : 'Earlier'} ${formatHM(insight.bedtimeDeltaMin ?? 0)}`,
                  good: (insight.bedtimeDeltaMin ?? 0) <= 15,
                },
                {
                  label: 'Quality',
                  value: Math.abs(insight.qualityDelta ?? 0) < 0.5 ? 'Same' : `${(insight.qualityDelta ?? 0) > 0 ? '+' : ''}${insight.qualityDelta} ★`,
                  good: (insight.qualityDelta ?? 0) >= -0.5,
                },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl glass-inset py-2 px-1">
                  <div className="text-xs text-neutral-400">{c.label}</div>
                  <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: c.value === 'Same' ? '#fff' : c.good ? '#81C995' : '#FCAD70' }}>
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <SleepDashboard
        theme={theme}
        logs={sleepLogs}
        goalMin={sleepPrefs.goalMin}
        onPickVersion={(nightId, versionId) => setSleepLogs((prev) => prev.map((l) => (l.id === nightId ? swapVersion(l, versionId) : l)))}
      />
      {onSleepPrefs && <SleepPlanCard theme={theme} logs={sleepLogs} prefs={sleepPrefs} onChange={onSleepPrefs} />}
      <SleepSources theme={theme} logs={sleepLogs} setLogs={setSleepLogs} />
      <SmartAlarmCard theme={theme} />

      {/* SLEEP HISTORY: a month calendar, with the picked night's detail under it */}
      <SleepCalendar
        theme={theme}
        logs={sleepLogs}
        goalMin={sleepPrefs.goalMin}
        onLogNight={(date) => {
          setManualDate(date);
          setShowManualModal(true);
        }}
      />

      {manualModal}
    </div>
  );
};

