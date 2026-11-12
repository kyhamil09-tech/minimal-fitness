import React from 'react';
import { Check, ChevronRight, Lock, Play } from 'lucide-react';
import { patternById } from '../lib/breathing';
import { JOURNEYS, Journey, JourneyProgress, nextJourneyDay } from './content';
import { BrHeader, SectionTitle } from './ui';

/** The list of journeys: a few days each, one short session a day. */
export const JourneyList: React.FC<{ progress: JourneyProgress; onOpen: (id: string) => void }> = ({ progress, onOpen }) => (
  <div className="br-scroll">
    <h1 className="br-h1 mt-3">Journeys</h1>
    <p className="br-dim mt-1 text-sm">A few days, one short session each, with a line to read first. Do them in order, at your own pace.</p>
    <ul className="mt-5 space-y-3">
      {JOURNEYS.map((j) => {
        const done = progress[j.id]?.done.length ?? 0;
        const next = nextJourneyDay(j, progress[j.id]);
        return (
          <li key={j.id}>
            <button type="button" className="br-card br-row w-full text-left" style={{ ['--row-hue' as string]: j.hue }} onClick={() => onOpen(j.id)}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{j.title}</span>
                <span className="br-dim mt-1 block text-xs leading-relaxed">{j.line}</span>
                <span className="mt-3 flex gap-1" aria-hidden="true">
                  {j.days.map((_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: (progress[j.id]?.done ?? []).includes(i + 1) ? j.hue : 'rgba(255,255,255,0.12)' }} />
                  ))}
                </span>
                <span className="mt-1.5 block text-xs font-semibold" style={{ color: j.hue }}>
                  {next === null ? 'Complete' : done === 0 ? `${j.days.length} days · not started` : `Day ${next} next · ${done} of ${j.days.length} done`}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
    <div className="h-4" />
  </div>
);

/** One journey: each day with its technique and length, the next one open with its lesson and a Start button. */
export const JourneyDetail: React.FC<{
  journey: Journey;
  progress: JourneyProgress[string] | undefined;
  onBack: () => void;
  onStartDay: (day: number) => void;
  onTechnique: (id: string) => void;
  onRestart: () => void;
}> = ({ journey, progress, onBack, onStartDay, onTechnique, onRestart }) => {
  const done = new Set(progress?.done ?? []);
  const next = nextJourneyDay(journey, progress);
  return (
    <>
      <BrHeader onBack={onBack} />
      <div className="br-scroll">
        <h1 className="br-h1 mt-1">{journey.title}</h1>
        <p className="br-dim mt-1 text-sm leading-relaxed">{journey.line}</p>
        <p className="mt-2 text-xs font-semibold" style={{ color: journey.hue }}>
          {done.size} of {journey.days.length} days done
        </p>

        <SectionTitle>The days</SectionTitle>
        <ol className="space-y-2.5">
          {journey.days.map((d, i) => {
            const day = i + 1;
            const state = done.has(day) ? 'done' : day === next ? 'next' : 'later';
            const p = patternById(d.technique);
            return (
              <li key={day} className="br-card" style={state === 'next' ? { borderColor: journey.hue } : undefined}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: state === 'later' ? 'rgba(255,255,255,0.08)' : `${journey.hue}33`, color: state === 'later' ? 'inherit' : journey.hue }}>
                    {state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : state === 'later' ? <Lock className="h-3.5 w-3.5 opacity-60" aria-hidden="true" /> : day}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      Day {day} · {p.name}
                    </div>
                    <div className="br-dim text-xs">
                      {p.rhythm} · {d.minutes} min
                    </div>
                  </div>
                  <button type="button" className="br-icon-btn" onClick={() => onTechnique(d.technique)} aria-label={`About ${p.name}`}>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                {state === 'next' && (
                  <>
                    <p className="mt-3 text-sm leading-relaxed">{d.lesson}</p>
                    <button type="button" className="br-btn mt-3 w-full" onClick={() => onStartDay(day)} style={{ background: journey.hue }}>
                      <Play className="h-5 w-5" aria-hidden="true" /> Start day {day}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        {done.size > 0 && (
          <button type="button" className="br-btn br-btn-quiet mt-6 w-full" onClick={onRestart}>
            {next === null ? 'Do it again' : 'Start over'}
          </button>
        )}
        <div className="h-4" />
      </div>
    </>
  );
};

