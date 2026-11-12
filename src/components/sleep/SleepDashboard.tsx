import React, { useMemo, useState } from 'react';
import { Activity, BedDouble, ChevronLeft, ChevronRight, Droplets, HeartPulse, Moon, Thermometer, Wind } from 'lucide-react';
import { BarChart, EmptyState, Hypnogram, LineChart, Ring, Sparkbars, StackedBars } from '../ui/charts';
import { ColorPalette } from '../../types/theme';
import { SleepLogEntry } from '../../types/health';
import { SleepMetricDef, SleepMetricSheet } from './SleepMetricSheet';
import { shortMonthDay, shortWeekday } from '../../lib/dates';
import {
  STAGE_COLORS,
  TYPICAL_RANGE,
  average,
  hm,
  lastNights,
  sleepSchedule,
  sleepRegularityIndex,
  sleepScore,
  stageSummary,
} from '../../lib/sleepMetrics';
import { Segmented } from '../ui/Segmented';
import { nightSourceLabel, sourceName, versionName } from '../../lib/sleepSources';

/** Hours of sleep the trend graphs measure against. */

const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const hasStages = (l: SleepLogEntry) => !!l.detail && l.detail.segments.length > 0;

const stageNote = (l: SleepLogEntry): string => {
  if (l.detail?.stagesFrom === 'measured' && hasStages(l)) return 'Stages were measured by your watch and shared through Health Connect.';
  if (l.detail?.stagesFrom === 'estimated') return "Stages are estimated by this app from your watch's heart rate and movement. Treat them as a guide, not a measurement.";
  if (l.source === 'sleep-api') return 'Detected by your phone: only the times are real. The stage split is a rough estimate.';
  if (l.source === 'health-connect') return 'Your watch shared the times but no stages for this night. The split is a rough estimate.';
  return 'Stages are estimated from the bedtime and wake time you logged; they are not measured.';
};

const Card: React.FC<{ theme: ColorPalette; className?: string; children: React.ReactNode; label?: string }> = ({ theme, className = '', children, label }) => (
  <section
    aria-label={label}
    className={`rounded-3xl border p-5 ${className}`}
    style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
  >
    {children}
  </section>
);

const SectionTitle: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> = ({ icon, children, right }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
      {icon}
      <span>{children}</span>
    </div>
    {right}
  </div>
);

/** A stage's share of the night against the typical range, as a bar with the range shaded and a marker. */
const RangeBar: React.FC<{ pct: number; range: readonly [number, number]; color: string }> = ({ pct, range, color }) => {
  const scaleMax = 70;
  const at = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const inside = pct >= range[0] && pct <= range[1];
  return (
    <div className="relative h-2 rounded-full bg-white/[0.06]" aria-hidden="true">
      <div className="absolute inset-y-0 rounded-full" style={{ left: at(range[0]), width: `calc(${at(range[1])} - ${at(range[0])})`, background: `${color}40` }} />
      <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black" style={{ left: at(pct), background: inside ? color : '#fff' }} />
    </div>
  );
};

interface VitalDef {
  id: string;
  label: string;
  unit: string;
  icon: React.ReactNode;
  color: string;
  pick: (l: SleepLogEntry) => number | undefined;
  digits: number;
  sub: (l: SleepLogEntry, avg: number | undefined) => string;
  explain: string;
}

const toSheet = (v: VitalDef): SleepMetricDef => ({
  id: v.id,
  title: v.label,
  unit: v.unit,
  color: v.color,
  icon: v.icon,
  digits: v.digits,
  pick: v.pick,
  chart: 'line',
  explain: v.explain,
});

export const SleepDashboard: React.FC<{
  theme: ColorPalette;
  logs: SleepLogEntry[];
  /** Switch a night to another tracker's version of it. */
  onPickVersion?: (nightId: string, versionId: string) => void;
  /** The sleep goal in minutes (Sleep > Sleep goal and debt). */
  goalMin?: number;
}> = ({ theme, logs, onPickVersion, goalMin: SLEEP_GOAL_MIN = 480 }) => {
  const nights = useMemo(() => lastNights(logs, 365), [logs]);
  const [back, setBack] = useState(0); // 0 = newest night
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [openMetric, setOpenMetric] = useState<SleepMetricDef | null>(null);

  const idx = Math.max(0, nights.length - 1 - back);
  const night = nights[idx];
  const colors = STAGE_COLORS;

  const trend = useMemo(() => lastNights(logs, range), [logs, range]);
  const labelOf = (l: SleepLogEntry) => (range <= 7 ? shortWeekday(l.dateIso) : String(Number(l.dateIso.slice(8, 10))));

  if (!night) return null;

  const s = stageSummary(night);
  const score = sleepScore(night, SLEEP_GOAL_MIN);
  const measured = !!night.detail;
  const dateLabel = `${shortWeekday(night.dateIso)}, ${shortMonthDay(night.dateIso)}`;
  const start = night.detail ? night.detail.startMs : undefined;
  const bedLabel = start !== undefined ? new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : clock12(night.bedtime);
  const wakeLabel = night.detail ? new Date(night.detail.endMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : clock12(night.wakeTime);
  // Overnight readings arrive a few nights at a time after the stages, so a night can be waiting for them.
  const lookingUp = night.source === 'health-connect' && !!night.detail && !night.detail.vitalsAt;
  const scoreColor = score ? (score.score >= 80 ? '#81C995' : score.score >= 60 ? '#FDD663' : '#F28B82') : '#7E889B';

  const vitals: VitalDef[] = [
    {
      id: 'hr',
      label: 'Sleeping heart rate',
      unit: 'bpm',
      icon: <HeartPulse className="h-3.5 w-3.5" />,
      color: '#F28B82',
      pick: (l) => l.detail?.hrAvg,
      digits: 0,
      sub: (l) => (l.detail?.hrMin ? `Lowest ${l.detail.hrMin} · highest ${l.detail.hrMax ?? '-'}` : ''),
      explain: 'Your average heart rate while you slept. It usually dips lower in good, deep sleep; a number that creeps up can follow stress, alcohol, illness or a late meal.',
    },
    {
      id: 'hrv',
      label: 'Heart rate variability',
      unit: 'ms',
      icon: <Activity className="h-3.5 w-3.5" />,
      color: '#8AB4F8',
      pick: (l) => l.detail?.hrvMs,
      digits: 0,
      sub: (_l, avg) => (avg ? `Your average ${Math.round(avg)} ms` : ''),
      explain: 'The small beat-to-beat variation in your heart rate overnight. It is personal: watch your own trend rather than comparing with other people.',
    },
    {
      id: 'resp',
      label: 'Breathing rate',
      unit: 'br/min',
      icon: <Wind className="h-3.5 w-3.5" />,
      color: '#81C995',
      pick: (l) => l.detail?.respRate,
      digits: 1,
      sub: (_l, avg) => (avg ? `Your average ${avg.toFixed(1)}` : ''),
      explain: 'Breaths per minute while you slept. It is steady for most people; a jump of a few breaths can be an early sign of illness.',
    },
    {
      id: 'spo2',
      label: 'Blood oxygen',
      unit: '%',
      icon: <Droplets className="h-3.5 w-3.5" />,
      color: '#78D9EC',
      pick: (l) => l.detail?.spo2Avg,
      digits: 0,
      sub: (l) => (l.detail?.spo2Min ? `Lowest ${Math.round(l.detail.spo2Min)}%` : ''),
      explain: 'Blood oxygen your watch measured overnight, shared through Health Connect. Most healthy people sit between 95 and 100%. This is not a medical measurement.',
    },
    {
      id: 'skin',
      label: 'Skin temperature',
      unit: '°C',
      icon: <Thermometer className="h-3.5 w-3.5" />,
      color: '#FCAD70',
      pick: (l) => l.detail?.skinDelta,
      digits: 1,
      sub: () => 'Change from your baseline',
      explain: 'How far your skin temperature was from your own baseline overnight. Small swings are normal; a lasting rise can come with illness or a late workout.',
    },
  ];

  const summaryDefs: Record<'score' | 'awake' | 'wakeups', SleepMetricDef> = {
    score: {
      id: 'score',
      title: 'Sleep score',
      unit: '/100',
      color: '#81C995',
      icon: <Moon className="h-4 w-4" />,
      digits: 0,
      pick: (l) => sleepScore(l, SLEEP_GOAL_MIN)?.score,
      chart: 'line',
      explain: "This app's own estimate from duration, stages and efficiency. Google's Sleep Score is not shared with other apps.",
    },
    awake: {
      id: 'awake',
      title: 'Time awake',
      unit: 'min',
      color: '#F28B82',
      icon: <BedDouble className="h-4 w-4" />,
      digits: 0,
      pick: (l) => (l.detail ? stageSummary(l).awake : undefined),
      chart: 'bar',
      explain: 'Minutes you were awake between falling asleep and the final waking.',
    },
    wakeups: {
      id: 'wakeups',
      title: 'Wake-ups',
      unit: 'times',
      color: '#FDD663',
      icon: <Moon className="h-4 w-4" />,
      digits: 0,
      pick: (l) => l.detail?.awakenings,
      chart: 'bar',
      explain: 'Times you woke during the night, not counting falling asleep or the final waking.',
    },
  };
  const nightHr = night.detail?.hrSeries ?? [];

  const windowFor =(l: SleepLogEntry) => nights.slice(Math.max(0, nights.indexOf(l) - 6), nights.indexOf(l) + 1);

  const stageNights = trend.filter((l) => l.detail && l.detail.segments.length > 0 || l.detail?.stagesFrom === 'estimated');
  const efficiencyPoints = trend.filter((l) => l.detail).map((l) => ({ label: labelOf(l), value: stageSummary(l).efficiency }));
  const durationBars = trend.map((l, i) => ({ label: labelOf(l), value: Math.round((l.durationMinutes / 60) * 10) / 10, highlight: i === trend.length - 1 }));
  const avgDuration = average(trend.map((l) => l.durationMinutes));
  const best = trend.length ? Math.max(...trend.map((l) => l.durationMinutes)) : 0;
  const schedule = sleepSchedule(trend);
  const regularity = sleepRegularityIndex(logs);

  return (
    <div className="space-y-4">
      {/* Night picker + headline numbers */}
      <Card theme={theme} label="Sleep summary">
        <SectionTitle
          icon={<Moon className="h-4 w-4" style={{ color: theme.secondary }} />}
          right={
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous night"
                disabled={idx === 0}
                onClick={() => setBack((b) => Math.min(nights.length - 1, b + 1))}
                className="rounded-full p-1.5 text-neutral-300 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[88px] text-center text-xs font-semibold text-white">{back === 0 ? `Last night` : dateLabel}</span>
              <button
                aria-label="Next night"
                disabled={back === 0}
                onClick={() => setBack((b) => Math.max(0, b - 1))}
                className="rounded-full p-1.5 text-neutral-300 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          }
        >
          Sleep
        </SectionTitle>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="hero-num text-[3.1rem] leading-none text-white">{hm(night.durationMinutes)}</div>
            <p className="mt-1.5 text-xs text-[#9AA3B2]">Total sleep · {dateLabel}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-300">
              <BedDouble className="h-3.5 w-3.5 shrink-0 text-[#9AA3B2]" />
              <span>
                {bedLabel} to {wakeLabel}
                {measured && ` · in bed ${hm(s.inBed)}`}
              </span>
            </p>
            <p className="mt-1 text-xs text-[#9AA3B2]">{nightSourceLabel(night)}</p>
            {onPickVersion && night.alternates && night.alternates.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Other trackers' versions of this night">
                <span className="text-xs text-neutral-400">Also:</span>
                {night.alternates.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onPickVersion(night.id, a.id)}
                    className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:text-white"
                    aria-label={`Show ${versionName(a)} version of this night, ${hm(a.durationMinutes)}`}
                  >
                    {versionName(a)} · {hm(a.durationMinutes)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {measured ? (
            <Ring value={s.efficiency / 100} size={104} stroke={8} color={theme.secondary} ariaLabel={`Sleep efficiency ${s.efficiency} percent`}>
              <div>
                <div className="hero-num text-[1.7rem] leading-none text-white">{s.efficiency}%</div>
                <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-[#9AA3B2]">Efficiency</div>
              </div>
            </Ring>
          ) : (
            <div className="shrink-0 rounded-2xl glass-inset px-3 py-2 text-center text-sm font-bold text-neutral-200">
              Efficiency
              <div className="mt-0.5 text-sm text-neutral-300">Not measured</div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <button type="button" onClick={() => setOpenMetric(summaryDefs.score)} aria-label="Sleep score, open history" className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-xs text-neutral-400">Sleep score</div>
            <div className="mt-0.5 text-base font-bold tabular-nums" style={{ color: scoreColor }}>
              {score ? score.score : '—'}
            </div>
            <div className="text-xs text-neutral-400">{score ? `${score.label} · estimate` : 'Needs measured stages'}</div>
          </button>
          <button type="button" onClick={() => setOpenMetric(summaryDefs.awake)} aria-label="Awake time, open history" className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-xs text-neutral-400">Awake</div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-white">{measured ? hm(s.awake) : '—'}</div>
            <div className="text-xs text-neutral-400">{measured ? `${s.awakePct}% of time in bed` : ' '}</div>
          </button>
          <button type="button" onClick={() => setOpenMetric(summaryDefs.wakeups)} aria-label="Wake-ups, open history" className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-xs text-neutral-400">Wake-ups</div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-white">{night.detail ? night.detail.awakenings : '—'}</div>
            <div className="text-xs text-neutral-400">during the night</div>
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
          The sleep score is this app's own estimate. Google's Sleep Score is not shared with other apps.
        </p>
      </Card>

      {/* Stage timeline */}
      <Card theme={theme} label="Sleep stages timeline">
        <SectionTitle>Sleep stages</SectionTitle>
        {night.detail && night.detail.segments.length > 0 ? (
          <div className="mt-3">
            <Hypnogram
              segments={night.detail.segments}
              startMs={night.detail.startMs}
              endMs={night.detail.endMs}
              colors={colors}
              ariaLabel={`Sleep stages for ${dateLabel}`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {(
                [
                  ['Awake', colors.awake],
                  ['REM', colors.rem],
                  ['Light', colors.light],
                  ['Deep', colors.deep],
                ] as const
              ).map(([name, c]) => (
                <span key={name} className="flex items-center gap-1.5 text-xs text-neutral-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="No stage timeline for this night" hint="Wear your watch to bed and keep Health Connect syncing to see the night's stages." />
        )}

        {/* Stage minutes against typical ranges */}
        <div className="mt-4 space-y-4">
          {(
            [
              ['Deep', s.deep, s.deepPct, TYPICAL_RANGE.deep, colors.deep],
              ['REM', s.rem, s.remPct, TYPICAL_RANGE.rem, colors.rem],
              ['Light', s.light, s.lightPct, TYPICAL_RANGE.light, colors.light],
            ] as const
          ).map(([name, minutes, pct, rng, c]) => (
            <div key={name}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-semibold text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  {name} sleep
                </span>
                <span className="font-mono text-white">
                  {hm(minutes)} <span className="ml-2 text-[#9AA3B2]">{pct}%</span>
                </span>
              </div>
              <div className="mt-1.5">
                <RangeBar pct={pct} range={rng} color={c} />
              </div>
              <div className="mt-1 text-xs text-neutral-400">Typical {rng[0]}–{rng[1]}% of your sleep</div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs">
            <span className="flex items-center gap-2 font-semibold text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.awake }} />
              Awake
            </span>
            <span className="font-mono text-white">
              {hm(s.awake)} <span className="ml-2 text-[#9AA3B2]">{s.awakePct}%</span>
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">{stageNote(night)}</p>
      </Card>

      {/* Heart rate through the night */}
      <Card theme={theme} label="Heart rate through the night">
        <SectionTitle icon={<HeartPulse className="h-4 w-4" style={{ color: '#F28B82' }} />}>Heart rate through the night</SectionTitle>
        {nightHr.length >= 6 ? (
          <div className="mt-3">
            <LineChart
              points={nightHr.map(([t, bpm]) => ({ label: new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), value: bpm }))}
              color="#F28B82"
              unit=" bpm"
              ariaLabel={`Heart rate through the night of ${dateLabel}`}
            />
            <div className="mt-2 flex justify-between text-xs text-[#9AA3B2]">
              <span>{bedLabel}</span>
              <span>
                Lowest {Math.min(...nightHr.map((p) => p[1]))} · highest {Math.max(...nightHr.map((p) => p[1]))} bpm
              </span>
              <span>{wakeLabel}</span>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No heart-rate curve for this night"
            hint={lookingUp ? 'Looking up overnight readings…' : 'Wear your watch to bed and keep Health Connect syncing; older nights fill in when they are next refreshed.'}
          />
        )}
      </Card>

      {/* Overnight vitals */}
      <div>
        <div className="mb-2 px-1">
          <SectionTitle>Overnight vitals</SectionTitle>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {vitals.map((v) => {
            const value = v.pick(night);
            const series = windowFor(night).map((l) => v.pick(l));
            const avg = (() => {
              const all = nights.map(v.pick).filter((x): x is number => x !== undefined);
              return all.length >= 3 ? average(all) : undefined;
            })();
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setOpenMetric(toSheet(v))}
                aria-label={`${v.label}, open history`}
                className={`rounded-3xl border p-4 text-left ${v.id === 'skin' ? 'col-span-2' : ''}`}
                style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300" style={{ color: v.color }}>
                  {v.icon}
                  <span className="text-neutral-300">{v.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="hero-num text-[2rem] leading-none text-white">
                    {value === undefined ? '—' : v.id === 'skin' && value > 0 ? `+${value.toFixed(v.digits)}` : value.toFixed(v.digits)}
                  </span>
                  <span className="text-xs text-[#9AA3B2]">{value === undefined ? '' : v.unit}</span>
                </div>
                <div className="mt-1 min-h-[28px] text-xs leading-snug text-neutral-400">
                  {value === undefined ? (lookingUp ? 'Looking up overnight readings…' : 'Not recorded for this night') : v.sub(night, avg)}
                </div>
                <div className="mt-2">
                  <Sparkbars values={series} color={v.color} signed={v.id === 'skin'} ariaLabel={`${v.label}, last nights`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {openMetric && <SleepMetricSheet def={openMetric} logs={logs} onClose={() => setOpenMetric(null)} />}

      {/* Trends */}
      <Card theme={theme} label="Sleep trends">
        <SectionTitle
          right={
            <Segmented<string>
              ariaLabel="Sleep trend range"
              size="sm"
              semantics="group"
              fill={false}
              value={String(range)}
              onChange={(id) => setRange(Number(id) as typeof range)}
              options={['7', '14', '30'].map((n) => ({ id: n, label: `${n}d` }))}
            />
          }
        >
          Trends
        </SectionTitle>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold text-white">Total sleep</div>
            <div className="text-xs text-[#9AA3B2]">
              Avg {hm(avgDuration)} · best {hm(best)}
            </div>
          </div>
          <BarChart data={durationBars} color={theme.secondary} goal={SLEEP_GOAL_MIN / 60} format={(v) => `${v}h`} ariaLabel="Total sleep per night in hours" />
          <p className="mt-1 text-xs text-neutral-400">Dashed line is an {SLEEP_GOAL_MIN / 60}-hour goal.</p>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold text-white">Sleep stages per night</div>
            <div className="text-xs text-[#9AA3B2]">Hours asleep</div>
          </div>
          {stageNights.length > 0 ? (
            <>
              <StackedBars
                data={stageNights.map((l, i) => {
                  const st = stageSummary(l);
                  return { label: labelOf(l), parts: [st.deep, st.rem, st.light], highlight: i === stageNights.length - 1 };
                })}
                colors={[colors.deep, colors.rem, colors.light]}
                ariaLabel="Deep, REM and light sleep per night"
              />
              <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                <span style={{ color: colors.deep }}>● Deep</span>
                <span style={{ color: colors.rem }}>● REM</span>
                <span style={{ color: colors.light }}>● Light</span>
              </div>
            </>
          ) : (
            <EmptyState title="No measured nights yet" hint="Stages appear once your watch shares sleep through Health Connect." />
          )}
        </div>

        {stageNights.length > 0 && (
          <>
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-white">REM sleep</div>
                <div className="text-xs text-[#9AA3B2]">Avg {hm(average(stageNights.map((l) => l.remSleepMinutes)))}</div>
              </div>
              <BarChart
                data={stageNights.map((l, i) => ({ label: labelOf(l), value: l.remSleepMinutes, highlight: i === stageNights.length - 1 }))}
                color={colors.rem}
                format={(v) => hm(v)}
                ariaLabel="REM sleep per night in minutes"
              />
            </div>
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-white">Deep sleep</div>
                <div className="text-xs text-[#9AA3B2]">Avg {hm(average(stageNights.map((l) => l.deepSleepMinutes)))}</div>
              </div>
              <BarChart
                data={stageNights.map((l, i) => ({ label: labelOf(l), value: l.deepSleepMinutes, highlight: i === stageNights.length - 1 }))}
                color={colors.deep}
                format={(v) => hm(v)}
                ariaLabel="Deep sleep per night in minutes"
              />
            </div>
          </>
        )}

        {efficiencyPoints.length > 0 && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-semibold text-white">Sleep efficiency</div>
              <div className="text-xs text-[#9AA3B2]">Avg {Math.round(average(efficiencyPoints.map((p) => p.value)))}%</div>
            </div>
            <LineChart points={efficiencyPoints} color="#81C995" unit="%" yMin={70} yMax={100} ariaLabel="Sleep efficiency per night in percent" />
            <p className="mt-1 text-xs text-neutral-400">Time asleep as a share of time in bed. 85% or more is considered good.</p>
          </div>
        )}

        {schedule && (
          <div className="mt-5 rounded-2xl glass-inset p-3.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-white">Sleep schedule</div>
              <div
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: schedule.label === 'Irregular' ? '#F28B8226' : '#81C99526', color: schedule.label === 'Irregular' ? '#F28B82' : '#81C995' }}
              >
                {schedule.label}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-neutral-400">Usual bedtime</div>
                <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{clock12(schedule.avgBedtime)}</div>
                <div className="text-xs text-neutral-400">varies ±{schedule.bedSpreadMin} min</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Usual wake time</div>
                <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{clock12(schedule.avgWake)}</div>
                <div className="text-xs text-neutral-400">varies ±{schedule.wakeSpreadMin} min</div>
              </div>
            </div>
            {regularity && (
              <div className="mt-3 border-t border-white/10 pt-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Sleep Regularity Index</div>
                  <div className="text-xs text-neutral-400 leading-snug">How often you are in the same state, asleep or awake, at the same time on consecutive days.</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold tabular-nums text-white">{regularity.sri}</div>
                  <div className="text-xs text-neutral-400">{regularity.label}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
