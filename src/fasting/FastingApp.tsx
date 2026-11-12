import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, CalendarClock, Timer, Utensils } from 'lucide-react';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { BodyEntry, FoodEntry, UnitSystem } from '../types/tracking';
import { endFast, lastProtocol, startFast } from '../lib/fasting';
import { ensureNotificationPermission } from '../lib/notifications';
import { usePersistentState } from '../hooks/usePersistentState';
import { useBack } from '../lift/back';
import { useMiniLook } from '../hooks/useMiniLook';
import { GENERAL_NOTE, PROTOCOLS, protocolById } from './content';
import { FastExtras, FastPlan, removeSalt, removeWater } from './model';
import { DEFAULT_PREFS, FastCtx, FastPrefs, canStart, isBlocked } from './state';
import { FaHeader, FastingShell, Sheet } from './ui';
import { Now } from './Now';
import { Plan, ProtocolDetail } from './Plan';
import { Eat } from './Eat';
import { Journal } from './Journal';
import { Insights } from './Insights';
import { Screening } from './Screening';
import { ShareSheet } from './ShareSheet';

type Tab = 'now' | 'plan' | 'eat' | 'journal' | 'insights';
type Page = { k: 'protocol'; id: string } | { k: 'screening' };
type Start = { targetHours: number; protocolName: string; startedAt?: number };

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'now', label: 'Now', icon: Timer },
  { id: 'plan', label: 'Plan', icon: CalendarClock },
  { id: 'eat', label: 'Eat', icon: Utensils },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
];

export interface FastingAppProps {
  sessions: FastingSession[];
  setSessions: React.Dispatch<React.SetStateAction<FastingSession[]>>;
  sleepLogs: SleepLogEntry[];
  workouts: WorkoutSession[];
  body: BodyEntry[];
  plan: FastPlan;
  onPlan: (p: FastPlan) => void;
  onAddWater: (ml: number) => void;
  /** Takes back water added from here (the glass logged at that moment, of that size). */
  onRemoveWater: (ml: number, at: number) => void;
  /** The app-wide units, used until a choice is made in Fasting. */
  units: UnitSystem;
  /** Everything logged in Eat. */
  food: FoodEntry[];
  /** Leaves Fasting for the Eat app. */
  onOpenEat: () => void;
  /** The main app's accent, for "Match the app" in this app's look. */
  appAccent: string;
  /** Leaves the Fasting app for the food log. */
  onLogMeal: () => void;
  /** Opened by the tile: 'toggle' starts your usual fast or ends the one running. */
  launch?: { action: string; nonce: number } | null;
  onExit: () => void;
}

/**
 * Fasting, as an app of its own inside the app: a warm look and a clock face, five tabs (Now, Plan, Eat, Journal, Insights), a page for
 * every protocol, a short "before you start" check, a way to stop safely, and an experimental Lab. The fasts are kept in the same list
 * the widgets, the notification and the watch already read, so all of them stay in step.
 */
export const FastingApp: React.FC<FastingAppProps> = ({ sessions, setSessions, sleepLogs, workouts, body, plan, onPlan, onAddWater, onRemoveWater, units, appAccent, food, onOpenEat, onLogMeal, launch, onExit }) => {
  const miniLook = useMiniLook('fasting', appAccent);
  const accent = miniLook.resolved.accent;
  const [tab, setTab] = useState<Tab>('now');
  const [stack, setStack] = useState<Page[]>([]);
  const [hue, setHue] = useState(accent);
  const [extras, setExtras] = usePersistentState<FastExtras>('fasting_extras', {});
  const [prefs, setPrefs] = usePersistentState<FastPrefs>('fasting_prefs', DEFAULT_PREFS);
  const [pending, setPending] = useState<Start | null>(null);
  const [gate, setGate] = useState<Start | null>(null);
  const [ack, setAck] = useState(false);
  const [notice, setNotice] = useState<null | 'blocked' | 'running'>(null);
  const [share, setShare] = useState<FastingSession | null>(null);
  const page = stack[stack.length - 1];
  const pop = () => setStack((s) => s.slice(0, -1));
  const active = sessions.find((s) => !s.isCompleted);

  useBack(true, () => {
    if (stack.length > 0) pop();
    else if (tab !== 'now') setTab('now');
    else onExit();
  });

  const begin = (o: Start) => {
    void ensureNotificationPermission();
    setSessions((prev) => startFast(prev, { targetHours: o.targetHours, protocolName: o.protocolName, now: o.startedAt }));
    setTab('now');
    setStack([]);
  };

  // Starting goes through three checks: the questions, a fast already running, and (for a day or more) an extra confirmation.
  const requestStart = (o: Start, p: FastPrefs = prefs) => {
    if (!p.screened) {
      setPending(o);
      setStack((s) => [...s, { k: 'screening' }]);
      return;
    }
    if (isBlocked(p)) return setNotice('blocked');
    if (active) return setNotice('running');
    if (o.targetHours >= 23) {
      setAck(false);
      return setGate(o);
    }
    begin(o);
  };

  const dropWater = (sessionId: string, index: number) => {
    const entry = extras[sessionId]?.water[index];
    if (!entry) return;
    setExtras((all) => removeWater(all, sessionId, index));
    onRemoveWater(entry.ml, entry.at);
  };
  const dropSalt = (sessionId: string, index: number) => setExtras((all) => removeSalt(all, sessionId, index));

  const ctx: FastCtx = {
    sessions, setSessions, extras, setExtras, plan, setPlan: onPlan, prefs, setPrefs, sleepLogs, workouts, body,
    units: prefs.units ?? units, accent, miniLook, appAccent, food, openEat: onOpenEat, onAddWater, removeWater: dropWater, removeSalt: dropSalt, onLogMeal, requestStart: (o) => requestStart(o),
  };

  // The tile: start the usual fast, or end the one that is running.
  const lastLaunch = useRef(0);
  useEffect(() => {
    if (!launch || launch.nonce === lastLaunch.current) return;
    lastLaunch.current = launch.nonce;
    if (launch.action === 'toggle') {
      if (active) setSessions((prev) => endFast(prev));
      else {
        const l = lastProtocol(sessions);
        requestStart({ targetHours: l.hours, protocolName: l.name });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch?.nonce]);

  const openScreening = () => setStack((s) => [...s, { k: 'screening' }]);
  const shellHue = page?.k === 'protocol' ? protocolById(page.id)?.hue ?? hue : tab === 'now' && !page ? hue : accent;

  let view: React.ReactNode;
  if (page?.k === 'screening') {
    view = (
      <Screening
        prefs={prefs}
        onBack={() => {
          setPending(null);
          pop();
        }}
        onDone={(next) => {
          setPrefs(next);
          pop();
          const o = pending;
          setPending(null);
          if (o && canStart(next)) requestStart(o, next);
        }}
      />
    );
  } else if (page?.k === 'protocol') {
    const p = protocolById(page.id);
    view = p ? <ProtocolDetail protocol={p} ctx={ctx} onBack={pop} onStarted={() => undefined} /> : null;
  } else {
    view = (
      <>
        <FaHeader title="Fasting" onBack={onExit} backLabel="Back to Health" />
        {tab === 'now' && <Now ctx={ctx} onHue={setHue} onTab={setTab} onScreening={openScreening} onShare={setShare} />}
        {tab === 'plan' && <Plan ctx={ctx} onProtocol={(id) => setStack((s) => [...s, { k: 'protocol', id }])} />}
        {tab === 'eat' && <Eat ctx={ctx} />}
        {tab === 'journal' && <Journal ctx={ctx} />}
        {tab === 'insights' && <Insights ctx={ctx} onScreening={openScreening} />}
        <nav className="fa-tabbar" aria-label="Fasting sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" className="fa-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </>
    );
  }

  return (
    <FastingShell label="Fasting" hue={shellHue} look={miniLook.style} mode={miniLook.resolved.mode}>
      {view}

      <Sheet open={notice === 'blocked'} onClose={() => setNotice(null)} title="Fasting is switched off">
        <p className="text-sm leading-relaxed">Your answers in "Before you start" mean fasting is not a good fit right now. You can change your answers if they were a mistake.</p>
        <button type="button" className="fa-btn mt-4 w-full" onClick={() => { setNotice(null); openScreening(); }}>
          Review my answers
        </button>
      </Sheet>

      <Sheet open={notice === 'running'} onClose={() => setNotice(null)} title="A fast is already running">
        <p className="text-sm leading-relaxed">End the one you have before you start another. You can do that on the Now tab.</p>
        <button type="button" className="fa-btn mt-4 w-full" onClick={() => { setNotice(null); setStack([]); setTab('now'); }}>
          Go to Now
        </button>
      </Sheet>

      <Sheet open={gate !== null} onClose={() => setGate(null)} title="A long fast">
        {gate && (
          <>
            <p className="text-sm leading-relaxed">
              This is a {gate.targetHours}-hour fast. Fasts of a day or more carry more risk, and are not for everyone. Ask a doctor first if you take any medicine, have a health condition, are active or older. Drink water, include salts, and end it if you feel unwell.
            </p>
            <p className="fa-dim mt-2 text-xs">{PROTOCOLS.find((p) => p.fastHours === gate.targetHours)?.care}</p>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>I understand, and I will stop and eat if I feel unwell.</span>
            </label>
            <button
              type="button"
              className="fa-btn mt-4 w-full"
              disabled={!ack}
              onClick={() => {
                const o = gate;
                setGate(null);
                begin(o);
              }}
            >
              Start the fast
            </button>
            <p className="fa-dim mt-3 text-center text-xs">{GENERAL_NOTE}</p>
          </>
        )}
      </Sheet>

      <ShareSheet fast={share} onClose={() => setShare(null)} />
    </FastingShell>
  );
};
