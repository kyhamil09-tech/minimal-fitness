import { FastingHistory } from './FastingHistory';
import React, { useState, useEffect } from 'react';
import {
  Timer,
  Play,
  Square,
  Flame,
  Award,
  Clock,
  Sparkles,
  ChevronRight,
  Plus,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Zap,
  Info,
  Sliders,
  X,
} from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FastingSession, FastingStageInfo } from '../types/health';
import { addCheckIn, endFast, removeCheckIn, startFast } from '../lib/fasting';
import { ensureNotificationPermission } from '../lib/notifications';
import { FastingCheckInCard, FeelingMapCard } from './FastingFeelings';

interface FastingScreenProps {
  theme: ColorPalette;
  sessions: FastingSession[];
  setSessions: React.Dispatch<React.SetStateAction<FastingSession[]>>;
}

const FASTING_PROTOCOLS = [
  { name: '14:10 Gentle', hours: 14, desc: 'Introductory metabolic reset' },
  { name: '16:8 Standard', hours: 16, desc: 'Gold standard lipolysis & fat burn' },
  { name: '18:6 Warrior', hours: 18, desc: 'Accelerated ketosis & cell repair' },
  { name: '20:4 OMAD', hours: 20, desc: 'One meal a day · enhanced autophagy' },
  { name: '24:0 Full Day', hours: 24, desc: 'Deep autophagy & cellular renewal' },
];

export const FastingScreen: React.FC<FastingScreenProps & { hideHeader?: boolean }> = ({ theme, sessions, setSessions, hideHeader = false }) => {

  // The running fast lives in the saved sessions, so a widget or notification starting one is picked up here too.
  const activeSession = sessions.find((s) => !s.isCompleted);
  const isFastActive = !!activeSession;
  const [pickedHours, setTargetHours] = useState<number>(16);
  const [pickedProtocol, setProtocolName] = useState<string>('16:8 Standard');
  const targetHours = activeSession?.targetDurationHours ?? pickedHours;
  const protocolName = activeSession?.fastProtocolName ?? pickedProtocol;
  const startTimestamp = activeSession?.startTimestamp ?? Date.now();

  // Live timer tick
  const [now, setNow] = useState<number>(Date.now());
  const [feelingPick, setFeelingPick] = useState<string[]>([]);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showStageInfoModal, setShowStageInfoModal] = useState(false);

  // Manual log form state
  const [manualHours, setManualHours] = useState('16');
  const [manualProtocol, setManualProtocol] = useState('16:8 Standard');
  const [manualNotes, setManualNotes] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate elapsed time in seconds and hours
  const elapsedMillis = isFastActive ? Math.max(0, now - startTimestamp) : 0;
  const elapsedSeconds = Math.floor(elapsedMillis / 1000);
  const elapsedHoursDecimal = elapsedMillis / (3600 * 1000);

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  const targetSeconds = targetHours * 3600;
  const progressRatio = isFastActive ? Math.min(1.5, elapsedSeconds / targetSeconds) : 0;
  const progressPct = Math.round(progressRatio * 100);

  // Remaining or Overtime
  const isOvertime = elapsedSeconds >= targetSeconds;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const remHours = Math.floor(remainingSeconds / 3600);
  const remMinutes = Math.floor((remainingSeconds % 3600) / 60);

  // Determine current Fasting Stage
  const currentStage: FastingStageInfo = (() => {
    const h = elapsedHoursDecimal;
    if (h < 4) {
      return {
        name: 'Fed & Anabolic State',
        hourRange: '0 - 4h',
        description: 'Digestion active. Blood glucose and insulin elevated; nutrients stored as glycogen.',
        physiologicalMarker: 'Insulin Elevated · Glycogen Replenishment',
        isActive: true,
      };
    } else if (h < 12) {
      return {
        name: 'Early Fasting & Glycogen Depletion',
        hourRange: '4 - 12h',
        description: 'Insulin levels decline. Liver glycogen mobilized to maintain stable blood glucose.',
        physiologicalMarker: 'Insulin Normalizing · Hepatic Glycogen Use',
        isActive: true,
      };
    } else if (h < 16) {
      return {
        name: 'Fat Burning Phase',
        hourRange: '12 - 16h',
        description: 'Liver glycogen depleted. Lipolysis accelerates; body switches primarily to fatty acid oxidation.',
        physiologicalMarker: 'Lipolysis Surge · Early Ketone Production',
        isActive: true,
      };
    } else if (h < 20) {
      return {
        name: 'Ketosis Entry & Cell Repair',
        hourRange: '16 - 20h',
        description: 'Blood ketones elevate. Autophagy initiates cellular cleanup; ghrelin hunger hormone stabilizes.',
        physiologicalMarker: 'Ketosis Active · Autophagy Signaled',
        isActive: true,
      };
    } else {
      return {
        name: 'Deep Ketosis & Autophagy Induction',
        hourRange: '20h+',
        description: 'Heightened mitochondrial biogenesis, damaged protein degradation, and systemic insulin sensitization.',
        physiologicalMarker: 'Deep Ketosis · Peak Autophagy',
        isActive: true,
      };
    }
  })();

  const handleStartFast = () => {
    setFeelingPick([]);
    void ensureNotificationPermission();
    setSessions((prev) => startFast(prev, { targetHours, protocolName }));
  };

  const handleEndFast = () => {
    setFeelingPick([]);
    setSessions((prev) => endFast(prev));
  };

  const handleSaveCheckIn = () => {
    if (feelingPick.length === 0) return;
    setSessions((prev) => addCheckIn(prev, feelingPick));
    setFeelingPick([]);
  };

  const handleSelectProtocol = (name: string, hours: number) => {
    setProtocolName(name);
    setTargetHours(hours);
    setShowTargetModal(false);

    if (isFastActive) {
      setSessions((prev) =>
        prev.map((s) => {
          if (!s.isCompleted) {
            return {
              ...s,
              targetDurationHours: hours,
              fastProtocolName: name,
            };
          }
          return s;
        })
      );
    }
  };

  const handleSaveManualFast = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHours = parseFloat(manualHours) || 16;
    const nowMs = Date.now();
    const startMs = nowMs - parsedHours * 3600 * 1000;

    const loggedSession: FastingSession = {
      id: `fast-manual-${Date.now()}`,
      startTimeIso: new Date(startMs).toISOString(),
      startTimestamp: startMs,
      endTimeIso: new Date(nowMs).toISOString(),
      endTimestamp: nowMs,
      targetDurationHours: parsedHours,
      actualHours: parsedHours,
      isCompleted: true,
      fastProtocolName: manualProtocol,
      notes: manualNotes.trim() || undefined,
    };

    setSessions((prev) => [loggedSession, ...prev]);
    setShowManualModal(false);
    setManualNotes('');
  };

  // Ring circumference
  // The ring fills its 256px box so the timer inside never touches the stroke.
  const size = 256;
  const stroke = 14;
  const normalizedRadius = (size - stroke) / 2 - 6;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - Math.min(1, progressRatio) * circumference;

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          {hideHeader ? <h2 className="gh-title">Fasting timer</h2> : <h1 className="text-xl font-bold text-white tracking-tight">Intermittent Fasting</h1>}
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Metabolic switching, lipolysis, and on-device cellular cleanup tracking.
          </p>
        </div>
        <button
          onClick={() => setShowManualModal(true)}
          className="px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-neutral-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-[#00E676]" />
          <span>Log Fast</span>
        </button>
      </div>

      {/* ACTIVE FASTING TIMER CARD */}
      <section
        className="rounded-3xl border p-5 relative overflow-hidden text-center"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
        }}
      >
        {/* Protocol Selector Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
          <button
            onClick={() => setShowTargetModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/60 border border-[#1A1E26] hover:border-neutral-700 transition-colors group"
          >
            <Timer className="w-3.5 h-3.5" style={{ color: theme.primary }} />
            <span className="text-xs font-bold font-mono text-white group-hover:text-[#00E676] transition-colors">
              {protocolName}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          <button
            onClick={() => setShowStageInfoModal(true)}
            className="text-xs font-mono text-[#9AA3B2] hover:text-white flex items-center gap-1 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Stages</span>
          </button>
        </div>

        {/* Circular Progress Display */}
        <div className="py-6 flex flex-col items-center justify-center relative">
          <div className="relative w-64 h-64 flex items-center justify-center">
            {/* SVG Ring */}
            <svg height={size} width={size} className="rotate-[-90deg]">
              {/* Background Track */}
              <circle
                stroke="#161922"
                fill="transparent"
                strokeWidth={stroke}
                r={normalizedRadius}
                cx={size / 2}
                cy={size / 2}
              />
              {/* Foreground Animated Ring */}
              <circle
                stroke={theme.primary}
                fill="transparent"
                strokeWidth={stroke}
                strokeDasharray={`${circumference} ${circumference}`}
                style={{
                  strokeDashoffset,
                  transition: 'stroke-dashoffset 0.5s ease',
                  filter: `drop-shadow(0 0 12px ${theme.primaryGlow})`,
                }}
                strokeLinecap="round"
                r={normalizedRadius}
                cx={size / 2}
                cy={size / 2}
              />
            </svg>

            {/* Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#9AA3B2]">
                {isFastActive ? (isOvertime ? 'Goal Exceeded' : 'Fasting Time') : 'Timer Paused'}
              </span>

              {/* Big Elapsed Timer */}
              <div className="text-[2rem] leading-none font-bold font-mono tracking-tight text-white mt-1.5 tabular-nums">
                {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:
                <span className="text-xl text-[#9AA3B2]">{String(seconds).padStart(2, '0')}</span>
              </div>

              {/* Target / Progress text */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs font-mono font-semibold" style={{ color: theme.primary }}>
                  {progressPct}%
                </span>
                <span className="text-xs text-[#9AA3B2]">of {targetHours}h goal</span>
              </div>

              {isFastActive && (
                <span className="text-xs font-mono text-neutral-400 mt-1">
                  {isOvertime
                    ? `+${hours - targetHours}h ${minutes}m overtime`
                    : `${remHours}h ${remMinutes}m remaining`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current Fasting Stage Badge */}
        {isFastActive && (
          <div
            onClick={() => setShowStageInfoModal(true)}
            className="mb-5 p-3 rounded-2xl bg-black/60 border border-[#1A1E26] hover:border-neutral-700 cursor-pointer transition-colors text-left flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `${theme.primary}18`,
                  color: theme.primary,
                }}
              >
                <Flame className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{currentStage.name}</span>
                  <span
                    className="text-xs font-mono px-1.5 py-0.2 rounded font-semibold"
                    style={{
                      backgroundColor: `${theme.primary}25`,
                      color: theme.primary,
                    }}
                  >
                    {currentStage.hourRange}
                  </span>
                </div>
                <p className="text-xs text-[#9AA3B2] mt-0.5 line-clamp-1">{currentStage.description}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-3">
          {isFastActive ? (
            <button
              onClick={handleEndFast}
              className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center gap-2 transition-colors shadow-lg"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>End Fast & Log Result</span>
            </button>
          ) : (
            <button
              onClick={handleStartFast}
              className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm text-black flex items-center justify-center gap-2 transition-all shadow-lg hover:opacity-95"
              style={{
                backgroundColor: theme.primary,
                boxShadow: `0 0 16px ${theme.primaryGlow}`,
              }}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Fasting ({protocolName})</span>
            </button>
          )}

          <button
            onClick={() => setShowTargetModal(true)}
            className="p-3.5 rounded-2xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-white transition-colors"
            title="Edit Fasting Target"
          >
            <Sliders className="w-5 h-5 text-neutral-400" />
          </button>
        </div>
      </section>

      {/* HOW DO YOU FEEL: tap tags to map how you feel at each stage */}
      {activeSession && (
        <FastingCheckInCard
          theme={theme}
          session={activeSession}
          now={now}
          picked={feelingPick}
          onToggle={(id) => setFeelingPick((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))}
          onSave={handleSaveCheckIn}
          onRemove={(at) => setSessions((prev) => removeCheckIn(prev, activeSession.id, at))}
        />
      )}

      {/* FASTING STAGES ROADMAP */}
      <section
        className="rounded-3xl border p-5 space-y-3"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-neutral-200">
            Metabolic Progression (16:8)
          </span>
          <span className="text-xs font-mono text-[#00E676]">Auto-Calculated</span>
        </div>

        <div className="space-y-2 pt-1">
          {[
            { hours: '0 - 4h', title: 'Fed & Anabolic', status: elapsedHoursDecimal >= 4 ? 'Complete' : 'Active' },
            { hours: '4 - 12h', title: 'Glycogen Depletion', status: elapsedHoursDecimal >= 12 ? 'Complete' : elapsedHoursDecimal >= 4 ? 'Active' : 'Upcoming' },
            { hours: '12 - 16h', title: 'Fat Burning Phase (Ketones)', status: elapsedHoursDecimal >= 16 ? 'Complete' : elapsedHoursDecimal >= 12 ? 'Active' : 'Upcoming' },
            { hours: '16 - 20h', title: 'Ketosis & Autophagy Entry', status: elapsedHoursDecimal >= 20 ? 'Complete' : elapsedHoursDecimal >= 16 ? 'Active' : 'Upcoming' },
          ].map((stage, idx) => (
            <div
              key={stage.hours}
              className={`p-3 rounded-2xl border flex items-center justify-between transition-colors ${
                stage.status === 'Active'
                  ? 'bg-neutral-900 border-emerald-500/40'
                  : stage.status === 'Complete'
                  ? 'bg-black/50 border-[#1A1E26] opacity-80'
                  : 'bg-black/30 border-[#1A1E26]/50 opacity-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                    stage.status === 'Active'
                      ? 'bg-emerald-500 text-black'
                      : stage.status === 'Complete'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-neutral-900 text-neutral-400'
                  }`}
                >
                  {stage.status === 'Complete' ? '✓' : idx + 1}
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">{stage.title}</span>
                  <span className="text-xs font-mono text-[#9AA3B2]">{stage.hours}</span>
                </div>
              </div>

              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold ${
                  stage.status === 'Active'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : stage.status === 'Complete'
                    ? 'text-neutral-400'
                    : 'text-neutral-400'
                }`}
              >
                {stage.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <FeelingMapCard theme={theme} sessions={sessions} />

      <FastingHistory
        sessions={sessions}
        theme={theme}
        onDelete={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
      />

      {/* Target Selector Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div role="dialog" aria-modal="true" aria-label="Select fasting protocol" className="w-full max-w-sm bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Select Fasting Protocol
              </h3>
              <button onClick={() => setShowTargetModal(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mt-3">
              {FASTING_PROTOCOLS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleSelectProtocol(p.name, p.hours)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-colors ${
                    targetHours === p.hours
                      ? 'bg-neutral-900 border-emerald-500/60'
                      : 'bg-black/50 border-[#1A1E26] hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold text-white block">{p.name}</span>
                    <span className="text-xs text-[#9AA3B2]">{p.desc}</span>
                  </div>
                  {targetHours === p.hours && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Fast Logger Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div role="dialog" aria-modal="true" aria-label="Log a fast manually" className="w-full max-w-sm bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Manually Log Fast
              </h3>
              <button onClick={() => setShowManualModal(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualFast} className="space-y-3 mt-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-400">Hours Fasted</label>
                <input
                  type="number"
                  step="0.5"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 font-mono"
                  placeholder="16"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-400">Protocol</label>
                <select
                  value={manualProtocol}
                  onChange={(e) => setManualProtocol(e.target.value)}
                  className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                >
                  {FASTING_PROTOCOLS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-400">Notes (Optional)</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  placeholder="e.g. Broke fast with green smoothie"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-500 text-black hover:bg-emerald-400 transition-colors mt-2"
              >
                Save Fast to Local Room DB
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Fasting Stage Info Explainer Modal */}
      {showStageInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div role="dialog" aria-modal="true" aria-label="Fasting stages" className="w-full max-w-md bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Intermittent Fasting Biological Stages
              </h3>
              <button onClick={() => setShowStageInfoModal(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mt-3 text-xs text-[#CBD5E1]">
              <div className="p-3 rounded-2xl bg-black/50 border border-neutral-800">
                <span className="text-emerald-400 font-bold font-mono">0 - 4 Hours · Fed State</span>
                <p className="text-xs text-[#9AA3B2] mt-1">
                  Digestion of your last meal. Pancreatic insulin is elevated, facilitating glucose uptake into skeletal muscles and glycogen synthesis in the liver.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-black/50 border border-neutral-800">
                <span className="text-emerald-400 font-bold font-mono">4 - 12 Hours · Early Fasting</span>
                <p className="text-xs text-[#9AA3B2] mt-1">
                  Insulin drops back to baseline. The body begins glycogenolysis (breaking down stored glycogen into glucose) to sustain euglycemia.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-black/50 border border-neutral-800">
                <span className="text-emerald-400 font-bold font-mono">12 - 16 Hours · Fat Burning Phase</span>
                <p className="text-xs text-[#9AA3B2] mt-1">
                  Liver glycogen is mostly depleted. Adipose tissue accelerates lipolysis, releasing free fatty acids. The liver converts fats into acetoacetate and beta-hydroxybutyrate ketones.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-black/50 border border-neutral-800">
                <span className="text-emerald-400 font-bold font-mono">16 - 20 Hours · Ketosis & Autophagy Entry</span>
                <p className="text-xs text-[#9AA3B2] mt-1">
                  Autophagy begins degrading dysfunctional cellular organelles and misfolded proteins. Autonomic hormone balance resets hunger signaling.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-black/50 border border-neutral-800">
                <span className="text-emerald-400 font-bold font-mono">20+ Hours · Deep Autophagy</span>
                <p className="text-xs text-[#9AA3B2] mt-1">
                  Peak cellular recycling, stem cell activation signaling, and profound systemic insulin sensitivity restoration.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowStageInfoModal(false)}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-neutral-900 border border-neutral-700 text-white mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
