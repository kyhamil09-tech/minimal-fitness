import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, Compass, Flower2, Route, Wind } from 'lucide-react';
import { BreathPattern, BreathSession, patternById, setCustomPatterns } from '../lib/breathing';
import { BreatheReminder } from '../lib/breatheReminder';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePrefs } from '../lib/prefs';
import { useBack } from '../lift/back';
import { JourneyProgress, completeJourneyDay, hueFor, journeyById, suggestedNow } from './content';
import { GuidedSession } from './guided';
import { BreatheSettings, DEFAULT_SETTINGS, withDefaults } from './settings';
import { BrHeader, BreatheShell } from './ui';
import { Today } from './Today';
import { Explore } from './Explore';
import { Meditate } from './Meditate';
import { JourneyDetail, JourneyList } from './Journeys';
import { Progress } from './Progress';
import { TechniqueDetail } from './TechniqueDetail';
import { RhythmBuilder } from './RhythmBuilder';
import { Player, PlayerJourney } from './Player';
import { SitPlayer, SitSession } from './SitPlayer';

type Tab = 'today' | 'explore' | 'meditate' | 'journeys' | 'progress';
type Page = { k: 'technique'; id: string } | { k: 'journey'; id: string } | { k: 'build'; id?: string };
type Play = { id: string; minutes: number; journey?: PlayerJourney };

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'Today', icon: Wind },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'meditate', label: 'Meditate', icon: Flower2 },
  { id: 'journeys', label: 'Journeys', icon: Route },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

const ACCENT = '#5EEAD4';

export interface BreatheAppProps {
  log: BreathSession[];
  onAdd: (s: BreathSession) => void;
  onUpdate: (s: BreathSession) => void;
  onDelete: (id: string) => void;
  /** Live heart rate from a watch or strap, when there is one. */
  liveBpm?: number | null;
  /** Per-day resting heart rate and variability from Health Connect. */
  fitness?: Record<string, { restingHr?: number; hrvMs?: number }>;
  reminder: BreatheReminder;
  onReminder: (r: BreatheReminder) => void;
  /** Opened by a tile, widget or shortcut: 'start' begins your usual session, 'drift' the sleep one. */
  launch?: { action: string; nonce: number } | null;
  /** Back to the Health tab. */
  onExit: () => void;
}

/**
 * Breathe, as an app of its own inside the app: its own calm look and tab bar (Today, Explore, Meditate, Journeys, Progress), a full page
 * for every technique, rhythms of your own, an immersive session screen, silent and guided sits, and multi-day journeys. It opens over
 * everything from the Health tab, and Back leaves it.
 */
export const BreatheApp: React.FC<BreatheAppProps> = ({ log, onAdd, onUpdate, onDelete, liveBpm, fitness, reminder, onReminder, launch, onExit }) => {
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('today');
  const [stack, setStack] = useState<Page[]>([]);
  const [play, setPlay] = useState<Play | null>(null);
  const [sit, setSit] = useState<SitSession | null>(null);
  const [rawSettings, setSettings] = usePersistentState<BreatheSettings>('breathe_settings', DEFAULT_SETTINGS);
  const settings = withDefaults(rawSettings);
  const [progress, setProgress] = usePersistentState<JourneyProgress>('breathe_journeys', {});
  const [favs, setFavs] = usePersistentState<string[]>('breathe_favs', []);
  const [custom, setCustom] = usePersistentState<BreathPattern[]>('breathe_custom', []);
  // Rhythms you made are looked up by id like the built-in ones.
  setCustomPatterns(custom);
  const page = stack[stack.length - 1];
  const pop = () => setStack((s) => s.slice(0, -1));
  const open = (p: Page) => setStack((s) => [...s, p]);

  // Back: close the open page, else go to Today, else leave. The session screens handle their own back first.
  useBack(!play && !sit, () => {
    if (stack.length > 0) pop();
    else if (tab !== 'today') setTab('today');
    else onExit();
  });

  const start = (id: string, minutes: number, journey?: PlayerJourney) => setPlay({ id, minutes, journey });
  const toggleFav = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f]));

  // A tile, widget or shortcut can open this and start a session straight away.
  const lastLaunch = useRef(0);
  useEffect(() => {
    if (!launch || launch.nonce === lastLaunch.current) return;
    lastLaunch.current = launch.nonce;
    if (launch.action === 'start') {
      const fav = favs.find((id) => patternById(id));
      const now = suggestedNow(new Date().getHours());
      start(fav ?? now.technique, fav ? 3 : now.minutes);
    } else if (launch.action === 'drift') {
      start('drift', 5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch?.nonce]);

  const startJourneyDay = (journeyId: string, day: number) => {
    const j = journeyById(journeyId);
    if (!j) return;
    const d = j.days[day - 1];
    start(d.technique, d.minutes, { id: j.id, day, days: j.days.length, title: j.title, lesson: d.lesson });
  };

  const saveSession = (s: BreathSession) => {
    onAdd(s);
    if (s.journey) {
      const j = journeyById(s.journey.id);
      if (j) setProgress((all) => completeJourneyDay(all, j, s.journey!.day, Date.now()));
    }
  };
  const rate = (id: string, n: number) => {
    const s = log.find((x) => x.id === id);
    if (s) onUpdate({ ...s, after: n });
  };

  const startSilent = (minutes: number) => setSit({ id: 'silent', title: 'Silent meditation', blurb: 'A quiet sit with a bell to begin and end.', minutes, hue: '#7DD3FC', lines: [] });
  const startGuided = (g: GuidedSession) => setSit({ id: g.id, title: g.title, blurb: g.line, minutes: g.minutes, hue: g.hue, lines: g.lines });

  const hue = page?.k === 'technique' ? hueFor(page.id) : page?.k === 'journey' ? journeyById(page.id)?.hue ?? ACCENT : ACCENT;

  let body: React.ReactNode;
  if (page?.k === 'technique') {
    const isCustom = custom.some((c) => c.id === page.id);
    body = (
      <TechniqueDetail
        patternId={page.id}
        log={log}
        reduceMotion={prefs.reduceMotion}
        onBack={pop}
        onStart={(id, m) => start(id, m)}
        isFav={favs.includes(page.id)}
        onFav={() => toggleFav(page.id)}
        onEdit={isCustom ? () => open({ k: 'build', id: page.id }) : undefined}
        onDelete={
          isCustom
            ? () => {
                setCustom((c) => c.filter((x) => x.id !== page.id));
                setFavs((f) => f.filter((x) => x !== page.id));
                pop();
              }
            : undefined
        }
      />
    );
  } else if (page?.k === 'build') {
    const initial = page.id ? custom.find((c) => c.id === page.id) : undefined;
    body = (
      <RhythmBuilder
        initial={initial}
        reduceMotion={prefs.reduceMotion}
        onBack={pop}
        onSave={(p) => {
          setCustom((c) => (c.some((x) => x.id === p.id) ? c.map((x) => (x.id === p.id ? p : x)) : [p, ...c]));
          setStack((s) => {
            const rest = s.slice(0, -1);
            // After making a new one, open its page; after editing, go back to it.
            return initial ? rest : [...rest, { k: 'technique', id: p.id }];
          });
        }}
      />
    );
  } else if (page?.k === 'journey') {
    const j = journeyById(page.id);
    body = j ? (
      <JourneyDetail
        journey={j}
        progress={progress[j.id]}
        onBack={pop}
        onTechnique={(id) => open({ k: 'technique', id })}
        onStartDay={(day) => startJourneyDay(j.id, day)}
        onRestart={() => setProgress((all) => ({ ...all, [j.id]: { startedAt: Date.now(), done: [] } }))}
      />
    ) : null;
  } else {
    body = (
      <>
        <BrHeader title="Breathe" onBack={onExit} backLabel="Back to Health" />
        {tab === 'today' && <Today log={log} progress={progress} fitness={fitness} favs={favs} onTechnique={(id) => open({ k: 'technique', id })} onStart={(id, m) => start(id, m)} onJourney={(id) => open({ k: 'journey', id })} />}
        {tab === 'explore' && <Explore favs={favs} custom={custom} onFav={toggleFav} onTechnique={(id) => open({ k: 'technique', id })} onMake={() => open({ k: 'build' })} />}
        {tab === 'meditate' && <Meditate onSilent={startSilent} onGuided={startGuided} />}
        {tab === 'journeys' && <JourneyList progress={progress} onOpen={(id) => open({ k: 'journey', id })} />}
        {tab === 'progress' && <Progress log={log} settings={settings} onSettings={setSettings} hue={ACCENT} onDelete={onDelete} reminder={reminder} onReminder={onReminder} />}
        <nav className="br-tabbar" aria-label="Breathe sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" className="br-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
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
    <>
      <BreatheShell label="Breathe" hue={hue}>
        {body}
      </BreatheShell>
      {play && (
        <Player
          key={`${play.id}-${play.minutes}-${play.journey?.day ?? 0}`}
          patternId={play.id}
          minutes={play.minutes}
          settings={settings}
          onSettings={setSettings}
          reduceMotion={prefs.reduceMotion}
          liveBpm={liveBpm}
          journey={play.journey}
          onSave={saveSession}
          onRate={rate}
          onClose={() => setPlay(null)}
        />
      )}
      {sit && <SitPlayer key={`${sit.id}-${sit.minutes}`} session={sit} settings={settings} onSettings={setSettings} reduceMotion={prefs.reduceMotion} onSave={saveSession} onRate={rate} onClose={() => setSit(null)} />}
    </>
  );
};
