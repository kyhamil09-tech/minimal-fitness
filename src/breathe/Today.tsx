import React, { useMemo, useState } from 'react';
import { ChevronRight, Flame, Play, Star } from 'lucide-react';
import { BreathSession, breathStats, calmSignals, isSit, patternById } from '../lib/breathing';
import { JOURNEYS, JourneyProgress, MOODS, greeting, hueFor, infoFor, nextJourneyDay, suggestedNow } from './content';
import { SectionTitle } from './ui';

const TREND = { better: '#86EFAC', usual: '#7DD3FC', worse: '#FDBA74' } as const;
const TREND_WORD = { better: 'Better than usual', usual: 'About usual', worse: 'Worse than usual' } as const;

/** Today: what to do right now, a tap for how you feel, your journey, and a quick look at the week. */
export const Today: React.FC<{
  log: BreathSession[];
  progress: JourneyProgress;
  fitness?: Record<string, { restingHr?: number; hrvMs?: number }>;
  onTechnique: (id: string) => void;
  onStart: (id: string, minutes: number) => void;
  onJourney: (id: string) => void;
  favs: string[];
}> = ({ log, progress, fitness, onTechnique, onStart, onJourney, favs }) => {
  const hour = new Date().getHours();
  const now = suggestedNow(hour);
  const stats = useMemo(() => breathStats(log, Date.now()), [log]);
  const signals = useMemo(() => calmSignals(fitness), [fitness]);
  const [moodId, setMoodId] = useState<string | null>(null);
  const mood = MOODS.find((m) => m.id === moodId);
  const nowPattern = patternById(now.technique);
  const nowHue = hueFor(now.technique);
  // The journey to carry on with: one that is started and not finished, else the first.
  // The ones you star, and the last few you actually did (not already starred).
  const recents = useMemo(() => {
    const seen = new Set<string>(favs);
    const out: string[] = [];
    for (const s of log) {
      if (seen.has(s.patternId) || isSit(s.patternId)) continue;
      seen.add(s.patternId);
      out.push(s.patternId);
      if (out.length >= 3) break;
    }
    return out;
  }, [log, favs]);
  const quick = (id: string, minutes: number, star: boolean) => {
    const p = patternById(id);
    return (
      <div key={id} className="br-card flex items-center gap-3 !p-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onTechnique(id)} aria-label={`${p.name}: ${p.rhythm}. See details`}>
          <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 40% 35%, ${hueFor(id)}, ${hueFor(id)}55)` }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate text-sm font-bold">{star && <Star className="h-3.5 w-3.5 shrink-0" style={{ color: '#FBBF24', fill: '#FBBF24' }} aria-hidden="true" />}{p.name}</span>
            <span className="br-dim block truncate text-xs">{p.rhythm}</span>
          </span>
        </button>
        <button type="button" className="br-btn br-btn-small" onClick={() => onStart(id, minutes)}>
          {minutes} min
        </button>
      </div>
    );
  };
  const active = JOURNEYS.find((j) => progress[j.id] && nextJourneyDay(j, progress[j.id]) !== null) ?? JOURNEYS[0];
  const day = nextJourneyDay(active, progress[active.id]);

  return (
    <div className="br-scroll">
      <p className="br-eyebrow mt-3">{greeting(hour)}</p>
      <h1 className="br-h1 mt-1">Take a breath</h1>

      <section className="br-hero mt-4" style={{ ['--hero-hue' as string]: nowHue }} aria-label="Right now">
        <div className="br-eyebrow">Right now</div>
        <div className="mt-1 text-2xl font-extrabold leading-tight">{nowPattern.name}</div>
        <p className="mt-1 text-sm opacity-90">{now.why}</p>
        <div className="mt-1 text-xs opacity-80">
          {nowPattern.rhythm} · {now.minutes} min
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="br-btn br-btn-light" onClick={() => onStart(now.technique, now.minutes)}>
            <Play className="h-5 w-5" aria-hidden="true" /> Start
          </button>
          <button type="button" className="br-btn br-btn-ghost" onClick={() => onTechnique(now.technique)}>
            About it
          </button>
        </div>
      </section>

      {favs.length > 0 && (
        <>
          <SectionTitle>Your favorites</SectionTitle>
          <div className="space-y-2">{favs.slice(0, 4).map((id) => quick(id, infoFor(id)?.minutes ?? 3, true))}</div>
        </>
      )}
      {recents.length > 0 && (
        <>
          <SectionTitle>Recently</SectionTitle>
          <div className="space-y-2">{recents.map((id) => quick(id, infoFor(id)?.minutes ?? 3, false))}</div>
        </>
      )}

      <SectionTitle>How do you feel?</SectionTitle>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How do you feel?">
        {MOODS.map((m) => (
          <button key={m.id} type="button" className="br-chip" aria-pressed={moodId === m.id} onClick={() => setMoodId(moodId === m.id ? null : m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mood && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="br-dim px-1 text-sm">{mood.line}</p>
          {mood.techniques.map((id) => {
            const p = patternById(id);
            return (
              <div key={id} className="br-card flex items-center gap-3 !p-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onTechnique(id)} aria-label={`${p.name}: ${p.rhythm}. See details`}>
                  <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 40% 35%, ${hueFor(id)}, ${hueFor(id)}55)` }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="br-dim block truncate text-xs">{p.rhythm}</span>
                  </span>
                </button>
                <button type="button" className="br-btn br-btn-small" onClick={() => onStart(id, mood.minutes)}>
                  {mood.minutes} min
                </button>
              </div>
            );
          })}
        </div>
      )}

      <SectionTitle>{progress[active.id] ? 'Your journey' : 'Try a journey'}</SectionTitle>
      <button type="button" className="br-card br-row w-full text-left" onClick={() => onJourney(active.id)} style={{ ['--row-hue' as string]: active.hue }}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{active.title}</span>
          <span className="br-dim mt-0.5 block text-xs">{day ? `Next: day ${day} of ${active.days.length} · ${patternById(active.days[day - 1].technique).name}` : 'All done. Well done.'}</span>
          <span className="mt-2 flex gap-1" aria-hidden="true">
            {active.days.map((_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: (progress[active.id]?.done ?? []).includes(i + 1) ? active.hue : 'rgba(255,255,255,0.12)' }} />
            ))}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      <SectionTitle>This week</SectionTitle>
      <div className="br-card grid grid-cols-3 text-center">
        <div>
          <div className="br-num">{stats.weekMinutes}</div>
          <div className="br-dim text-xs">minutes</div>
        </div>
        <div>
          <div className="br-num">{stats.weekSessions}</div>
          <div className="br-dim text-xs">sessions</div>
        </div>
        <div>
          <div className="br-num inline-flex items-center justify-center gap-1">
            {stats.streakDays > 0 && <Flame className="h-5 w-5" style={{ color: '#FDBA74' }} aria-hidden="true" />}
            {stats.streakDays}
          </div>
          <div className="br-dim text-xs">day streak</div>
        </div>
      </div>

      {signals.length > 0 && (
        <>
          <SectionTitle>How settled you are</SectionTitle>
          <div className="br-card space-y-3">
            {signals.map((s) => (
              <div key={s.label} className="flex items-start justify-between gap-3">
                <div>
                  <div className="br-dim text-xs">{s.label}</div>
                  <div className="text-lg font-extrabold">{s.value}</div>
                  <div className="br-dim text-xs">{s.note}</div>
                </div>
                <span className="br-tag shrink-0" style={{ color: TREND[s.trend], borderColor: `${TREND[s.trend]}55` }}>
                  {TREND_WORD[s.trend]}
                </span>
              </div>
            ))}
            <p className="br-dim text-xs leading-relaxed">Higher variability and a lower resting rate usually go with being rested. A hint only, not a diagnosis.</p>
          </div>
        </>
      )}

      <p className="br-dim mt-8 px-1 text-xs leading-relaxed">
        Breathing exercises are for relaxation and are not medical treatment. Stop and breathe normally if you feel dizzy. If you have a heart or lung condition, are pregnant, or breathing worries you, check with your doctor first.
      </p>
      <div className="h-4" />
    </div>
  );
};
