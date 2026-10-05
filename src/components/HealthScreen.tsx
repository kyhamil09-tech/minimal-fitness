import React, { useMemo } from 'react';
import { HeartPulse, Settings as SettingsIcon } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import type { HcVitals } from '../hooks/useAutomaticData';
import { UserProfile } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { WatchHeartRateState } from '../hooks/useWatchHeartRate';
import { WatchLinkCard } from './WatchLinkCard';
import { ZONE_NAMES, getMaxHr, heartRateZone } from '../lib/calc';

interface HealthScreenProps {
  /** 0 when no sensor is connected. */
  liveBpm: number;
  hrSource: 'watch' | 'ble' | null;
  watch: WatchHeartRateState;
  theme: ColorPalette;
  profile: UserProfile;
  workouts: WorkoutSession[];
  /** Heart rate read from Health Connect (all-day watch readings). */
  vitals?: HcVitals | null;
  onOpenSettings: () => void;
}

export const HealthScreen: React.FC<HealthScreenProps> = ({
  liveBpm,
  hrSource,
  watch,
  theme,
  profile,
  workouts,
  vitals = null,
  onOpenSettings,
}) => {
  const live = hrSource !== null;
  const maxHr = getMaxHr(profile);
  const zone = live ? heartRateZone(liveBpm, maxHr) : null;

  // Only workouts recorded with a real sensor count toward these numbers.
  const measured = useMemo(
    () => workouts.filter((w) => w.hrFromSensor && w.avgHeartRate > 0),
    [workouts]
  );
  const avgOfMeasured = measured.length
    ? Math.round(measured.reduce((s, w) => s + w.avgHeartRate, 0) / measured.length)
    : null;

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Heart Rate</h1>
        <p className="text-xs text-[#7E889B] mt-0.5">Live readings from your Pixel Watch or a Bluetooth sensor.</p>
      </div>

      <section
        className="rounded-2xl border p-5"
        style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${live ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor: live ? theme.primary : '#525A6B',
                boxShadow: live ? `0 0 10px ${theme.primary}` : undefined,
              }}
            />
            <span
              className="text-xs font-semibold tracking-wider uppercase"
              style={{ color: live ? theme.primary : '#7E889B' }}
            >
              {live ? 'Live' : 'Not connected'}
            </span>
          </div>
          <span className="text-xs font-mono text-[#7E889B]">
            {hrSource === 'watch' ? watch.nodeName || 'Pixel Watch' : hrSource === 'ble' ? 'Bluetooth sensor' : ''}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}33` }}
          >
            <HeartPulse
              className={`w-8 h-8 ${live ? 'animate-pulse' : ''}`}
              style={{ color: live ? theme.primary : '#525A6B' }}
            />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-bold font-mono text-white tracking-tight tabular-nums">
                {live ? liveBpm : '—'}
              </span>
              <span className="text-sm font-mono text-[#7E889B]">bpm</span>
            </div>
            <p className="text-xs text-[#7E889B] font-medium">
              {zone ? `Zone ${zone} · ${ZONE_NAMES[zone]}` : 'Connect a sensor to see your heart rate'}
            </p>
          </div>
        </div>
      </section>

      {!live && (
        <section
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <WatchLinkCard watch={watch} theme={theme} />
          <button
            onClick={onOpenSettings}
            className="w-full px-4 py-3 border-t border-[#1A1E26] text-xs text-neutral-300 hover:text-white flex items-center justify-center gap-1.5"
          >
            <SettingsIcon className="w-3.5 h-3.5" /> More sensor options in Settings
          </button>
        </section>
      )}

      <section
        className="rounded-2xl border p-5 grid grid-cols-3 gap-3 text-center"
        style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
      >
        <div>
          <span className="text-[10px] font-mono text-[#7E889B] uppercase block">Max HR</span>
          <span className="text-lg font-bold font-mono text-white block mt-0.5">{maxHr}</span>
          <span className="text-[10px] text-neutral-500">
            {profile.maxHrOverride && profile.maxHrOverride > 100 ? 'your setting' : 'from your age'}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-mono text-[#7E889B] uppercase block">Resting HR</span>
          <span className="text-lg font-bold font-mono text-white block mt-0.5">{vitals?.restingBpm || profile.restingHr}</span>
          <span className="text-[10px] text-neutral-500">{vitals?.restingBpm ? 'Health Connect' : 'your setting'}</span>
        </div>
        <div>
          <span className="text-[10px] font-mono text-[#7E889B] uppercase block">Avg workout HR</span>
          <span className="text-lg font-bold font-mono text-white block mt-0.5">{avgOfMeasured ?? '—'}</span>
          <span className="text-[10px] text-neutral-500">
            {measured.length ? `${measured.length} sensor workout${measured.length === 1 ? '' : 's'}` : 'no sensor workouts'}
          </span>
        </div>
      </section>

      {vitals && (vitals.latestBpm > 0 || vitals.avgBpm24h > 0) && (
        <section
          className="rounded-2xl border p-5 grid grid-cols-2 gap-3 text-center"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div>
            <span className="text-[10px] font-mono text-[#7E889B] uppercase block">Latest reading</span>
            <span className="text-lg font-bold font-mono text-white block mt-0.5">{vitals.latestBpm || '—'}</span>
            <span className="text-[10px] text-neutral-500">
              {vitals.latestAt ? new Date(vitals.latestAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''} · Health Connect
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-[#7E889B] uppercase block">Average, last 24 h</span>
            <span className="text-lg font-bold font-mono text-white block mt-0.5">{vitals.avgBpm24h || '—'}</span>
            <span className="text-[10px] text-neutral-500">all-day watch readings</span>
          </div>
        </section>
      )}

      <p className="text-[10px] text-neutral-600 text-center px-4 leading-relaxed">
        Heart-rate readings are for fitness tracking, not medical advice. Max HR is estimated from your age unless you set
        your own in Profile.
      </p>
    </div>
  );
};
