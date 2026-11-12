import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Dumbbell, Flame, Footprints, Leaf, Minus, Moon, Plus, Sunrise } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Goals, Sex, UnitSystem, UserProfile } from '../types/tracking';
import { CORE_GOALS, VIBES, Vibe } from '../data/vibes';
import { AppearanceApi } from '../hooks/useAppearance';
import { DEFAULT_ANSWERS, OnboardingAnswers, buildFromAnswers } from '../lib/onboarding';
import { cmToFtIn, kgToDisplay, KG_PER_LB, mlToDisplay, volumeUnit, weightUnit } from '../lib/units';
import { tdee } from '../lib/calc';
import { lightPre } from '../lib/colorMath';
import { haptic } from '../lib/haptics';
import { Ring } from './ui/charts';
import { AppLogo } from './AppLogo';
import { CountUp } from './ui/CountUp';

interface Props {
  theme: ColorPalette;
  look: AppearanceApi;
  onSelectTheme: (id: string) => void;
  onDone: (profile: UserProfile, goals: Goals, startTab: 'today' | 'exercise' | 'sleep') => void;
}

const GOAL_ICON: Record<string, React.ReactNode> = {
  run: <Footprints className="w-5 h-5" />,
  strength: <Dumbbell className="w-5 h-5" />,
  lose: <Flame className="w-5 h-5" />,
  move: <Sunrise className="w-5 h-5" />,
  sleep: <Moon className="w-5 h-5" />,
  balance: <Leaf className="w-5 h-5" />,
};

const STEPS = ['vibe', 'goal', 'basics', 'done'] as const;

/** A big number with minus and plus buttons and a slider, for the few numbers we ask for. */
const Stepper: React.FC<{
  label: string;
  display: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, display, unit, min, max, step, value, onChange }) => {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="rounded-2xl border p-3.5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <button type="button" aria-label={`Lower ${label}`} onClick={() => set(value - step)} className="round-btn !w-11 !h-11">
          <Minus className="w-4 h-4" />
        </button>
        <div className="hero-num text-[2.6rem]" aria-live="polite">
          {display}
          <span className="hero-unit text-lg ml-1">{unit}</span>
        </div>
        <button type="button" aria-label={`Raise ${label}`} onClick={() => set(value + step)} className="round-btn !w-11 !h-11">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} className="w-full mt-2" />
    </div>
  );
};

/**
 * First run, in four quick screens: how it should feel (a vibe, shown live), what you are here for, three or four numbers, and a
 * small celebration. The look is chosen before any personal question, and every question has a sensible answer already filled in,
 * so the whole thing can be done in under a minute.
 */
export const Onboarding: React.FC<Props> = ({ theme, look, onSelectTheme, onDone }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS);
  const [vibeId, setVibeId] = useState<string | null>(null);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headRef.current?.focus();
  }, [step]);

  const shown = (c: string) => (look.light ? lightPre(c) : c);
  const go = (n: number) => {
    setDir(n > step ? 'fwd' : 'back');
    setStep(n);
  };
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  const chooseVibe = (v: Vibe) => {
    haptic.select();
    setVibeId(v.id);
    // Applied for real straight away, so the next screens already look the way it was picked.
    onSelectTheme(v.paletteId);
    look.select(v.light);
    look.select(v.dark);
    look.setMode(v.mode);
  };

  const built = useMemo(() => buildFromAnswers(answers), [answers]);
  const imperial = answers.units === 'imperial';
  const inches = Math.round(answers.heightCm / 2.54);
  const ftIn = cmToFtIn(answers.heightCm);
  const lb = Math.round(answers.weightKg / KG_PER_LB);

  const finish = () => {
    haptic.celebrate();
    onDone(built.profile, built.goals, built.startTab);
  };

  const sexes: { id: Sex; label: string }[] = [
    { id: 'female', label: 'Female' },
    { id: 'male', label: 'Male' },
    { id: 'other', label: 'Skip' },
  ];

  const primaryBtn = 'w-full py-3.5 rounded-2xl font-extrabold text-sm tracking-wide';
  const primaryStyle: React.CSSProperties = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Minimal Fitness"
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        background:
          'radial-gradient(70% 42% at 12% -4%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 72%), radial-gradient(60% 38% at 104% 102%, color-mix(in srgb, var(--accent-2) 20%, transparent), transparent 72%), var(--bg)',
      }}
    >
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* Progress */}
        <div className="flex items-center gap-3">
          {step > 0 && step < 3 ? (
            <button aria-label="Back" onClick={() => go(step - 1)} className="round-btn !w-9 !h-9 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <span className="w-9 h-9 shrink-0" />
          )}
          <div className="flex-1 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <span key={s} className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--hairline-strong)' }}>
                <span className="block h-full rounded-full" style={{ width: i <= step ? '100%' : '0%', backgroundColor: 'var(--accent)', transition: 'width 0.6s var(--ease)' }} />
              </span>
            ))}
          </div>
          {step === 2 ? (
            <button onClick={() => finish()} className="text-xs font-bold shrink-0 w-9 text-right" style={{ color: 'var(--ink-dim)' }}>
              Skip
            </button>
          ) : (
            <span className="w-9 shrink-0" />
          )}
        </div>

        <div key={step} className={`flex-1 flex flex-col pt-6 min-h-0 ${dir === 'fwd' ? 'slide-in' : ''}`}>
          {step === 0 && (
            <>
              <AppLogo size={64} className="pop-in mb-4" />
              <h1 ref={headRef} tabIndex={-1} className="outline-none">How should it feel?</h1>
              <p className="fade-up" style={{ '--i': 1 } as React.CSSProperties}>Pick a look. You can change it any time, and make your own later.</p>
              <div className="grid grid-cols-2 gap-3 mt-6">
                {VIBES.map((v, i) => {
                  const on = vibeId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => chooseVibe(v)}
                      aria-pressed={on}
                      className="pop-in text-left rounded-3xl border p-3 relative"
                      style={{ '--i': i + 2, backgroundColor: 'var(--card)', borderColor: on ? 'var(--accent)' : 'var(--hairline)', boxShadow: on ? '0 0 0 1px var(--accent), 0 10px 30px -14px var(--accent)' : 'none' } as React.CSSProperties}
                    >
                      <div className="flex gap-1 mb-2">
                        {v.swatch.map((c, k) => (
                          <span key={k} className="h-7 flex-1 rounded-lg" style={{ backgroundColor: shown(c), border: '1px solid rgba(0,0,0,0.12)' }} />
                        ))}
                      </div>
                      <div className="text-sm font-extrabold" style={{ color: 'var(--ink)' }}>{v.name}</div>
                      <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--ink-dim)' }}>{v.tagline}</div>
                      {on && (
                        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1" />
              <button onClick={() => go(1)} className={primaryBtn} style={primaryStyle}>
                {vibeId ? 'Continue' : 'Keep this look'}
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 ref={headRef} tabIndex={-1} className="outline-none">What are you here for?</h1>
              <p className="fade-up" style={{ '--i': 1 } as React.CSSProperties}>One tap. It sets your starting targets, nothing is locked in.</p>
              <div className="grid grid-cols-2 gap-3 mt-6">
                {CORE_GOALS.map((g, i) => {
                  const on = answers.goal === g.id;
                  return (
                    <button
                      key={g.id}
                      aria-pressed={on}
                      onClick={() => {
                        haptic.select();
                        set({ goal: g.id });
                        window.setTimeout(() => go(2), 320);
                      }}
                      className="pop-in text-left rounded-3xl border p-3.5"
                      style={{ '--i': i + 2, backgroundColor: on ? 'color-mix(in srgb, var(--accent) 16%, var(--card))' : 'var(--card)', borderColor: on ? 'var(--accent)' : 'var(--hairline)' } as React.CSSProperties}
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        {GOAL_ICON[g.id]}
                      </span>
                      <div className="text-sm font-extrabold" style={{ color: 'var(--ink)' }}>{g.label}</div>
                      <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--ink-dim)' }}>{g.line}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex-1" />
              <button onClick={() => go(2)} className="text-xs font-bold py-3" style={{ color: 'var(--ink-dim)' }}>
                Not sure yet
              </button>
            </>
          )}

          {step === 2 && (
            <div className="flex-1 flex flex-col min-h-0">
              <h1 ref={headRef} tabIndex={-1} className="outline-none">A few quick numbers</h1>
              <p className="fade-up" style={{ '--i': 1 } as React.CSSProperties}>For calories and heart-rate zones. They stay on this phone.</p>
              <div className="flex-1 overflow-y-auto no-scrollbar mt-4 space-y-3 pb-3">
                <div className="fade-up flex gap-2" style={{ '--i': 2 } as React.CSSProperties}>
                  <input
                    aria-label="Your first name (optional)"
                    value={answers.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="First name (optional)"
                    maxLength={30}
                    className="flex-1 min-w-0 rounded-2xl px-4 py-3 text-sm border"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
                  />
                  <div className="flex rounded-2xl p-1 border shrink-0" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }} role="group" aria-label="Units">
                    {(['metric', 'imperial'] as UnitSystem[]).map((u) => (
                      <button key={u} aria-pressed={answers.units === u} onClick={() => set({ units: u })} className="px-3 rounded-xl text-xs font-bold" style={{ backgroundColor: answers.units === u ? 'var(--accent)' : 'transparent', color: answers.units === u ? 'var(--on-accent)' : 'var(--ink-dim)' }}>
                        {u === 'metric' ? 'kg · cm' : 'lb · ft'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fade-up grid grid-cols-3 gap-2" style={{ '--i': 3 } as React.CSSProperties} role="group" aria-label="Sex, used only for calorie maths">
                  {sexes.map((s) => (
                    <button key={s.id} aria-pressed={answers.sex === s.id} onClick={() => set({ sex: s.id })} className="py-2.5 rounded-2xl text-xs font-bold border" style={{ backgroundColor: answers.sex === s.id ? 'color-mix(in srgb, var(--accent) 18%, var(--card))' : 'var(--card)', borderColor: answers.sex === s.id ? 'var(--accent)' : 'var(--hairline)', color: 'var(--ink)' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="fade-up" style={{ '--i': 4 } as React.CSSProperties}>
                  <Stepper label="Age" display={String(answers.age)} unit="yrs" min={10} max={100} step={1} value={answers.age} onChange={(v) => set({ age: v })} />
                </div>
                <div className="fade-up" style={{ '--i': 5 } as React.CSSProperties}>
                  {imperial ? (
                    <Stepper label="Height" display={`${ftIn.ft}'${ftIn.inch}"`} unit="" min={48} max={87} step={1} value={inches} onChange={(v) => set({ heightCm: v * 2.54 })} />
                  ) : (
                    <Stepper label="Height" display={String(Math.round(answers.heightCm))} unit="cm" min={120} max={220} step={1} value={Math.round(answers.heightCm)} onChange={(v) => set({ heightCm: v })} />
                  )}
                </div>
                <div className="fade-up" style={{ '--i': 6 } as React.CSSProperties}>
                  {imperial ? (
                    <Stepper label="Weight" display={String(lb)} unit="lb" min={80} max={440} step={1} value={lb} onChange={(v) => set({ weightKg: v * KG_PER_LB })} />
                  ) : (
                    <Stepper label="Weight" display={String(kgToDisplay(answers.weightKg, 'metric', 1))} unit="kg" min={35} max={200} step={0.5} value={Math.round(answers.weightKg * 2) / 2} onChange={(v) => set({ weightKg: v })} />
                  )}
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--ink-dim)' }}>
                  Maintenance ≈ <span className="font-bold" style={{ color: 'var(--ink)' }}><CountUp value={tdee(built.profile)} ms={400} /></span> kcal a day
                </p>
              </div>
              <button onClick={() => go(3)} className={primaryBtn} style={primaryStyle}>
                Looks good
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                <div className="soft-float">
                  <Ring value={1} size={170} stroke={12} color={theme.primary} ariaLabel="Setup complete">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </Ring>
                </div>
                <h1 ref={headRef} tabIndex={-1} className="mt-6 outline-none">You're set{answers.name.trim() ? `, ${answers.name.trim()}` : ''}</h1>
                <p className="fade-up" style={{ '--i': 3 } as React.CSSProperties}>Here is where we will start. It all adjusts as you go.</p>
                <div className="grid grid-cols-3 gap-3 mt-7 w-full">
                  {[
                    { label: 'steps a day', value: built.goals.dailySteps, fmt: (n: number) => n.toLocaleString(), color: theme.primary },
                    { label: 'workouts a week', value: built.goals.weeklyWorkouts, fmt: (n: number) => String(n), color: theme.secondary },
                    { label: `${volumeUnit(answers.units)} of water`, value: mlToDisplay(built.goals.dailyWaterMl, answers.units), fmt: (n: number) => n.toLocaleString(), color: theme.data?.blue ?? theme.tertiary },
                  ].map((g, i) => (
                    <div key={g.label} className="pop-in rounded-2xl border p-2.5 flex flex-col items-center" style={{ '--i': i + 4, backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' } as React.CSSProperties}>
                      <Ring value={1} size={54} stroke={6} color={g.color} ariaLabel={g.label}>
                        <span className="text-xs font-extrabold" style={{ color: 'var(--ink)' }}><CountUp value={g.value} ms={900} format={g.fmt} /></span>
                      </Ring>
                      <span className="text-xs mt-1.5 leading-tight" style={{ color: 'var(--ink-dim)' }}>{g.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-5" style={{ color: 'var(--ink-dim)' }}>
                  Weights shown in {weightUnit(answers.units)}. Everything stays on this phone.
                </p>
              </div>
              <button onClick={finish} className={primaryBtn} style={primaryStyle}>
                Let's go
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


