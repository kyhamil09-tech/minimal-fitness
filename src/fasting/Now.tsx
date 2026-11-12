import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Droplets, GlassWater, HelpCircle, Minus, Plus, Share2, Smile, Utensils, Waves } from 'lucide-react';
import { FastingSession } from '../types/health';
import { FEELING_TAGS, addCheckIn, endFast } from '../lib/fasting';
import { PROTOCOLS, nextStage, stageAt } from './content';
import { clampHours, eatingState, hoursOfPlanDay, nameForHours, waterAmounts, waterText, waterTotalMl, withExtra } from './model';
import { IntakeList } from './Intake';
import { FastCtx, isBlocked } from './state';
import { Dial } from './Dial';
import { HungerSurf, RefeedGuide, StopRules, WhatBreaksList } from './Parts';
import { lastMealTime } from '../eat/model';
import { lowDayKcal } from './model';
import { todayKey } from '../lib/dates';
import { Sheet, ink, dayAndTime, fromLocalInput, hoursText, timeOfDay, toLocalInput, useNow } from './ui';

type SheetId = 'start' | 'goal' | 'feel' | 'hunger' | 'can' | 'unwell' | 'end' | 'summary' | 'hydrate' | null;

const H = 3_600_000;

/**
 * Now: the clock face and everything for the moment you are in. With no fast it shows the day's eating window and a Start button (with
 * a way to say you finished eating earlier). With a fast running it shows the stage, the goal, and one-tap logging of water, salts,
 * how you feel, a hunger wave, and an "I feel unwell" button that ends the fast safely.
 */
export const Now: React.FC<{
  ctx: FastCtx;
  onHue: (hue: string) => void;
  onTab: (t: 'plan' | 'eat') => void;
  onScreening: () => void;
  onShare: (s: FastingSession) => void;
}> = ({ ctx, onHue, onTab, onScreening, onShare }) => {
  const { sessions, setSessions, extras, setExtras, plan, prefs, units } = ctx;
  const glass = waterAmounts(units)[0];
  const now = useNow(1000);
  const active = sessions.find((s) => !s.isCompleted) ?? null;
  const hours = active ? Math.max(0, (now - active.startTimestamp) / H) : 0;
  const stage = stageAt(hours);
  const upcoming = active ? nextStage(hours) : null;
  const gentle = prefs.gentle;
  const [sheet, setSheet] = useState<SheetId>(null);
  const [finished, setFinished] = useState<FastingSession | null>(null);

  // What would start today: the plan's fast for today's weekday, or the everyday one.
  const weekday = (new Date(now).getDay() + 6) % 7;
  const planned = hoursOfPlanDay(plan, weekday);
  const defaultHours = planned ?? hoursOfPlanDay({ ...plan, weekly: null }, weekday) ?? 16;
  const [pick, setPick] = useState<number>(defaultHours);
  const [earlier, setEarlier] = useState<string>(() => toLocalInput(Date.now()));
  const lowKcal = useMemo(() => lowDayKcal(ctx.plan, todayKey()), [ctx.plan, Math.floor(now / 3_600_000)]);
  const lastMeal = useMemo(() => lastMealTime(ctx.food, now), [ctx.food, Math.floor(now / 60_000)]);
  useEffect(() => setPick(defaultHours), [defaultHours]);

  const eat = useMemo(() => eatingState(plan, now), [plan, Math.floor(now / 60_000)]);
  const window = eat.windowStart && eat.windowEnd ? { start: eat.windowStart, end: eat.windowEnd } : null;
  const blocked = isBlocked(prefs);

  useEffect(() => onHue(active && !gentle ? stage.hue : ctx.accent), [active, gentle, stage.hue, onHue]);

  const protocolName = nameForHours(pick);
  const startNow = () => {
    setSheet(null);
    ctx.requestStart({ targetHours: pick, protocolName, startedAt: Math.min(Date.now(), fromLocalInput(earlier) || Date.now()) });
  };

  const addWater = (ml: number) => {
    if (!active) return;
    ctx.onAddWater(ml);
    setExtras((all) => withExtra(all, active.id, (e) => ({ ...e, water: [...e.water, { at: Date.now(), ml }] })));
  };
  const addSalt = (label: string) => {
    if (!active) return;
    setExtras((all) => withExtra(all, active.id, (e) => ({ ...e, salts: [...e.salts, { at: Date.now(), label }] })));
  };
  const changeGoal = (h: number) => {
    if (!active) return;
    const g = clampHours(h);
    setSessions((prev) => prev.map((s) => (s.id === active.id ? { ...s, targetDurationHours: g, fastProtocolName: nameForHours(g) } : s)));
  };
  const finish = (unwell = false) => {
    if (!active) return;
    const id = active.id;
    const endedAt = Date.now();
    setSessions((prev) => endFast(prev, endedAt));
    if (unwell) setExtras((all) => withExtra(all, id, (e) => ({ ...e, unwell: true })));
    setFinished({ ...active, isCompleted: true, endTimestamp: endedAt, actualHours: Math.round(((endedAt - active.startTimestamp) / H) * 100) / 100 });
    setSheet('summary');
  };

  const [tags, setTags] = useState<string[]>([]);
  const extra = active ? extras[active.id] : undefined;
  const closeCaption =
    !active && eat.state !== 'off' && eat.nextAt
      ? eat.state === 'eating'
        ? `Eating window open until ${timeOfDay(eat.nextAt)}`
        : `Window opens at ${timeOfDay(eat.nextAt)}`
      : !active && eat.state === 'off'
        ? 'A day off in your plan'
        : undefined;

  return (
    <div className="fa-scroll">
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="fa-eyebrow">{active ? active.fastProtocolName : 'Fasting'}</p>
          <h1 className="fa-h1 mt-0.5">{active ? (gentle ? 'Your fast' : stage.name) : 'Ready when you are'}</h1>
        </div>
      </div>

      <div className="mt-4">
        <Dial now={now} hue={active && !gentle ? stage.hue : ctx.accent} fast={active ? { start: active.startTimestamp, targetHours: active.targetDurationHours } : null} window={window} caption={active ? (gentle ? undefined : stage.line) : closeCaption} percent={!gentle} />
      </div>

      {active ? (
        <>
          <p className="fa-dim mt-3 text-center text-sm">
            Started {dayAndTime(active.startTimestamp)} · goal at {timeOfDay(active.startTimestamp + active.targetDurationHours * H)}
          </p>

          {!gentle && (
            <section className="fa-card mt-4" aria-label="What is happening">
              <div className="flex items-center justify-between gap-3">
                <h2 className="fa-h2">{stage.name}</h2>
                {upcoming && (
                  <span className="fa-tag" style={{ color: ink(upcoming.stage.hue) }}>
                    {upcoming.stage.name} in {hoursText(upcoming.inHours)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed">{stage.detail}</p>
              <p className="fa-dim mt-2 text-sm leading-relaxed">{stage.feel}</p>
              <p className="fa-dim mt-2 text-xs">General and approximate. Bodies differ a lot.</p>
            </section>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5" style={{ borderColor: 'var(--fa-line)' }}>
            <span className="text-sm">Goal {active.targetDurationHours} h</span>
            <span className="flex items-center gap-2">
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => changeGoal(active.targetDurationHours - 1)} aria-label="One hour shorter" disabled={active.targetDurationHours <= 8}>
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => changeGoal(active.targetDurationHours + 1)} aria-label="One hour longer" disabled={active.targetDurationHours >= 48}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <button type="button" className="fa-quick" onClick={() => addWater(glass.ml)} aria-label={`Log a glass of water, ${glass.label}`}>
              <GlassWater className="h-5 w-5" style={{ color: 'var(--fa-info)' }} aria-hidden="true" />
              Water +{glass.label}
            </button>
            <button type="button" className="fa-quick" onClick={() => setSheet('hydrate')}>
              <Droplets className="h-5 w-5" style={{ color: 'var(--fa-sun)' }} aria-hidden="true" />
              Salts
            </button>
            <button type="button" className="fa-quick" onClick={() => { setTags([]); setSheet('feel'); }}>
              <Smile className="h-5 w-5" style={{ color: 'var(--fa-good)' }} aria-hidden="true" />
              How I feel
            </button>
            <button type="button" className="fa-quick" onClick={() => setSheet('hunger')}>
              <Waves className="h-5 w-5" style={{ color: 'var(--fa-hue)' }} aria-hidden="true" />
              Hunger wave
            </button>
            <button type="button" className="fa-quick" onClick={() => setSheet('can')}>
              <HelpCircle className="h-5 w-5" style={{ color: 'var(--fa-lab)' }} aria-hidden="true" />
              Can I have…?
            </button>
            <button type="button" className="fa-quick" onClick={() => setSheet('unwell')}>
              <AlertTriangle className="h-5 w-5" style={{ color: 'var(--fa-bad)' }} aria-hidden="true" />
              I feel unwell
            </button>
          </div>
          {extra && (extra.water.length > 0 || extra.salts.length > 0 || (active.checkIns?.length ?? 0) > 0) && (
            <button type="button" className="fa-dim mx-auto mt-3 block text-center text-xs underline decoration-dotted underline-offset-4" onClick={() => setSheet('hydrate')} aria-label="See and edit what you logged">
              {waterTotalMl(extra) > 0 ? `${waterText(waterTotalMl(extra), units)} water` : ''}
              {extra.salts.length > 0 ? ` · ${extra.salts.length} salt${extra.salts.length === 1 ? '' : 's'}` : ''}
              {(active.checkIns?.length ?? 0) > 0 ? ` · ${active.checkIns?.length} check-in${active.checkIns?.length === 1 ? '' : 's'}` : ''}
            </button>
          )}

          <button type="button" className="fa-btn fa-btn-quiet mt-5 w-full" onClick={() => setSheet('end')}>
            End fast
          </button>
        </>
      ) : (
        <>
          {blocked ? (
            <div className="fa-note mt-5">
              <div className="text-sm font-bold">Starting a fast is switched off</div>
              <p className="mt-1 text-sm leading-relaxed">Your answers in "Before you start" mean fasting is not a good fit right now. You can still use the guides.</p>
              <button type="button" className="fa-btn fa-btn-small fa-btn-quiet mt-3" onClick={onScreening}>
                Review my answers
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="fa-btn mt-5 w-full" onClick={startNow}>
                Start fast · {pick} h
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button type="button" className="fa-chip" onClick={() => setSheet('start')}>
                  {protocolName} · change
                </button>
                <button type="button" className="fa-chip" onClick={() => { setEarlier(toLocalInput(Date.now())); setSheet('start'); }}>
                  I finished eating earlier
                </button>
              </div>
            </>
          )}
          {!prefs.screened && !blocked && (
            <p className="fa-dim mt-4 text-center text-xs">
              First time? A few quick questions come first.{' '}
              <button type="button" className="underline" onClick={onScreening}>
                Before you start
              </button>
            </p>
          )}

          {lowKcal !== null && (
            <section className="fa-card mt-5" aria-label="Low-calorie day">
              <div className="fa-eyebrow">5:2 day</div>
              <div className="mt-1 text-xl font-extrabold">
                {Math.round(ctx.food.filter((f) => f.date === todayKey()).reduce((s, f) => s + f.calories, 0)).toLocaleString()} of {lowKcal} kcal
              </div>
              <p className="fa-dim mt-1 text-sm">A low-calorie day. Protein, vegetables and water keep it easier. Log what you eat in Eat.</p>
              <button type="button" className="fa-btn fa-btn-small fa-btn-quiet mt-3" onClick={ctx.openEat}>
                <Utensils className="h-4 w-4" aria-hidden="true" /> Open Eat
              </button>
            </section>
          )}
          <section className="fa-card mt-5" aria-label="Today">
            <div className="flex items-center justify-between gap-3">
              <h2 className="fa-h2">Your day</h2>
              <button type="button" className="fa-chip !min-h-9" onClick={() => onTab('plan')}>
                Plan
              </button>
            </div>
            {eat.windowStart && eat.windowEnd && eat.state !== 'off' ? (
              <p className="mt-2 text-sm leading-relaxed">
                Eating window {timeOfDay(eat.windowStart)} to {timeOfDay(eat.windowEnd)} ({eat.eatHours} h) · fasting {24 - eat.eatHours} h
              </p>
            ) : (
              <p className="fa-dim mt-2 text-sm">{eat.state === 'off' ? 'Today is a day off in your plan.' : 'Set a plan to see your eating window here.'}</p>
            )}
            <button type="button" className="fa-btn fa-btn-small fa-btn-quiet mt-3" onClick={() => onTab('eat')}>
              <Utensils className="h-4 w-4" aria-hidden="true" /> Eating and breaking a fast
            </button>
          </section>
          {sessions.some((s) => s.isCompleted) && (
            <p className="fa-dim mt-4 text-center text-xs">
              Last fast: {hoursText(sessions.filter((s) => s.isCompleted).sort((a, b) => b.startTimestamp - a.startTimestamp)[0].actualHours ?? 0)}
            </p>
          )}
        </>
      )}
      <div className="h-6" />

      {/* ---- sheets ---- */}
      <Sheet open={sheet === 'start'} onClose={() => setSheet(null)} title="Choose your fast">
        <div className="space-y-2">
          {PROTOCOLS.map((p) => (
            <button key={p.id} type="button" className="fa-card fa-row w-full text-left !p-3" aria-pressed={pick === p.fastHours} onClick={() => setPick(p.fastHours)} style={pick === p.fastHours ? { borderColor: 'var(--fa-hue)' } : undefined}>
              <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 40% 35%, ${p.hue}, ${p.hue}55)` }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{p.name}</span>
                <span className="fa-dim block text-xs">{p.tagline}</span>
              </span>
              {pick === p.fastHours && <span className="fa-tag">Chosen</span>}
            </button>
          ))}
          <div className="fa-card flex items-center justify-between gap-3 !p-3">
            <span className="text-sm font-bold">Custom</span>
            <span className="flex items-center gap-2">
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setPick(clampHours(pick - 1))} aria-label="One hour shorter">
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-14 text-center text-lg font-extrabold tabular-nums">{pick} h</span>
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setPick(clampHours(pick + 1))} aria-label="One hour longer">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="fa-card !p-3">
            <label htmlFor="fa-earlier" className="text-sm font-bold">
              When did you finish eating?
            </label>
            <p className="fa-dim text-xs">The fast counts from then. Leave it as now to start now.</p>
            {lastMeal !== null && (
              <button type="button" className="fa-chip mt-2" onClick={() => setEarlier(toLocalInput(lastMeal))}>
                Use my last logged meal ({timeOfDay(lastMeal)})
              </button>
            )}
            <input id="fa-earlier" type="datetime-local" className="fa-input mt-2" value={earlier} max={toLocalInput(Date.now())} min={toLocalInput(Date.now() - 24 * H)} onChange={(e) => setEarlier(e.target.value)} />
          </div>
          <button type="button" className="fa-btn w-full" onClick={startNow}>
            Start {pick} h fast
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'hydrate'} onClose={() => setSheet(null)} title="Water and salts">
        <p className="text-sm leading-relaxed">On a longer fast you also stop taking in salts. A pinch of salt in water, or an electrolyte drink with no sugar, is what many people use. Follow product directions.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {['Salt in water', 'Electrolyte drink', 'Magnesium', 'Potassium'].map((l) => (
            <button key={l} type="button" className="fa-btn fa-btn-small fa-btn-quiet" onClick={() => addSalt(l)}>
              + {l}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {waterAmounts(units).map((a) => (
            <button key={a.ml} type="button" className="fa-btn fa-btn-small" onClick={() => addWater(a.ml)}>
              +{a.label}
            </button>
          ))}
        </div>
        <p className="fa-note mt-3 text-xs leading-relaxed">If you have kidney disease, high blood pressure or heart disease, or take water tablets or blood-pressure medicines, ask your doctor before adding salt or potassium.</p>
        {active && (
          <div className="mt-3">
            <p className="fa-dim mb-1.5 text-xs">
              This fast so far: {waterText(waterTotalMl(extra), units)} water, {extra?.salts.length ?? 0} salt{extra?.salts.length === 1 ? '' : 's'} logged. Tap the x to take one back.
            </p>
            <IntakeList extra={extra} units={units} onRemoveWater={(i) => ctx.removeWater(active.id, i)} onRemoveSalt={(i) => ctx.removeSalt(active.id, i)} />
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'feel'} onClose={() => setSheet(null)} title="How do you feel?">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Feelings">
          {FEELING_TAGS.map((t) => (
            <button key={t.id} type="button" className="fa-chip" aria-pressed={tags.includes(t.id)} onClick={() => setTags((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="fa-btn mt-4 w-full"
          disabled={tags.length === 0 || !active}
          onClick={() => {
            if (active) setSessions((prev) => addCheckIn(prev, tags, Date.now(), active.id));
            setSheet(null);
          }}
        >
          Save check-in
        </button>
      </Sheet>

      <Sheet open={sheet === 'hunger'} onClose={() => setSheet(null)} title="Ride the wave">
        {sheet === 'hunger' && (
          <HungerSurf
            onResult={(rode) => {
              if (active) setExtras((all) => withExtra(all, active.id, (e) => ({ ...e, waves: [...e.waves, { at: Date.now(), rode }] })));
              setSheet(rode ? null : 'end');
            }}
          />
        )}
      </Sheet>

      <Sheet open={sheet === 'can'} onClose={() => setSheet(null)} title="Can I have this?">
        <WhatBreaksList compact />
      </Sheet>

      <Sheet open={sheet === 'unwell'} onClose={() => setSheet(null)} title="Feeling unwell?">
        <StopRules />
        <button type="button" className="fa-btn fa-btn-danger mt-4 w-full" onClick={() => finish(true)}>
          End my fast now
        </button>
        <p className="fa-dim mt-2 text-center text-xs">It is kept, marked as ended because you felt unwell, and does not count against you.</p>
        <button type="button" className="fa-btn fa-btn-quiet mt-3 w-full" onClick={() => setSheet(null)}>
          I am okay, carry on
        </button>
      </Sheet>

      <Sheet open={sheet === 'end'} onClose={() => setSheet(null)} title="End your fast?">
        {active && (
          <>
            <p className="text-sm leading-relaxed">
              You have fasted {hoursText(hours)}
              {hours < active.targetDurationHours ? `, ${hoursText(active.targetDurationHours - hours)} short of your ${active.targetDurationHours} h goal` : ', and reached your goal'}.
            </p>
            {hours < active.targetDurationHours && !gentle && <p className="fa-dim mt-2 text-sm">Every fast counts. If you are hungry or unwell, ending now is fine.</p>}
            <button type="button" className="fa-btn mt-4 w-full" onClick={() => finish(false)}>
              End fast
            </button>
            <button type="button" className="fa-btn fa-btn-quiet mt-2 w-full" onClick={() => setSheet(null)}>
              Keep fasting
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === 'summary'} onClose={() => { setSheet(null); setFinished(null); }} title="Fast complete">
        {finished && (
          <>
            <div className="text-center">
              <div className="fa-serif text-5xl">{hoursText(finished.actualHours ?? 0)}</div>
              <p className="fa-dim mt-1 text-sm">
                {finished.fastProtocolName} · {Math.round(((finished.actualHours ?? 0) / finished.targetDurationHours) * 100)}% of your {finished.targetDurationHours} h goal
              </p>
              {!gentle && <p className="mt-1 text-sm font-semibold" style={{ color: ink(stageAt(finished.actualHours ?? 0).hue) }}>Reached: {stageAt(finished.actualHours ?? 0).name}</p>}
            </div>
            <div className="mt-4">
              <div className="fa-eyebrow mb-2">Break it well</div>
              <RefeedGuide hours={finished.actualHours ?? 0} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="fa-btn fa-btn-small" onClick={() => { setSheet(null); setFinished(null); ctx.onLogMeal(); }}>
                <Utensils className="h-4 w-4" aria-hidden="true" /> Log a meal
              </button>
              <button type="button" className="fa-btn fa-btn-small fa-btn-quiet" onClick={() => onShare(finished)}>
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
};

