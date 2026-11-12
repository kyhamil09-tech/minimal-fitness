import React, { useState } from 'react';
import { Pencil, Play, Star, Trash2 } from 'lucide-react';
import { BreathSession, DURATIONS_MIN, PHASE_WORDS, cycleSec, patternById } from '../lib/breathing';
import { CATEGORIES, categoryHue, hueFor, infoFor } from './content';
import { Orb, useBreathClock } from './Orb';
import { BrHeader, SectionTitle } from './ui';

/**
 * One technique on its own page, so you know exactly what you are choosing: a live preview of the breath, the rhythm drawn out, what
 * it is, how to do it, who it suits, any note of care, how long to go for, and how many times you have done it.
 */
export const TechniqueDetail: React.FC<{
  patternId: string;
  log: BreathSession[];
  reduceMotion: boolean;
  onBack: () => void;
  onStart: (patternId: string, minutes: number) => void;
  isFav: boolean;
  onFav: () => void;
  /** Set for a rhythm you made: edit and delete are offered. */
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ patternId, log, reduceMotion, onBack, onStart, isFav, onFav, onEdit, onDelete }) => {
  const pattern = patternById(patternId);
  const info = infoFor(patternId);
  const hue = hueFor(patternId);
  const [minutes, setMinutes] = useState<number>(info?.minutes ?? 3);
  const t = useBreathClock(!reduceMotion);
  const mine = log.filter((s) => s.patternId === patternId);
  const mineMin = Math.round(mine.reduce((a, s) => a + s.seconds, 0) / 60);
  const total = cycleSec(pattern);
  const breaths = Math.round((minutes * 60) / total);
  const shade = { in: 1, topup: 0.8, hold: 0.45, out: 0.7 } as const;

  return (
    <>
      <BrHeader
        onBack={onBack}
        right={
          <>
            {onEdit && (
              <button type="button" className="br-icon-btn" onClick={onEdit} aria-label="Edit this rhythm">
                <Pencil className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button type="button" className="br-icon-btn" onClick={onDelete} aria-label="Delete this rhythm">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button type="button" className="br-icon-btn" onClick={onFav} aria-pressed={isFav} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>
              <Star className="h-6 w-6" style={{ color: isFav ? '#FBBF24' : 'currentColor', fill: isFav ? '#FBBF24' : 'none' }} aria-hidden="true" />
            </button>
          </>
        }
      />
      <div className="br-scroll">
        <div className="flex flex-col items-center pt-1">
          <Orb pattern={pattern} t={reduceMotion ? 0 : t} hue={hue} size={230} reduce={reduceMotion} />
          <p className="br-dim mt-2 text-xs">A preview. Follow the circle: it grows as you breathe in.</p>
        </div>

        <h1 className="br-h1 mt-4 text-center">{pattern.name}</h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {info?.categories.map((c) => (
            <span key={c} className="br-tag" style={{ color: categoryHue(c), borderColor: `${categoryHue(c)}55` }}>
              {CATEGORIES.find((x) => x.id === c)?.label}
            </span>
          ))}
          {info && <span className="br-tag">{info.level}</span>}
        </div>
        <p className="br-dim mx-auto mt-3 max-w-md text-center text-sm leading-relaxed">{pattern.blurb}</p>

        <SectionTitle>The rhythm</SectionTitle>
        <div className="br-card">
          <div className="flex gap-1" role="img" aria-label={pattern.rhythm}>
            {pattern.phases.map((ph, i) => (
              <div key={i} style={{ flex: ph.sec }} className="min-w-0">
                <div className="h-3 rounded-full" style={{ backgroundColor: hue, opacity: shade[ph.kind] }} />
                <div className="mt-1.5 truncate text-center text-xs font-semibold">{PHASE_WORDS[ph.kind].replace('Breathe ', '')}</div>
                <div className="br-dim text-center text-xs tabular-nums">{ph.sec} s</div>
              </div>
            ))}
          </div>
          <p className="br-dim mt-3 text-xs">
            {pattern.rhythm} · {total} seconds a breath, about {Math.round((60 / total) * 10) / 10} breaths a minute.
          </p>
        </div>

        {!info && pattern.phases.some((p) => p.kind === 'hold') && (
          <div className="br-note mt-6">
            <div className="text-xs font-bold uppercase tracking-wider">Take care</div>
            <p className="mt-1 text-sm leading-relaxed">Keep holds gentle. Skip them if you are pregnant, have a heart or lung condition, or feel dizzy.</p>
          </div>
        )}
        {info && (
          <>
            <SectionTitle>What it is</SectionTitle>
            <p className="text-sm leading-relaxed">{info.about}</p>

            <SectionTitle>How to do it</SectionTitle>
            <ol className="space-y-2">
              {info.how.map((h, i) => (
                <li key={h} className="br-card flex gap-3 !py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${hue}26`, color: hue }}>
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed">{h}</span>
                </li>
              ))}
            </ol>

            <SectionTitle>Good for</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {info.bestFor.map((b) => (
                <span key={b} className="br-chip">
                  {b}
                </span>
              ))}
            </div>

            {info.caution && (
              <div className="br-note mt-6">
                <div className="text-xs font-bold uppercase tracking-wider">Take care</div>
                <p className="mt-1 text-sm leading-relaxed">{info.caution}</p>
              </div>
            )}
          </>
        )}

        <SectionTitle>How long</SectionTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Session length">
          {DURATIONS_MIN.map((m) => (
            <button key={m} type="button" className="br-chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m} min
            </button>
          ))}
        </div>
        <p className="br-dim mt-2 text-xs">About {breaths} breaths.</p>

        {mine.length > 0 && (
          <>
            <SectionTitle>Your practice</SectionTitle>
            <div className="br-card flex items-center justify-around text-center">
              <div>
                <div className="br-num">{mine.length}</div>
                <div className="br-dim text-xs">{mine.length === 1 ? 'session' : 'sessions'}</div>
              </div>
              <div>
                <div className="br-num">{mineMin}</div>
                <div className="br-dim text-xs">minutes</div>
              </div>
            </div>
          </>
        )}
        <div className="h-4" />
      </div>
      <div className="br-footer">
        <button type="button" className="br-btn w-full" onClick={() => onStart(patternId, minutes)}>
          <Play className="h-5 w-5" aria-hidden="true" /> Start · {minutes} min
        </button>
      </div>
    </>
  );
};
