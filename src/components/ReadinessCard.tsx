import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Readiness } from '../lib/readiness';

const TONE_COLOR = { good: '#6EE7B7', neutral: '#8AB4F8', warn: '#FBBF24', bad: '#FB7185' } as const;

/** Today's "how ready are you to train" number with the reasons behind it. */
export const ReadinessCard: React.FC<{ theme: ColorPalette; readiness: Readiness | null; hint?: string }> = ({ theme, readiness, hint }) => {
  const [open, setOpen] = useState(false);

  if (!readiness) {
    return (
      <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: theme.primary }} />
          <span className="stat-label">Readiness</span>
        </div>
        <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
          {hint ?? 'Your readiness score appears once the app has last night’s sleep and a few days of heart rate readings from your watch.'}
        </p>
      </section>
    );
  }

  const color = TONE_COLOR[readiness.tone];
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4" style={{ color: theme.primary }} />
        <span className="stat-label">Readiness</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Readiness ${readiness.score} out of 100, ${readiness.label}`}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${(readiness.score / 100) * c} ${c}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="hero-num text-[2.1rem]" style={{ color }}>
              {readiness.score}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold text-white leading-tight">{readiness.label}</div>
          <p className="text-[12px] text-neutral-400 mt-1 leading-relaxed">{readiness.advice}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 w-full flex items-center justify-between text-[11px] font-bold text-neutral-400 hover:text-white"
      >
        <span>What it is made of</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2.5">
          {readiness.parts.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-white font-semibold">{p.label}</span>
                <span className="text-neutral-400 tabular-nums">
                  {p.score} · {p.weight}% of the score
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${p.score}%`, backgroundColor: p.score >= 70 ? '#6EE7B7' : p.score >= 45 ? '#FBBF24' : '#FB7185' }} />
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{p.detail}</div>
            </div>
          ))}
          {readiness.missing.length > 0 && (
            <div className="rounded-2xl glass-inset p-3 text-[11px] text-neutral-400 space-y-1">
              {readiness.missing.map((m) => (
                <div key={m}>{m}</div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-neutral-600 leading-relaxed">
            An estimate from your own data, worked out on this phone. Google’s Readiness score is not shared with other apps, so the two will not match. Not medical advice.
          </p>
        </div>
      )}
    </section>
  );
};
