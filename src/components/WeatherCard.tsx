import React from 'react';
import { LearnMore } from './ui/LearnMore';
import { CloudSun, RefreshCw } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { WeatherState } from '../hooks/useWeather';
import { cToF, describeCode, kmhToMph, runConditions } from '../lib/weather';

interface WeatherCardProps {
  state: WeatherState;
  theme: ColorPalette;
  units: UnitSystem;
  /** A one-line version for the Start screen. */
  compact?: boolean;
}

const TONE: Record<'good' | 'ok' | 'bad', string> = { good: '#4ade80', ok: '#ffd23f', bad: '#ff4d4d' };

export const WeatherCard: React.FC<WeatherCardProps> = ({ state, theme, units, compact = false }) => {
  const { enabled, setEnabled, weather, error, loading, refresh } = state;
  const imperial = units === 'imperial';

  if (!enabled || !weather) {
    if (compact) return null;
    return (
      <section className="rounded-2xl border px-4 py-2.5 flex items-center justify-between gap-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <CloudSun className="w-4 h-4" style={{ color: theme.primary }} />
            Running weather
            <LearnMore text="See if it is a good time to run. Uses your approximate location (rounded to about 1 km) and the free Open-Meteo service. Off until you turn it on." />
          </div>
          {(error || (enabled && loading)) && <p className="text-xs text-neutral-400">{error || 'Loading the weather…'}</p>}
        </div>
        {!enabled && (
          <button onClick={() => setEnabled(true)} className="px-4 py-2 rounded-full text-xs font-extrabold shrink-0" style={{ backgroundColor: theme.primary, color: '#000' }}>
            Turn on
          </button>
        )}
        {enabled && !loading && (
          <button onClick={() => void refresh()} className="px-4 py-2 rounded-full glass-chip text-xs font-bold text-neutral-200 shrink-0">
            Retry
          </button>
        )}
      </section>
    );
  }

  const cond = runConditions(weather);
  const temp = imperial ? `${cToF(weather.tempC)}°F` : `${Math.round(weather.tempC)}°C`;
  const feels = imperial ? `${cToF(weather.feelsC)}°` : `${Math.round(weather.feelsC)}°`;
  const wind = imperial ? `${kmhToMph(weather.windKmh)} mph` : `${Math.round(weather.windKmh)} km/h`;

  if (compact) {
    return (
      <div className="mt-4 rounded-[22px] border px-4 py-3 flex items-center justify-between gap-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">
            {temp} · {describeCode(weather.code)} · wind {wind}
          </div>
          <div className="text-xs mt-0.5 truncate" style={{ color: TONE[cond.tone] }}>
            {cond.label}: {cond.tips[0]}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between">
        <span className="stat-label flex items-center gap-1.5">
          <CloudSun className="w-3.5 h-3.5" /> Running weather
        </span>
        <button onClick={() => void refresh()} aria-label="Refresh weather" className="text-neutral-400 hover:text-white">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex items-end gap-3 mt-2">
        <span className="hero-num text-[3.6rem]">{temp.replace(/[°CF]+$/, '')}</span>
        <span className="hero-unit text-xl pb-1.5">{imperial ? '°F' : '°C'}</span>
        <span className="text-sm text-neutral-400 font-semibold pb-1.5">{describeCode(weather.code)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div>
          <div className="gh-value !text-[1.5rem]">{feels}</div>
          <div className="stat-label mt-1">Feels like</div>
        </div>
        <div>
          <div className="gh-value !text-[1.5rem]">{wind}</div>
          <div className="stat-label mt-1">Wind</div>
        </div>
        <div>
          <div className="gh-value !text-[1.5rem]">{weather.rainChance}%</div>
          <div className="stat-label mt-1">Rain, 6 h</div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl glass-inset px-4 py-3">
        <div className="text-sm font-bold" style={{ color: TONE[cond.tone] }}>
          {cond.label}
        </div>
        <ul className="mt-1 space-y-0.5">
          {cond.tips.map((t) => (
            <li key={t} className="text-xs text-neutral-400">
              {t}
            </li>
          ))}
        </ul>
      </div>
      <button onClick={() => setEnabled(false)} className="mt-3 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-neutral-300">
        Turn weather off
      </button>
    </section>
  );
};
