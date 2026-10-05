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
import { todayKey } from '../lib/dates';
import { InsightTone, buildSleepInsight, formatHM } from '../lib/sleepInsight';
import { ColorPalette } from '../types/theme';
import { SleepLogEntry } from '../types/health';
import { SleepDashboard } from './sleep/SleepDashboard';
import { SmartAlarmCard } from './SmartAlarmCard';
import { Hypnogram } from './ui/charts';
import { STAGE_COLORS } from '../lib/sleepMetrics';

/** Nights shown in the history before "Browse all". */
const RECENT_NIGHTS = 3;

interface SleepScreenProps {
  theme: ColorPalette;
  sleepLogs: SleepLogEntry[];
  setSleepLogs: React.Dispatch<React.SetStateAction<SleepLogEntry[]>>;
  /** Inside the Health hub the hub supplies the big title. */
  hideHeader?: boolean;
}

export const SleepScreen: React.FC<SleepScreenProps> = ({ theme, sleepLogs, setSleepLogs, hideHeader = false }) => {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  // The history starts as just the latest nights; "Browse all" groups the rest by month, each month folded.
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([todayKey().slice(0, 7)]));
  const monthGroups = useMemo(() => {
    const byMonth = new Map<string, SleepLogEntry[]>();
    for (const l of [...sleepLogs].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0))) {
      const key = l.dateIso.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), l]);
    }
    return [...byMonth.entries()].map(([key, logs]) => ({
      key,
      logs,
      label: new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      avgMin: logs.reduce((s, l) => s + l.durationMinutes, 0) / logs.length,
    }));
  }, [sleepLogs]);

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
      dateIso: todayKey(),
      displayDate: 'Logged Sleep Session',
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
        <p className="text-xs text-[#7E889B] mt-0.5">Measured by your watch through Health Connect, plus anything you log yourself.</p>
      </div>
      <button
        onClick={() => setShowManualModal(true)}
        className="px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-neutral-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5 text-indigo-400" />
        <span>Log Sleep</span>
      </button>
    </div>
  );

  const manualModal = showManualModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            Log Sleep Manually
          </h3>
          <button onClick={() => setShowManualModal(false)} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSaveManualSleep} className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-400">Bedtime</label>
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400 font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-400">Wake Time</label>
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400 font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-neutral-400">Restoration Quality</label>
            <div className="flex items-center justify-between p-2 rounded-xl bg-black border border-[#1A1E26]">
              {[1, 2, 3, 4, 5].map((star) => (
                <button type="button" key={star} onClick={() => setQualityRating(star)} className="p-1.5 focus:outline-none">
                  <Star
                    className={`w-5 h-5 ${star <= qualityRating ? 'text-amber-400 fill-amber-400' : 'text-neutral-700'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-neutral-400">Notes (Optional)</label>
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
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-500 text-white hover:bg-indigo-400 transition-colors shadow-lg mt-2"
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
          <p className="text-xs text-[#7E889B]">Tap �Log Sleep� to record last night.</p>
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
              <div className="text-[11px] text-neutral-400">
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
                  <div className="text-[10px] text-neutral-400">{c.label}</div>
                  <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: c.value === 'Same' ? '#fff' : c.good ? '#81C995' : '#FCAD70' }}>
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <SleepDashboard theme={theme} logs={sleepLogs} />
      <SmartAlarmCard theme={theme} />

      {/* HISTORICAL SLEEP EXPLORER (CHRONOLOGICAL LOGS) */}
      <section
        className="rounded-3xl border p-5 space-y-3"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">
              Sleep history
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#7E889B]">{sleepLogs.length} night{sleepLogs.length === 1 ? '' : 's'}</span>
        </div>

        {sleepLogs.length === 0 && <p className="text-xs text-neutral-400">No nights yet. They appear here after your watch syncs or when you log one.</p>}
        <div className="space-y-2.5 pt-1">
          {(() => {
          const renderLog = (log: SleepLogEntry) => {
            const isExpanded = expandedLogId === log.id;
            const lHours = Math.floor(log.durationMinutes / 60);
            const lMins = log.durationMinutes % 60;

            return (
              <div
                key={log.id}
                className="bg-black/50 border border-[#1A1E26] rounded-2xl p-3.5 hover:border-neutral-700 transition-colors"
              >
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{log.displayDate}</span>
                      {log.isManualEntry && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                          Manual
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-[#7E889B] mt-0.5 block">
                      {log.bedtime} - {log.wakeTime}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono text-white block">
                        {lHours}h {lMins}m
                      </span>
                      <div className="flex justify-end gap-0.5 mt-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-2.5 h-2.5 ${
                              i < log.qualityRating ? 'text-amber-400 fill-amber-400' : 'text-neutral-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Details Breakdown */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#1A1E26] space-y-2 animate-fadeIn text-xs">
                    <div className="grid grid-cols-4 gap-2 text-center font-mono">
                      <div className="bg-black/60 p-2 rounded-xl border border-neutral-900">
                        <span className="text-[9px] text-emerald-400 block font-bold">Deep</span>
                        <span className="text-white text-xs block mt-0.5">{log.deepSleepMinutes}m</span>
                      </div>
                      <div className="bg-black/60 p-2 rounded-xl border border-neutral-900">
                        <span className="text-[9px] text-indigo-400 block font-bold">REM</span>
                        <span className="text-white text-xs block mt-0.5">{log.remSleepMinutes}m</span>
                      </div>
                      <div className="bg-black/60 p-2 rounded-xl border border-neutral-900">
                        <span className="text-[9px] text-sky-400 block font-bold">Light</span>
                        <span className="text-white text-xs block mt-0.5">{log.lightSleepMinutes}m</span>
                      </div>
                      <div className="bg-black/60 p-2 rounded-xl border border-neutral-900">
                        <span className="text-[9px] text-neutral-400 block font-bold">Awake</span>
                        <span className="text-white text-xs block mt-0.5">{log.awakeMinutes}m</span>
                      </div>
                    </div>

                    {log.detail && log.detail.segments.length > 0 && (
                      <Hypnogram
                        segments={log.detail.segments}
                        startMs={log.detail.startMs}
                        endMs={log.detail.endMs}
                        colors={STAGE_COLORS}
                        ariaLabel={`Sleep stages for ${log.displayDate}`}
                      />
                    )}
                    {log.detail && (log.detail.hrAvg || log.detail.hrvMs || log.detail.respRate || log.detail.spo2Avg) && (
                      <p className="text-[11px] font-mono text-neutral-300">
                        {[
                          log.detail.hrAvg ? `HR ${log.detail.hrAvg} bpm` : '',
                          log.detail.hrvMs ? `HRV ${Math.round(log.detail.hrvMs)} ms` : '',
                          log.detail.respRate ? `${log.detail.respRate} br/min` : '',
                          log.detail.spo2Avg ? `SpO2 ${Math.round(log.detail.spo2Avg)}%` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                    {log.notes && (
                      <p className="text-[11px] text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-900">
                        "{log.notes}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          };
          if (!explorerOpen) return <>{sleepLogs.slice(0, RECENT_NIGHTS).map(renderLog)}</>;
          return (
            <>
              {monthGroups.map((g) => {
                const open = openMonths.has(g.key);
                return (
                  <div key={g.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMonths((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      aria-expanded={open}
                      className="w-full flex items-center justify-between rounded-2xl glass-inset px-3.5 py-3 text-left"
                    >
                      <span>
                        <span className="text-xs font-bold text-white block">{g.label}</span>
                        <span className="text-[11px] text-neutral-400">
                          {g.logs.length} night{g.logs.length === 1 ? '' : 's'} · average {Math.floor(g.avgMin / 60)}h {Math.round(g.avgMin % 60)}m
                        </span>
                      </span>
                      {open ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                    </button>
                    {open && <div className="space-y-2.5 mt-2.5">{g.logs.map(renderLog)}</div>}
                  </div>
                );
              })}
            </>
          );
          })()}
        </div>
        {sleepLogs.length > RECENT_NIGHTS && (
          <button
            type="button"
            onClick={() => {
              setExplorerOpen((v) => !v);
              setExpandedLogId(null);
            }}
            className="w-full py-2.5 rounded-xl glass-inset text-xs font-semibold text-white"
          >
            {explorerOpen ? 'Show only the latest nights' : `Browse all ${sleepLogs.length} nights by month`}
          </button>
        )}
      </section>

      {manualModal}
    </div>
  );
};

