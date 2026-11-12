import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, EyeOff, Pause, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import { BreathSession, MIN_SAVED_SEC } from '../lib/breathing';
import { buzz } from '../lib/prefs';
import { keepScreenOn } from '../lib/keepAwake';
import { speakCue } from '../lib/tracker';
import { useBack } from '../lift/back';
import { GuidedLine, lineAt } from './guided';
import { useBreathClock } from './Orb';
import { bell, prepareAudio, setAmbientVolume, startAmbient, stopAmbient } from './audio';
import { AMBIENTS, BreatheSettings } from './settings';
import { nextAmbient } from './Player';
import { BreatheShell, clock } from './ui';

export interface SitSession {
  /** The history id: 'silent' or a guided id. */
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  hue: string;
  /** What is said and shown at set moments. Empty for a silent sit. */
  lines: GuidedLine[];
}

interface Props {
  session: SitSession;
  settings: BreatheSettings;
  onSettings: (s: BreatheSettings) => void;
  reduceMotion: boolean;
  onSave: (s: BreathSession) => void;
  onRate: (id: string, calm: number) => void;
  onClose: () => void;
}

type Stage = 'prep' | 'running' | 'done';
const CALM_WORDS = ['Not at all', 'A little', 'Somewhat', 'Quite', 'Very calm'];

/**
 * A silent sit or a guided session: a quiet screen with the time left, an opening and closing bell, an optional bell now and then,
 * a soft background sound, and (for a guided one) each line shown as it is said. Saved to the same history as the breathing sessions.
 */
export const SitPlayer: React.FC<Props> = ({ session, settings, onSettings, reduceMotion, onSave, onRate, onClose }) => {
  const total = session.minutes * 60;
  const guided = session.lines.length > 0;
  const [stage, setStage] = useState<Stage>('prep');
  const [paused, setPaused] = useState(false);
  const [peek, setPeek] = useState(false);
  const t = useBreathClock(stage === 'running' && !paused);
  const [result, setResult] = useState<{ id: string; seconds: number; saved: boolean } | null>(null);
  const [rated, setRated] = useState(0);
  const tRef = useRef(0);
  tRef.current = t;
  const sRef = useRef(settings);
  sRef.current = settings;
  const lastLine = useRef(-1);
  const lastBell = useRef(0);

  const finish = (elapsed: number) => {
    if (stage !== 'running') return;
    const seconds = Math.min(total, Math.max(0, Math.round(elapsed)));
    const saved = seconds >= MIN_SAVED_SEC;
    const id = `br-${Date.now()}`;
    if (saved) onSave({ id, at: Date.now(), patternId: session.id, seconds });
    buzz(sRef.current.haptics, [40, 80, 40]);
    if (sRef.current.bells) bell(1);
    stopAmbient();
    setPeek(false);
    setResult({ id, seconds, saved });
    setStage('done');
  };

  useBack(true, () => (stage === 'running' ? finish(tRef.current) : onClose()));
  useEffect(() => () => stopAmbient(), []);
  useEffect(() => {
    if (stage !== 'running') return undefined;
    void keepScreenOn(true);
    return () => {
      void keepScreenOn(false);
    };
  }, [stage]);
  useEffect(() => {
    if (stage === 'running' && t >= total) finish(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, stage]);
  useEffect(() => {
    if (!peek) return undefined;
    const id = window.setTimeout(() => setPeek(false), 5000);
    return () => window.clearTimeout(id);
  }, [peek]);
  useEffect(() => {
    if (stage !== 'running') return;
    if (settings.ambient === 'off') stopAmbient();
    else startAmbient(settings.ambient, settings.ambientVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ambient, stage]);
  useEffect(() => {
    setAmbientVolume(settings.ambientVolume);
  }, [settings.ambientVolume]);

  // Each guided line, said when its time comes; and a bell now and then in a silent sit.
  const line = guided ? lineAt({ id: session.id, title: '', line: '', minutes: session.minutes, hue: '', lines: session.lines }, t) : null;
  const lineIndex = line ? session.lines.indexOf(line) : -1;
  useEffect(() => {
    if (stage !== 'running' || paused || lineIndex < 0 || lineIndex === lastLine.current) return;
    lastLine.current = lineIndex;
    if (sRef.current.voice && line) void speakCue(line.text, true);
  }, [lineIndex, stage, paused, line]);
  useEffect(() => {
    if (stage !== 'running' || paused || guided || !settings.bellEvery) return;
    const every = settings.bellEvery * 60;
    const k = Math.floor(t / every);
    if (k > 0 && k > lastBell.current && t < total - 20) {
      lastBell.current = k;
      if (settings.bells) bell(0.8);
      buzz(settings.haptics, [60]);
    }
  }, [t, stage, paused, guided, settings.bellEvery, settings.bells, settings.haptics, total]);

  const begin = () => {
    prepareAudio();
    lastLine.current = -1;
    lastBell.current = 0;
    setPaused(false);
    setPeek(false);
    setStage('running');
    if (settings.bells) window.setTimeout(() => bell(1), 250);
  };

  const dark = stage === 'running' && settings.eyesClosed && !peek;
  const hue = session.hue;
  const ambientLabel = AMBIENTS.find((a) => a.id === settings.ambient)?.label ?? 'Off';
  const size = 240;
  const R = size / 2 - 6;
  const C = 2 * Math.PI * R;
  const background = `radial-gradient(120% 70% at 50% 8%, ${hue}30 0%, rgba(7,11,20,0) 60%), linear-gradient(180deg, #0b1424 0%, #070b14 100%)`;

  return (
    <BreatheShell label={session.title} hue={hue}>
      <div className="br-player" style={{ background }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="br-eyebrow">{session.title}</span>
          <button type="button" className="br-icon-btn" onClick={() => (stage === 'running' ? finish(t) : onClose())} aria-label={stage === 'running' ? 'End session' : 'Close'}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {stage === 'prep' && (
          <div className="br-scroll flex flex-col items-center text-center">
            <h1 className="br-h1 mt-8">{session.title}</h1>
            <p className="br-dim mt-2 max-w-sm text-sm leading-relaxed">{session.blurb}</p>
            <p className="mt-2 text-sm font-semibold" style={{ color: hue }}>
              {session.minutes} minutes
            </p>
            <div className="br-card mt-5 w-full max-w-sm text-left text-sm leading-relaxed">
              {guided ? 'Find a comfortable place. Each line is shown as it is said. Turn Voice on to hear it, and Eyes closed to let the screen go black.' : 'Sit comfortably and let your eyes close. There is nothing to follow: just rest your attention on your breathing, and come back to it each time your mind wanders.'}
            </div>
            <div className="mt-4 flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
              <button type="button" className="br-chip" aria-pressed={settings.bells} onClick={() => onSettings({ ...settings, bells: !settings.bells })}>
                <Bell className="h-4 w-4" aria-hidden="true" /> Bells
              </button>
              {guided && (
                <button type="button" className="br-chip" aria-pressed={settings.voice} onClick={() => onSettings({ ...settings, voice: !settings.voice })}>
                  Voice
                </button>
              )}
              <button type="button" className="br-chip" aria-pressed={settings.eyesClosed} onClick={() => onSettings({ ...settings, eyesClosed: !settings.eyesClosed })}>
                <EyeOff className="h-4 w-4" aria-hidden="true" /> Eyes closed
              </button>
              <button type="button" className="br-chip" aria-pressed={settings.ambient !== 'off'} onClick={() => onSettings({ ...settings, ambient: nextAmbient(settings.ambient) })} aria-label={`Background sound: ${ambientLabel}. Tap to change.`}>
                Sound: {ambientLabel}
              </button>
              {!guided && (
                <button type="button" className="br-chip" aria-pressed={settings.bellEvery > 0} onClick={() => onSettings({ ...settings, bellEvery: settings.bellEvery === 0 ? 5 : settings.bellEvery === 5 ? 10 : 0 })} aria-label={`Bell during the sit: ${settings.bellEvery ? `every ${settings.bellEvery} minutes` : 'off'}. Tap to change.`}>
                  {settings.bellEvery ? `Bell every ${settings.bellEvery} min` : 'No bell between'}
                </button>
              )}
            </div>
            <button type="button" className="br-btn mt-6 w-full max-w-sm" onClick={begin}>
              <Play className="h-5 w-5" aria-hidden="true" /> Begin · {session.minutes} min
            </button>
          </div>
        )}

        {stage === 'running' && (
          <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
            <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${clock(total - t)} left`}>
              <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="4" />
                <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={hue} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, t / total))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div className="text-5xl font-black tabular-nums" style={{ textShadow: `0 0 30px ${hue}66` }}>
                  {clock(total - t)}
                </div>
              </div>
            </div>
            {guided && (
              <p key={lineIndex} className="mt-8 min-h-[4.5rem] max-w-sm text-lg font-medium leading-relaxed" style={{ animation: reduceMotion ? undefined : 'br-fade 0.8s ease both' }} aria-live="polite">
                {line?.text ?? 'Settle in.'}
              </p>
            )}
            <div className="mt-8 flex items-center gap-5">
              <button type="button" className="br-round" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play className="h-7 w-7" aria-hidden="true" /> : <Pause className="h-7 w-7" aria-hidden="true" />}
              </button>
              <button type="button" className="br-round br-round-quiet" onClick={() => finish(t)} aria-label="End session">
                <Square className="h-6 w-6" aria-hidden="true" />
              </button>
              {guided && (
                <button type="button" className="br-round br-round-quiet" onClick={() => onSettings({ ...settings, voice: !settings.voice })} aria-label={settings.voice ? 'Mute the voice' : 'Turn the voice on'} aria-pressed={settings.voice}>
                  {settings.voice ? <Volume2 className="h-6 w-6" aria-hidden="true" /> : <VolumeX className="h-6 w-6" aria-hidden="true" />}
                </button>
              )}
              <button type="button" className="br-round br-round-quiet" onClick={() => onSettings({ ...settings, eyesClosed: true })} aria-label="Black screen, eyes closed" aria-pressed={settings.eyesClosed}>
                <EyeOff className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            {settings.ambient !== 'off' && (
              <label className="br-dim mt-6 flex w-full max-w-xs items-center gap-3 text-xs">
                {ambientLabel}
                <input type="range" min={0.1} max={1} step={0.05} value={settings.ambientVolume} onChange={(e) => onSettings({ ...settings, ambientVolume: Number(e.target.value) })} aria-label="Background sound volume" className="flex-1" />
              </label>
            )}
          </div>
        )}

        {stage === 'done' && result && (
          <div className="br-scroll flex flex-col items-center text-center">
            <span className="mt-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${hue}26`, color: hue }}>
              <Check className="h-8 w-8" aria-hidden="true" />
            </span>
            <h1 className="br-h1 mt-4">Well done</h1>
            <p className="br-dim mt-1 text-sm">
              {clock(result.seconds)} · {session.title.toLowerCase()}
              {!result.saved && ' · too short to save'}
            </p>
            {result.saved && (
              <div className="br-card mt-5 w-full max-w-sm">
                <div className="text-sm font-semibold">How calm do you feel now?</div>
                <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="How calm do you feel now?">
                  {CALM_WORDS.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={rated === i + 1}
                      aria-label={`${i + 1}: ${w}`}
                      onClick={() => {
                        setRated(i + 1);
                        onRate(result.id, i + 1);
                      }}
                      className="br-chip justify-center !px-0"
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <div className="br-dim mt-2 flex justify-between text-xs">
                  <span>Not at all</span>
                  <span>Very calm</span>
                </div>
              </div>
            )}
            <button type="button" className="br-btn mt-6 w-full max-w-sm" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {dark && (
          <button type="button" className="br-dark" onClick={() => setPeek(true)} aria-label="The screen is black. Tap to look. The session carries on.">
            <span className="br-dim text-xs">Tap to look</span>
          </button>
        )}
      </div>
    </BreatheShell>
  );
};
