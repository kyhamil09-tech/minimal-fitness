import React, { useMemo, useState } from 'react';
import { ChevronRight, FlaskConical, Minus, Plus } from 'lucide-react';
import { PROTOCOLS, Protocol, protocolById } from './content';
import { FIVE_TWO_KCAL, circadianSuggestion, clampHours, eatingState, fiveTwoAdjacent, hoursOfPlanDay, normalizeFiveTwo, whatIf } from './model';
import { FastCtx, isBlocked } from './state';
import { FaHeader, FaToggle, SectionTitle, Sheet, dayAndTime, ink, timeOfDay } from './ui';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const addHours = (hhmm: string, h: number): string => {
  const [a, b] = hhmm.split(':').map(Number);
  const t = (((a * 60 + b + Math.round(h * 60)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** The shape of a day for a protocol: the hours of fasting and the hours of eating, drawn to scale. */
export const DayBar: React.FC<{ fastHours: number; hue: string; eatStart?: string }> = ({ fastHours, hue, eatStart }) => {
  const eat = Math.max(0, 24 - fastHours);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={`${fastHours} hours fasting, ${eat} hours eating`}>
        <div style={{ flex: fastHours, background: hue }} />
        {eat > 0 && <div style={{ flex: eat, background: 'var(--fa-cream)', opacity: 0.85 }} />}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span style={{ color: ink(hue) }} className="font-semibold">
          Fast {fastHours} h
        </span>
        {eat > 0 && (
          <span className="fa-dim">
            Eat {eat} h{eatStart ? ` · ${eatStart} to ${addHours(eatStart, eat)}` : ''}
          </span>
        )}
      </div>
    </div>
  );
};

/** One protocol on its own page: what it is, a typical day, who it suits, and the care to take. */
export const ProtocolDetail: React.FC<{ protocol: Protocol; ctx: FastCtx; onBack: () => void; onStarted: () => void }> = ({ protocol: p, ctx, onBack, onStarted }) => {
  const isMine = ctx.plan.protocolId === p.id;
  return (
    <>
      <FaHeader onBack={onBack} />
      <div className="fa-scroll" role="region" aria-label={p.name} tabIndex={0}>
        <div className="flex items-center gap-4 pt-1">
          <span className="h-16 w-16 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 38% 32%, ${p.hue}, ${p.hue}44 70%)`, boxShadow: `0 0 30px ${p.hue}55` }} aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="fa-h1">{p.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="fa-tag" style={{ color: ink(p.hue), borderColor: `${p.hue}66` }}>
                {p.level}
              </span>
              <span className="fa-tag">{p.fastHours} h fast</span>
            </div>
          </div>
        </div>
        <p className="fa-dim mt-3 text-sm">{p.tagline}</p>

        <SectionTitle>The shape of a day</SectionTitle>
        <div className="fa-card">
          <DayBar fastHours={p.fastHours} hue={p.hue} />
        </div>

        <SectionTitle>What it is</SectionTitle>
        <p className="text-sm leading-relaxed">{p.about}</p>

        <SectionTitle>A typical day</SectionTitle>
        <ol className="space-y-2">
          {p.day.map((d, i) => (
            <li key={d} className="fa-card flex gap-3 !py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${p.hue}26`, color: ink(p.hue) }}>
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{d}</span>
            </li>
          ))}
        </ol>

        <SectionTitle>Good for</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {p.goodFor.map((g) => (
            <span key={g} className="fa-chip">
              {g}
            </span>
          ))}
        </div>

        <div className="fa-note mt-6">
          <div className="text-xs font-bold uppercase tracking-wider">Take care</div>
          <p className="mt-1 text-sm leading-relaxed">{p.care}</p>
        </div>
        <div className="h-4" />
      </div>
      <div className="fa-footer grid grid-cols-2 gap-2">
        <button
          type="button"
          className="fa-btn fa-btn-quiet"
          onClick={() => ctx.setPlan({ ...ctx.plan, protocolId: p.id, weekly: null })}
          disabled={isMine && ctx.plan.weekly === null}
        >
          {isMine && ctx.plan.weekly === null ? 'My plan' : 'Make it my plan'}
        </button>
        <button
          type="button"
          className="fa-btn"
          onClick={() => {
            ctx.requestStart({ targetHours: p.fastHours, protocolName: p.name });
            onStarted();
          }}
        >
          Start now
        </button>
      </div>
    </>
  );
};

/** Plan: your everyday fast and eating window, a week with days off, reminders, all the protocols, and the experimental helpers. */
export const Plan: React.FC<{ ctx: FastCtx; onProtocol: (id: string) => void }> = ({ ctx, onProtocol }) => {
  const { plan, setPlan, sleepLogs } = ctx;
  const [dayPick, setDayPick] = useState<number | null>(null);
  const now = Date.now();
  const hours = hoursOfPlanDay({ ...plan, weekly: null }, 0) ?? 16;
  const proto = protocolById(plan.protocolId);
  const eat = eatingState(plan, now);
  const week = plan.weekly ?? Array<string | null>(7).fill(plan.protocolId);
  const five = normalizeFiveTwo(plan.fiveTwo);
  const circadian = useMemo(() => circadianSuggestion(sleepLogs), [sleepLogs]);

  // The what-if planner
  const [wifStart, setWifStart] = useState('20:00');
  const [wifHours, setWifHours] = useState(16);
  const wif = useMemo(() => {
    const [h, m] = wifStart.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return whatIf(d.getTime(), wifHours, circadian?.medianBed ?? undefined, circadian?.medianWake ?? undefined);
  }, [wifStart, wifHours, circadian]);

  const setDay = (i: number, id: string | null) => {
    const next = [...week];
    next[i] = id;
    setPlan({ ...plan, weekly: next });
    setDayPick(null);
  };

  return (
    <div className="fa-scroll">
      <h1 className="fa-h1 mt-3">Your plan</h1>
      <p className="fa-dim mt-1 text-sm">The fast you usually do, when you eat, and the days you rest.</p>

      <section className="fa-card mt-4" aria-label="Everyday fast">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="fa-eyebrow">Every day</div>
            <div className="mt-1 text-xl font-extrabold">{plan.protocolId === 'custom' ? `${clampHours(plan.customHours)} h custom` : proto?.name ?? `${hours} h`}</div>
          </div>
          <span className="fa-tag">{hours} h fast</span>
        </div>
        <div className="mt-3">
          <DayBar fastHours={hours} hue={proto?.hue ?? ctx.accent} eatStart={plan.eatStart} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label htmlFor="fa-eat-start" className="text-sm font-semibold">
            Eating window opens
          </label>
          <input id="fa-eat-start" type="time" className="fa-input !w-32" value={plan.eatStart} onChange={(e) => e.target.value && setPlan({ ...plan, eatStart: e.target.value })} />
        </div>
        {eat.windowStart && eat.windowEnd && eat.state !== 'off' && (
          <p className="fa-dim mt-2 text-xs">
            Today: {timeOfDay(eat.windowStart)} to {timeOfDay(eat.windowEnd)}.
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Custom length</span>
          <span className="flex items-center gap-2">
            <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setPlan({ ...plan, protocolId: 'custom', weekly: null, customHours: clampHours((plan.protocolId === 'custom' ? plan.customHours : hours) - 1) })} aria-label="One hour shorter">
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-14 text-center text-lg font-extrabold tabular-nums">{plan.protocolId === 'custom' ? clampHours(plan.customHours) : hours} h</span>
            <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setPlan({ ...plan, protocolId: 'custom', weekly: null, customHours: clampHours((plan.protocolId === 'custom' ? plan.customHours : hours) + 1) })} aria-label="One hour longer">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </div>
      </section>

      <SectionTitle>This week</SectionTitle>
      <div className="fa-card">
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Fast for each day">
          {DAYS.map((d, i) => {
            const h = hoursOfPlanDay(plan, i);
            return (
              <button key={d} type="button" className="fa-quick !min-h-[64px] !gap-1 !rounded-xl !p-1 text-xs" onClick={() => setDayPick(i)} aria-label={`${DAY_NAMES[i]}: ${h === null ? 'day off' : `${h} hour fast`}. Change.`}>
                <span className="fa-dim text-[11px]">{d}</span>
                <span className="text-sm font-extrabold" style={{ color: h === null ? 'var(--fa-faint)' : 'var(--fa-hue-ink)' }}>
                  {h === null ? 'Off' : h}
                </span>
              </button>
            );
          })}
        </div>
        <p className="fa-dim mt-3 text-xs">Tap a day to change it or take it off. For example 16 hours on weekdays, 12 at the weekend, and a day off.</p>
        {plan.weekly && (
          <button type="button" className="fa-chip mt-3" onClick={() => setPlan({ ...plan, weekly: null })}>
            Same every day
          </button>
        )}
      </div>

      <SectionTitle>5:2 days</SectionTitle>
      <section className="fa-card" aria-label="5:2 days">
        {isBlocked(ctx.prefs) ? (
          <p className="fa-dim text-sm leading-relaxed">Low-calorie days are switched off, because your answers in "Before you start" mean fasting is not a good fit right now.</p>
        ) : (
          <>
            <FaToggle label="Two low-calorie days a week" sub="Eat normally five days. On two days, about 500 calories. It works on its own or with the plan above" on={five.on} onChange={(v) => setPlan({ ...plan, fiveTwo: { ...five, on: v } })} />
            {five.on && (
              <div className="px-4 pb-4">
                <div className="fa-eyebrow">Which days</div>
                <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Low-calorie days">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      className="fa-chip !px-0"
                      aria-pressed={five.days.includes(i)}
                      aria-label={DAY_NAMES[i]}
                      onClick={() => {
                        const has = five.days.includes(i);
                        const next = has ? five.days.filter((x) => x !== i) : [...five.days, i].slice(-2);
                        if (next.length === 2) setPlan({ ...plan, fiveTwo: { ...five, days: next } });
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="fa-dim mt-2 text-xs">Pick two. Tap one you want to swap, then the new one. Days apart work better than side by side.</p>
                {fiveTwoAdjacent(five.days) && <p className="fa-note mt-2 text-xs">These two days are side by side. That is harder: most people space them out.</p>}
                <div className="fa-eyebrow mt-4">Calories on those days</div>
                <div className="mt-2 flex gap-2" role="group" aria-label="Calories on low-calorie days">
                  {FIVE_TWO_KCAL.map((k) => (
                    <button key={k} type="button" className="fa-chip" aria-pressed={five.kcal === k} onClick={() => setPlan({ ...plan, fiveTwo: { ...five, kcal: k } })}>
                      {k}
                    </button>
                  ))}
                </div>
                <p className="fa-note mt-3 text-xs leading-relaxed">Low-calorie days can affect blood sugar and some medicines, and are not for children, in pregnancy, or with a history of disordered eating. Eat protein and vegetables on those days, drink water, and stop if you feel unwell. In Eat, those days show this smaller target.</p>
              </div>
            )}
          </>
        )}
      </section>

      <SectionTitle>Reminders</SectionTitle>
      <div className="fa-card !p-0">
        <FaToggle label="When it is time to start" sub="A note when your eating window closes" on={plan.remindStart} onChange={(v) => setPlan({ ...plan, remindStart: v })} />
        <FaToggle label="Before the window closes" sub={`A heads-up ${plan.closeMinutes} minutes ahead`} on={plan.remindClose} onChange={(v) => setPlan({ ...plan, remindClose: v })} />
        {plan.remindClose && (
          <div className="flex flex-wrap gap-2 px-4 pb-3" role="group" aria-label="Minutes before">
            {[15, 30, 60].map((m) => (
              <button key={m} type="button" className="fa-chip" aria-pressed={plan.closeMinutes === m} onClick={() => setPlan({ ...plan, closeMinutes: m })}>
                {m} min
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionTitle>All fasts</SectionTitle>
      <ul className="space-y-2.5">
        {PROTOCOLS.map((p) => (
          <li key={p.id}>
            <button type="button" className="fa-card fa-row w-full text-left" style={{ ['--row-hue' as string]: p.hue }} onClick={() => onProtocol(p.id)} aria-label={`${p.name}. ${p.tagline}. See details`}>
              <span className="h-12 w-12 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 38% 32%, ${p.hue}, ${p.hue}44 70%)`, boxShadow: `0 0 20px ${p.hue}44` }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{p.name}</span>
                <span className="fa-dim block text-xs">{p.tagline}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="fa-tag">{p.level}</span>
                  {plan.protocolId === p.id && <span className="fa-tag" style={{ color: 'var(--fa-hue-ink)' }}>My plan</span>}
                  {p.gated && <span className="fa-tag">Ask a doctor first</span>}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <SectionTitle right={<span className="fa-tag inline-flex items-center gap-1" style={{ color: 'var(--fa-lab)' }}><FlaskConical className="h-3 w-3" aria-hidden="true" /> Experimental</span>}>
        Lab
      </SectionTitle>
      <section className="fa-card" aria-label="Circadian window">
        <h3 className="text-sm font-bold">A window that follows your day</h3>
        {circadian ? (
          <>
            <p className="mt-2 text-sm leading-relaxed">
              From your sleep (you wake around {circadian.medianWake} and go to bed around {circadian.medianBed}): eat from <strong>{circadian.eatStart}</strong> to <strong>{circadian.eatEnd}</strong>, and fast the other {circadian.fastHours} hours.
            </p>
            <p className="fa-dim mt-2 text-xs leading-relaxed">It starts about an hour and a half after waking and ends about three hours before bed. Eating earlier in the day may suit the body clock, but the evidence is still developing.</p>
            <button type="button" className="fa-btn fa-btn-small mt-3" onClick={() => setPlan({ ...plan, protocolId: 'custom', customHours: circadian.fastHours, eatStart: circadian.eatStart, weekly: null })}>
              Use this window
            </button>
          </>
        ) : (
          <p className="fa-dim mt-2 text-sm leading-relaxed">Needs about five nights of sleep from your watch or logged by hand. Then it suggests an eating window that fits when you wake and sleep.</p>
        )}
      </section>

      <section className="fa-card mt-3" aria-label="What if">
        <h3 className="text-sm font-bold">What if I start at…</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs">
            <span className="fa-dim block">Start</span>
            <input type="time" className="fa-input !w-32" value={wifStart} onChange={(e) => e.target.value && setWifStart(e.target.value)} aria-label="Start time" />
          </label>
          <label className="text-xs">
            <span className="fa-dim block">Hours</span>
            <span className="flex items-center gap-2">
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setWifHours(clampHours(wifHours - 1))} aria-label="One hour shorter">
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-12 text-center text-lg font-extrabold tabular-nums">{wifHours}</span>
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setWifHours(clampHours(wifHours + 1))} aria-label="One hour longer">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </label>
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          It would end {dayAndTime(wif.endsAt)}.
          {wif.asleepHours !== null && ` About ${wif.asleepHours} of those hours would be spent asleep (from your usual bed and wake times).`}
        </p>
      </section>
      <div className="h-6" />

      <Sheet open={dayPick !== null} onClose={() => setDayPick(null)} title={dayPick !== null ? DAY_NAMES[dayPick] : ''}>
        <div className="space-y-2">
          <button type="button" className="fa-btn fa-btn-quiet w-full" onClick={() => dayPick !== null && setDay(dayPick, null)}>
            A day off from fasting
          </button>
          {PROTOCOLS.map((p) => (
            <button key={p.id} type="button" className="fa-btn fa-btn-quiet w-full !justify-between" onClick={() => dayPick !== null && setDay(dayPick, p.id)}>
              <span>{p.name}</span>
              <span className="fa-dim text-sm">{p.fastHours} h</span>
            </button>
          ))}
          {plan.protocolId === 'custom' && (
            <button type="button" className="fa-btn fa-btn-quiet w-full !justify-between" onClick={() => dayPick !== null && setDay(dayPick, 'custom')}>
              <span>Custom</span>
              <span className="fa-dim text-sm">{clampHours(plan.customHours)} h</span>
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
};
