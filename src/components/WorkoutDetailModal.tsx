import React, { useMemo, useState } from 'react';
import {
  Activity,
  Clock,
  Download,
  Dumbbell,
  ExternalLink,
  Flame,
  Gauge,
  Navigation,
  HeartPulse,
  Mountain,
  Pencil,
  Flag,
  Route as RouteIcon,
  Share2,
  Trophy,
  Zap,
} from 'lucide-react';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { WorkoutSession } from '../types/health';
import { UserProfile } from '../types/tracking';
import { Modal } from './ui/Modal';
import { LineChart } from './ui/charts';
import { RouteMap } from './RouteMap';
import { speedGradient } from '../lib/mapStyles';
import { WorkoutEditModal } from './WorkoutEditModal';
import { downloadTextFile } from '../lib/backup';
import { ZONE_NAMES, currentRestingHr, getMaxHr, workoutVolumeKg, zoneStarts } from '../lib/calc';
import { formatTimestamp } from '../lib/dates';
import { KM_PER_MI, distanceUnit, formatDistance, formatWeight, kgToDisplay, kmToDisplay, weightUnit } from '../lib/units';
import { nextCalibration, readCalibration, workoutStepLength, writeCalibration } from '../lib/stride';
import {
  computeSplits,
  elevationSeries,
  formatDuration,
  formatPaceSec,
  bestEfforts,
  googleMapsRouteUrl,
  personalBests,
  speedSeries,
  summarizeWorkout,
  toGpx,
  zoneSeconds,
  edwardsLoad,
} from '../lib/workoutStats';
import { isConnected, readSent, uploadWorkout } from '../lib/strava';

import { ShareCardModal } from './ShareCardModal';
import { workoutEfficiency } from '../lib/aerobicTrend';
import { findRoutes, routeLabel, standingFor } from '../lib/routes';
import { SegmentsOnWorkout } from './SegmentTools';
import { SavedRoute, routeFromWorkout } from '../lib/savedRoutes';
import { driftLabel, gradeAdjustedPaceSec } from '../lib/efficiency';
import { isDescentSport, isSpeedSport } from '../lib/sports';

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 21st. */
const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

import { RecoveryNote } from './RecoveryNote';
import { POWER_ZONES } from '../lib/cyclingSensors';

interface WorkoutDetailModalProps {
  workout: WorkoutSession | null;
  /** All saved workouts, used to tell whether an effort is a personal best. */
  allWorkouts?: WorkoutSession[];
  /** Saves an edited copy of the workout. */
  onUpdate?: (w: WorkoutSession) => void;
  /** Saves this workout's route so a later workout can follow it. */
  onSaveAsRoute?: (route: SavedRoute) => void;
  profile: UserProfile;
  onClose: () => void;
  /** True right after finishing a workout (changes the heading). */
  justFinished?: boolean;
}

const ZONE_COLORS = ['#8AB4F8', '#81C995', '#FDD663', '#FCAD70', '#F28B82'];

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }> = ({
  icon,
  label,
  value,
  sub,
  color = '#fff',
}) => (
  <div className="rounded-2xl glass-inset p-3">
    <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
      <span style={{ color }}>{icon}</span>
      {label}
    </div>
    <div className="text-xl font-semibold tabular-nums text-white mt-1 leading-tight">{value}</div>
    {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mt-6 mb-2">
    <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>
      {children}
    </h3>
    {right}
  </div>
);

export const WorkoutDetailModal: React.FC<WorkoutDetailModalProps> = ({ workout, allWorkouts = [], onUpdate, onSaveAsRoute, profile, onClose, justFinished }) => {
  const units = profile.units;
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  // Every hook must run before the early return below: this modal is mounted with no workout and filled in later.
  const [stravaBusy, setStravaBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [shownKm, setShownKm] = useState('');

  const data = useMemo(() => {
    if (!workout) return null;
    const track = workout.track ?? [];
    const maxHr = getMaxHr(profile);
    return {
      summary: summarizeWorkout(workout, units),
      splits: computeSplits(track, units, workout.hrSeries),
      speed: speedSeries(track, units),
      elev: elevationSeries(track, units),
      zones: zoneSeconds(workout.hrSeries, maxHr),
      zoneScore: edwardsLoad(workout.hrSeries, maxHr),
      maxHr,
      hasRoute: track.length >= 2 || (workout.route?.length ?? 0) >= 2,
      mapsUrl: googleMapsRouteUrl(workout),
      efforts: bestEfforts(workout),
      previousBests: personalBests(allWorkouts.filter((x) => x.id !== workout.id)),
      efficiency: workoutEfficiency(workout),
      standing: standingFor(findRoutes([...allWorkouts.filter((x) => x.id !== workout.id), workout]), workout.id),
    };
  }, [workout, units, profile, allWorkouts]);

  if (!workout || !data) return null;
  const { summary, splits, speed, elev, zones, zoneScore, maxHr, hasRoute, mapsUrl, efforts, previousBests, efficiency, standing } = data;
  const isStrength = !!workout.exercises && workout.exercises.length > 0;
  const hasDistance = (workout.distanceKm ?? 0) > 0.02;
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const hr = workout.hrSeries ?? [];
  const startedAt = workout.startedAt ?? 0;
  const hrPoints = hr.map(([ts, bpm]) => ({ label: formatDuration((ts - startedAt) / 1000), value: bpm }));
  const bestPace = splits.filter((s) => !s.partial).reduce<number | undefined>((b, s) => (b === undefined || s.paceSec < b ? s.paceSec : b), undefined);
  const worstPace = splits.filter((s) => !s.partial).reduce<number | undefined>((b, s) => (b === undefined || s.paceSec > b ? s.paceSec : b), undefined);
  const speedUnit = `${distanceUnit(units)}/h`;

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 3500);
  };

  const openInMaps = async () => {
    if (!mapsUrl) return;
    try {
      if (Capacitor.isNativePlatform()) await AppLauncher.openUrl({ url: mapsUrl });
      else window.open(mapsUrl, '_blank', 'noopener');
    } catch {
      flash('Could not open Google Maps.');
    }
  };

  const exportGpx = async () => {
    try {
      const day = workout.startedAt ? new Date(workout.startedAt).toISOString().slice(0, 10) : 'workout';
      await downloadTextFile(`ky-fitness-${workout.type.toLowerCase()}-${day}.gpx`, toGpx(workout), 'application/gpx+xml');
      flash('GPX route exported.');
    } catch (err: any) {
      flash(err?.message || 'Export failed.');
    }
  };

  const share = async () => {
    const text =
      `${workout.type} - ${formatDuration(summary.totalSeconds)}` +
      (hasDistance ? ` - ${formatDistance(workout.distanceKm as number, units)}` : '') +
      (summary.avgPaceSec ? ` - ${formatPaceSec(summary.avgPaceSec)} /${distanceUnit(units)}` : '') +
      (summary.avgHr ? ` - ${summary.avgHr} bpm avg` : '') +
      ` - ${workout.caloriesBurned} kcal (Minimal Fitness)`;
    try {
      if (navigator.share) await navigator.share({ title: 'My workout', text });
      else {
        await navigator.clipboard.writeText(text);
        flash('Summary copied.');
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <>
    <Modal
      isOpen
      onClose={onClose}
      title={justFinished ? 'Workout complete' : `${workout.type} breakdown`}
      icon={<Activity className="w-4 h-4 text-emerald-400" />}
    >
      <div className="-mt-1 flex items-start justify-between gap-3">
       <div>
        <div className="text-xl font-semibold text-white">{workout.type}</div>
        <div className="text-xs text-neutral-400 mt-0.5">
          {workout.startedAt ? formatTimestamp(workout.startedAt) : workout.timestamp}
          {workout.gpsTracked ? ' · GPS' : ''}
          {workout.hrFromSensor ? ' · measured heart rate' : ''}
          {workout.isManualEntry ? ' · logged manually' : ''}
        </div>
       </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setCardOpen(true)} className="px-3 py-1.5 rounded-xl glass-inset text-xs font-semibold text-white flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-violet-300" /> Card
          </button>
          {onUpdate && (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-xl glass-inset text-xs font-semibold text-white flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* The headline: one big number, then the three that matter most */}
      {(() => {
        const dist = hasDistance ? kmToDisplay(workout.distanceKm as number, units, 2) : null;
        const [whole, dec = '00'] = dist !== null ? dist.toFixed(2).split('.') : ['', ''];
        const speedSport = isSpeedSport(workout.type);
        const cells: { label: string; value: string; unit?: string }[] = [];
        if (dist !== null) cells.push({ label: 'Time', value: formatDuration(summary.totalSeconds) });
        if (summary.avgPaceSec && !speedSport) cells.push({ label: 'Avg pace', value: formatPaceSec(summary.avgPaceSec), unit: `/${distanceUnit(units)}` });
        else if (summary.avgSpeed) cells.push({ label: 'Avg speed', value: summary.avgSpeed.toFixed(1), unit: speedUnit });
        else if (summary.avgHr) cells.push({ label: 'Avg HR', value: String(summary.avgHr), unit: 'bpm' });
        cells.push({ label: 'Calories', value: String(workout.caloriesBurned), unit: 'kcal' });
        // New records from this run: shown only right after it, with a burst of confetti.
        const records = justFinished && workout.type === 'Running' ? efforts.filter((e) => { const prev = previousBests.find((p) => p.target.id === e.target.id); return !prev || e.seconds < prev.seconds; }) : [];
        return (
          <section className="relative mt-4 overflow-hidden rounded-3xl border p-5 text-center" style={{ backgroundColor: 'var(--card)', borderColor: justFinished ? 'var(--accent)' : 'var(--hairline)' }} aria-label="Summary">
            {records.length > 0 && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 26 }, (_, i) => (
                  <span key={i} style={{ left: `${(i * 37) % 100}%`, background: ['#FF5500', '#FFB300', '#00E5FF', '#F4F4F6'][i % 4], animationDelay: `${(i % 9) * 0.1}s`, animationDuration: `${1.8 + (i % 5) * 0.3}s` }} />
                ))}
              </div>
            )}
            {justFinished && <div className="eyebrow-accent mb-1">{records.length > 0 ? 'New personal best' : 'Nice work'}</div>}
            {dist !== null ? (
              <div className="flex items-baseline justify-center leading-none">
                <span className="hero-num text-[6rem]">{whole}</span>
                <span className="ml-1 flex flex-col items-start">
                  <span className="hero-num text-[2.8rem]" style={{ color: 'var(--accent)' }}>.{dec}</span>
                  <span className="hero-unit mt-1 text-sm">{units === 'imperial' ? 'miles' : 'km'}</span>
                </span>
              </div>
            ) : (
              <div>
                <div className="hero-num text-[4.6rem]">{formatDuration(summary.totalSeconds)}</div>
                <div className="hero-unit mt-1 text-sm">time</div>
              </div>
            )}
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((c) => (
                <div key={c.label} className="rounded-2xl px-2 py-2.5" style={{ backgroundColor: 'var(--card-2)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">{c.label}</div>
                  <div className="hero-num mt-1 text-[1.6rem] leading-none">{c.value}</div>
                  {c.unit && <div className="mt-1 text-[10px] font-semibold text-[#A1A1AA]">{c.unit}</div>}
                </div>
              ))}
            </div>
            {records.length > 0 && (
              <ul className="relative mt-3 flex flex-wrap justify-center gap-2" aria-label="New records">
                {records.map((e) => (
                  <li key={e.target.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                    {e.target.label} · {formatDuration(e.seconds)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })()}

      {standing && (
        <div className="mt-3 rounded-2xl glass-inset px-3.5 py-2.5 text-xs flex items-center gap-2">
          <Trophy className="w-4 h-4 shrink-0" style={{ color: standing.isBest ? '#FCD34D' : '#9CA3AF' }} />
          <span className="text-neutral-200">
            {standing.isBest
              ? `Your fastest of ${standing.of} on this ${routeLabel(standing.group, units === 'imperial')}`
              : `${ordinal(standing.rank)} fastest of ${standing.of} on this ${routeLabel(standing.group, units === 'imperial')} (${formatDuration(standing.behindBestSec)} off your best)`}
          </span>
        </div>
      )}

      <SegmentsOnWorkout workout={workout} all={allWorkouts} units={units} theme={{ primary: 'var(--accent)' }} />

      {/* Route */}
      {hasRoute ? (
        <div className="mt-4 space-y-2.5">
          <RouteMap track={workout.track} route={workout.route} height={250} />
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
            <span>Slower</span>
            <span
              className="flex-1 mx-2 h-1.5 rounded-full"
              style={{ background: speedGradient() }}
            />
            <span>Faster</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={openInMaps}
              disabled={!mapsUrl}
              className="py-2.5 rounded-xl glass-inset text-xs font-semibold text-white flex flex-col items-center gap-1 disabled:opacity-40"
            >
              <ExternalLink className="w-4 h-4 text-sky-300" /> Google Maps
            </button>
            <button onClick={exportGpx} className="py-2.5 rounded-xl glass-inset text-xs font-semibold text-white flex flex-col items-center gap-1">
              <Download className="w-4 h-4 text-emerald-300" /> Strava / GPX
            </button>
            <button onClick={share} className="py-2.5 rounded-xl glass-inset text-xs font-semibold text-white flex flex-col items-center gap-1">
              <Share2 className="w-4 h-4 text-violet-300" /> Share text
            </button>
          </div>
          {onSaveAsRoute && (
            <button
              onClick={() => {
                const r = routeFromWorkout(workout);
                if (r) {
                  onSaveAsRoute(r);
                  flash('Saved. Choose it under Route on the Start screen to follow it.');
                } else flash('This workout has no route to save.');
              }}
              className="w-full py-2.5 rounded-xl glass-inset text-xs font-semibold text-white flex items-center justify-center gap-2"
            >
              <Navigation className="w-4 h-4 text-emerald-300" /> Save as a route to follow
            </button>
          )}
          <p className="text-xs text-neutral-400 px-1">
            Google Maps opens a walking or cycling route through your recorded points (up to 10 stops, so the line is
            approximate). Strava / GPX opens your phone's share sheet with the exact route as a GPX file: choose Strava, or any app that imports routes.
          </p>
        </div>
      ) : (
        !workout.isManualEntry &&
        !isStrength && (
          <div className="mt-4 rounded-2xl glass-inset p-4 text-xs text-neutral-300 flex items-start gap-2.5">
            <RouteIcon className="w-4 h-4 mt-0.5 text-neutral-400 shrink-0" />
            No route was recorded for this workout. That happens when location was turned off, there was no GPS signal
            (indoors), or the workout was very short.
          </div>
        )
      )}
      {note && (
        <p role="status" className="text-xs text-emerald-300 mt-2">
          {note}
        </p>
      )}

      {/* Headline stats */}
      {workout.distanceEstimated && onUpdate && (
        <div className="mt-4 rounded-2xl border p-3 space-y-2" style={{ backgroundColor: 'var(--card2)', borderColor: 'var(--hairline)' }}>
          <p className="text-xs leading-relaxed text-neutral-300">
            No GPS indoors, so this distance is worked out from {workout.stepCount ? `${workout.stepCount} steps` : 'the steps counted'} and your step length. Type what the treadmill showed to correct it; the next treadmill session will be closer.
          </p>
          <div className="flex items-center gap-2">
            <input
              aria-label={`Distance the treadmill showed in ${distanceUnit(units)}`}
              inputMode="decimal"
              placeholder={`Treadmill showed (${distanceUnit(units)})`}
              value={shownKm}
              onChange={(e) => setShownKm(e.target.value)}
              className="min-w-0 flex-1 px-3 py-2.5 text-sm text-white"
            />
            <button
              type="button"
              disabled={!(Number(shownKm.replace(',', '.')) > 0)}
              onClick={() => {
                const km = Number(shownKm.replace(',', '.')) * (units === 'imperial' ? KM_PER_MI : 1);
                writeCalibration(nextCalibration(readCalibration(), workout.distanceKm ?? 0, km));
                onUpdate({ ...workout, distanceKm: Math.round(km * 1000) / 1000, distanceEstimated: false });
                setShownKm('');
              }}
              className="min-h-11 rounded-full px-4 text-xs font-extrabold disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Correct
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Time" value={formatDuration(summary.totalSeconds)} sub={[summary.movingSeconds < summary.totalSeconds - 15 ? `${formatDuration(summary.movingSeconds)} moving` : '', workout.pausedSec ? `${formatDuration(workout.pausedSec)} paused` : ''].filter(Boolean).join(' · ') || undefined} color="#8AB4F8" />
        {hasDistance && <Stat icon={<RouteIcon className="w-3.5 h-3.5" />} label="Distance" value={formatDistance(workout.distanceKm as number, units)} sub={workout.distanceEstimated ? 'estimated from steps' : undefined} color="#81C995" />}
        {summary.avgPaceSec && !isSpeedSport(workout.type) && (
          <Stat icon={<Gauge className="w-3.5 h-3.5" />} label="Avg pace" value={`${formatPaceSec(summary.avgPaceSec)}`} sub={`per ${distanceUnit(units)}`} color="#FDD663" />
        )}
        {summary.avgSpeed && (isSpeedSport(workout.type) || !summary.avgPaceSec) && (
          <Stat icon={<Gauge className="w-3.5 h-3.5" />} label="Avg speed" value={summary.avgSpeed.toFixed(1)} sub={speedUnit} color="#FDD663" />
        )}
        {summary.bestSplit && !isSpeedSport(workout.type) && (
          <Stat icon={<Zap className="w-3.5 h-3.5" />} label="Best split" value={formatPaceSec(summary.bestSplit.paceSec)} sub={`${distanceUnit(units)} ${summary.bestSplit.index}`} color="#C58AF9" />
        )}
        <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Calories" value={`${workout.caloriesBurned}`} sub="kcal" color="#FCAD70" />
        {(workout.elevationGainM ?? 0) > 0 && (
          <Stat
            icon={<Mountain className="w-3.5 h-3.5" />}
            label="Climb"
            value={`+${units === 'imperial' ? Math.round((workout.elevationGainM as number) * 3.28084) : workout.elevationGainM}`}
            sub={`${units === 'imperial' ? 'ft' : 'm'}${workout.elevationLossM ? ` · -${units === 'imperial' ? Math.round(workout.elevationLossM * 3.28084) : workout.elevationLossM} down` : ''}${workout.elevationFrom ? (workout.elevationFrom === 'barometer' ? ' · barometer' : ' · GPS') : ''}`}
            color="#78D9EC"
          />
        )}
        {isDescentSport(workout.type) && (workout.elevationLossM ?? 0) > 0 && (
          <Stat
            icon={<Mountain className="w-3.5 h-3.5" />}
            label="Descent"
            value={`-${units === 'imperial' ? Math.round((workout.elevationLossM as number) * 3.28084) : workout.elevationLossM}`}
            sub={units === 'imperial' ? 'ft' : 'm'}
            color="#A8C7FA"
          />
        )}
        {summary.avgHr && <Stat icon={<HeartPulse className="w-3.5 h-3.5" />} label="Avg heart rate" value={`${summary.avgHr}`} sub={workout.hrFromSensor ? 'bpm · measured' : 'bpm · estimated'} color="#F28B82" />}
        {summary.maxHr && hr.length > 0 && <Stat icon={<HeartPulse className="w-3.5 h-3.5" />} label="Max heart rate" value={`${summary.maxHr}`} sub="bpm" color="#F28B82" />}
        {workout.cadenceAvg ? (
          <Stat
            icon={<Activity className="w-3.5 h-3.5" />}
            label={workout.cadenceKind === 'strokes' ? 'Stroke rate' : 'Cadence'}
            value={`${workout.cadenceAvg}`}
            sub={`${workout.cadenceKind === 'strokes' ? 'strokes/min' : workout.cadenceKind === 'rpm' ? 'rpm' : 'spm'} avg${workout.cadenceMax ? ` · ${workout.cadenceMax} max` : ''}`}
            color="#7DD3FC"
          />
        ) : null}
        {workout.cadenceKind === 'steps' && workoutStepLength(workout) ? (
          <Stat icon={<Activity className="w-3.5 h-3.5" />} label="Step length" value={units === 'imperial' ? `${Math.round((workoutStepLength(workout) as number) * 39.37)}` : `${workoutStepLength(workout)}`} sub={units === 'imperial' ? 'in per step' : 'm per step'} color="#7DD3FC" />
        ) : null}
        {workout.avgPowerW ? (
          <Stat
            icon={<Zap className="w-3.5 h-3.5" />}
            label="Power"
            value={`${workout.avgPowerW} W`}
            sub={`avg${workout.normPowerW ? ` · ${workout.normPowerW} W normalised` : ''}${workout.maxPowerW ? ` · ${workout.maxPowerW} max` : ''}`}
            color="#FDE047"
          />
        ) : null}
        {workout.powerZoneSec && workout.ftpW ? (
          <div className="col-span-2 rounded-2xl glass-inset px-4 py-3">
            <div className="text-xs text-neutral-400 mb-1.5">Power zones (threshold {workout.ftpW} W)</div>
            {POWER_ZONES.map((z, i) => {
              const total = workout.powerZoneSec!.reduce((a, b) => a + b, 0) || 1;
              const share = (workout.powerZoneSec![i] / total) * 100;
              return (
                <div key={z.name} className="flex items-center gap-2 text-xs text-neutral-300 mb-0.5">
                  <span className="w-20">{z.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-black/60 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: '#FDE047' }} /></div>
                  <span className="w-10 text-right font-mono">{Math.round(share)}%</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {efficiency && (
          <Stat
            icon={<Gauge className="w-3.5 h-3.5" />}
            label="Efficiency"
            value={efficiency.adjustedEf.toFixed(2)}
            sub={efficiency.drift ? `m per beat · drift ${efficiency.drift.decouplingPct > 0 ? '+' : ''}${efficiency.drift.decouplingPct.toFixed(1)}% (${driftLabel(efficiency.drift.decouplingPct).label.toLowerCase()})` : 'm per beat'}
            color="#81C995"
          />
        )}
        {workout.cardioLoadPoints ? <Stat icon={<Activity className="w-3.5 h-3.5" />} label="Cardio load" value={`${workout.cardioLoadPoints}`} sub="TRIMP" color="#81C995" /> : null}
        {workout.perceivedExertion ? <Stat icon={<Activity className="w-3.5 h-3.5" />} label="Effort (RPE)" value={`${workout.perceivedExertion}/10`} color="#C58AF9" /> : null}
      </div>

      <RecoveryNote workout={workout} all={allWorkouts} />

      {/* Strava */}
      {Capacitor.isNativePlatform() && (
        <div className="mt-3 rounded-2xl glass-inset px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">Strava</div>
            <div className="text-xs text-neutral-400">
              {readSent()[workout.id]
                ? 'On Strava'
                : isConnected()
                  ? 'Send this workout to your Strava account.'
                  : 'Connect Strava in Settings to send workouts.'}
            </div>
          </div>
          {isConnected() && !readSent()[workout.id] && (
            <button
              disabled={stravaBusy}
              onClick={async () => {
                setStravaBusy(true);
                const r = await uploadWorkout(workout);
                setStravaBusy(false);
                flash(r.message);
              }}
              className="px-4 py-2 rounded-full text-xs font-extrabold shrink-0 disabled:opacity-50"
              style={{ backgroundColor: '#FC4C02', color: '#fff' }}
            >
              {stravaBusy ? 'Sending…' : 'Send'}
            </button>
          )}
        </div>
      )}

      {/* Best efforts */}
      {efforts.length > 0 && (
        <>
          <SectionTitle>Best efforts</SectionTitle>
          <div className="rounded-2xl glass-inset overflow-hidden">
            {efforts.map((e) => {
              const prev = previousBests.find((p) => p.target.id === e.target.id);
              const isPr = workout.type === 'Running' && (!prev || e.seconds < prev.seconds);
              return (
                <div key={e.target.id} className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 last:border-none text-xs">
                  <span className="text-neutral-200">{e.target.label}</span>
                  <span className="flex items-center gap-2">
                    {isPr && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> {prev ? 'New PR' : 'First'}
                      </span>
                    )}
                    <span className="font-semibold tabular-nums text-white">{formatDuration(e.seconds)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Laps */}
      {workout.laps && workout.laps.length > 0 && (
        <>
          <SectionTitle>Laps</SectionTitle>
          <div className="rounded-2xl glass-inset overflow-hidden">
            {workout.laps.map((l) => (
              <div key={l.n} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-2 border-b border-white/5 last:border-none text-xs">
                <span className="flex items-center gap-1 text-neutral-400"><Flag className="w-3 h-3" />{l.n}</span>
                <span className="font-semibold tabular-nums text-white">{formatDuration(l.splitSec)}</span>
                <span className="tabular-nums text-neutral-300">{formatDistance(l.distanceKm, units)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Splits */}
      {splits.length > 0 && workout.type !== 'Strength' && (
        <>
          <SectionTitle>{units === 'imperial' ? 'Mile' : 'Kilometer'} splits</SectionTitle>
          <div className="rounded-2xl glass-inset overflow-hidden">
            <div className="grid grid-cols-[2.2rem_1fr_3.4rem_3rem_3rem] gap-2 px-3 py-2 text-xs font-medium text-neutral-400 border-b border-white/10">
              <span>{distanceUnit(units)}</span>
              <span>{workout.type === 'Cycling' ? 'Speed' : 'Pace'}</span>
              <span className="text-right">Elev</span>
              <span className="text-right">HR</span>
              <span className="text-right">Time</span>
            </div>
            {splits.map((s) => {
              const rel =
                bestPace !== undefined && worstPace !== undefined && worstPace > bestPace
                  ? 1 - (s.paceSec - bestPace) / (worstPace - bestPace)
                  : 1;
              const isBest = !s.partial && s.paceSec === bestPace && splits.filter((x) => !x.partial).length > 1;
              return (
                <div key={s.index} className="grid grid-cols-[2.2rem_1fr_3.4rem_3rem_3rem] gap-2 items-center px-3 py-2 border-b border-white/5 last:border-none text-xs">
                  <span className="text-neutral-300 tabular-nums">{s.partial ? (s.distanceKm / (units === 'imperial' ? 1.609344 : 1)).toFixed(2) : s.index}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-12 shrink-0">
                      <span className="block font-semibold tabular-nums text-white">
                        {workout.type === 'Cycling'
                          ? ((3600 / s.paceSec)).toFixed(1)
                          : formatPaceSec(s.paceSec)}
                      </span>
                      {workout.type !== 'Cycling' && s.elevDeltaM !== undefined && Math.abs(s.elevDeltaM) / (s.distanceKm * 1000) > 0.015 && (
                        <span className="block text-xs tabular-nums text-neutral-400" title="Grade-adjusted pace: the flat-ground pace that matches this effort">
                          GAP {formatPaceSec(gradeAdjustedPaceSec(s.paceSec, s.elevDeltaM, s.distanceKm))}
                        </span>
                      )}
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(12, 12 + rel * 88)}%`,
                          background: isBest ? 'linear-gradient(90deg,#81C995,#00E676)' : 'linear-gradient(90deg,#8AB4F8,#78D9EC)',
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-right tabular-nums text-neutral-300">
                    {s.elevDeltaM === undefined ? '—' : `${s.elevDeltaM >= 0 ? '+' : ''}${Math.round(units === 'imperial' ? s.elevDeltaM * 3.28084 : s.elevDeltaM)}`}
                  </span>
                  <span className="text-right tabular-nums text-neutral-300">{s.avgHr ?? '—'}</span>
                  <span className="text-right tabular-nums text-neutral-300">{formatDuration(s.seconds)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Heart rate */}
      {hr.length > 1 && (
        <>
          <SectionTitle>Heart rate</SectionTitle>
          <div className="rounded-2xl glass-inset p-3">
            <LineChart points={hrPoints} color="#F28B82" height={120} unit=" bpm" ariaLabel="Heart rate over the workout" />
          </div>
          <div className="rounded-2xl glass-inset p-3 mt-2.5 space-y-2.5">
            <div className="text-xs text-neutral-400">
              Time in zones · max {maxHr} bpm, resting {currentRestingHr()} bpm
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-white/10">
              {zones.map((z, i) => (
                <div key={i} style={{ width: `${zoneTotal > 0 ? (z / zoneTotal) * 100 : 0}%`, background: ZONE_COLORS[i] }} />
              ))}
            </div>
            {zones.map((z, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-neutral-200">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_COLORS[i] }} />
                  Zone {i + 1} · {ZONE_NAMES[i + 1]}
                  <span className="text-neutral-400">
                    {(() => {
                      const s = zoneStarts(maxHr);
                      return i === 0 ? `under ${s[0]}` : i === 4 ? `${s[3]}+` : `${s[i - 1]}–${s[i] - 1}`;
                    })()}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-300">
                  {formatDuration(z)} <span className="text-neutral-400">({zoneTotal > 0 ? Math.round((z / zoneTotal) * 100) : 0}%)</span>
                </span>
              </div>
            ))}
            {zoneScore > 0 && (
              <div className="flex items-center justify-between text-xs border-t border-white/10 pt-2">
                <span className="text-neutral-300">Zone score (Edwards)</span>
                <span className="tabular-nums text-neutral-300">{zoneScore}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Speed + elevation */}
      {speed.length > 3 && (
        <>
          <SectionTitle>Speed</SectionTitle>
          <div className="rounded-2xl glass-inset p-3">
            <LineChart points={speed.length > 120 ? speed.filter((_, i) => i % Math.ceil(speed.length / 120) === 0) : speed} color="#8AB4F8" height={120} unit={` ${speedUnit}`} ariaLabel="Speed over the workout" />
          </div>
        </>
      )}
      {elev.length > 3 && (
        <>
          <SectionTitle>Elevation</SectionTitle>
          <div className="rounded-2xl glass-inset p-3">
            <LineChart points={elev.length > 120 ? elev.filter((_, i) => i % Math.ceil(elev.length / 120) === 0) : elev} color="#78D9EC" height={110} unit={units === 'imperial' ? ' ft' : ' m'} ariaLabel="Elevation over the workout" />
          </div>
        </>
      )}

      {/* Strength */}
      {isStrength && (
        <>
          <SectionTitle
            right={
              <span className="text-xs text-neutral-400 tabular-nums">
                {formatWeight(workoutVolumeKg(workout), units, 0)} total volume
              </span>
            }
          >
            Exercises
          </SectionTitle>
          <div className="space-y-2.5">
            {(workout.exercises ?? []).map((ex) => (
              <div key={ex.exerciseId} className="rounded-2xl glass-inset p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Dumbbell className="w-4 h-4 text-violet-300" />
                  {ex.name}
                </div>
                <div className="mt-2 grid grid-cols-[1.5rem_1fr_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-neutral-400">Set</span>
                  <span className="text-neutral-400">Reps</span>
                  <span className="text-neutral-400 text-right">Weight</span>
                  {ex.sets
                    .filter((s) => s.done)
                    .map((s, i) => (
                      <React.Fragment key={i}>
                        <span className="text-neutral-400">{i + 1}</span>
                        <span className="text-white tabular-nums">{s.reps}</span>
                        <span className="text-white tabular-nums text-right">
                          {s.weightKg > 0 ? `${kgToDisplay(s.weightKg, units)} ${weightUnit(units)}` : 'Bodyweight'}
                        </span>
                      </React.Fragment>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {workout.planDayTitle && (
        <p className="text-xs text-neutral-400 mt-4 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-300" /> Plan day: {workout.planDayTitle}
        </p>
      )}
      {workout.notes && <p className="text-xs text-neutral-300 mt-4 glass-inset rounded-2xl p-3">“{workout.notes}”</p>}
    </Modal>
    {editing && onUpdate && (
      <WorkoutEditModal workout={workout} profile={profile} onSave={onUpdate} onClose={() => setEditing(false)} />
    )}
    {cardOpen && <ShareCardModal workout={workout} units={units} onClose={() => setCardOpen(false)} />}
    </>
  );
};
