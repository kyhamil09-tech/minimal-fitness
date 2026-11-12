import React, { useEffect, useRef, useState } from 'react';
import { Check, EyeOff, Heart, Pause, Play, Square, Vibrate, Volume2, VolumeX, X } from 'lucide-react';
import { BreathSession, MIN_SAVED_SEC, PHASE_WORDS, buzzFor, patternById, phaseAt } from '../lib/breathing';
import { buzz } from '../lib/prefs';
import { keepScreenOn } from '../lib/keepAwake';
import { speakCue } from '../lib/tracker';
import { useBack } from '../lift/back';
import { infoFor, hueFor } from './content';
import { Orb, useBreathClock } from './Orb';
import { chime, endChime, prepareAudio, setAmbientVolume, startAmbient, stopAmbient } from './audio';
import { AMBIENTS, BreatheSettings } from './settings';
import { HrLine, thin } from './HrLine';
import { BreatheShell, clock } from './ui';

export interface PlayerJourney {
  id: string;
  day: number;
  days: number;
  title: string;
  lesson: string;
}

interface Props {
  patternId: string;
  minutes: number;
  settings: BreatheSettings;
  onSettings: (s: BreatheSettings) => void;
  reduceMotion: boolean;
  /** Live heart rate from a watch or strap, or 0 / missing when there is none. */
  liveBpm?: number | null;
  journey?: PlayerJourney;
  onSave: (s: BreathSession) => void;
  onRate: (id: string, calm: number) => void;
  /** Leaves the player (back to wherever it was opened from). */
  onClose: () => void;
}

type Stage = 'prep' | 'running' | 'done';

const CALM_WORDS = ['Not at all', 'A little', 'Somewhat', 'Quite', 'Very calm'];

/** The next ambient sound in the list, for the one-tap chip. */
export const nextAmbient = (cur: BreatheSettings['ambient']): BreatheSettings['ambient'] => {
  const i = AMBIENTS.findIndex((a) => a.id === cur);
  return AMBIENTS[(i + 1) % AMBIENTS.length].id;
};

/**
 * The session itself, full screen: a short get-comfortable page, the breathing circle with the phase and the seconds left, pause and end,
 * and a page at the end that asks how calm you feel. Chimes, a buzz, a spoken cue and a soft background sound are each optional. With
 * Eyes closed on, the screen goes black during the session and the cues carry it; a tap shows it again for a moment.
 */
export const Player: React.FC<Props> = ({ patternId, minutes, settings, onSettings, reduceMotion, liveBpm, journey, onSave, onRate, onClose }) => {
  const pattern = patternById(patternId);
  const info = infoFor(patternId);
  const hue = hueFor(patternId);
  const total = minutes * 60;
  const [stage, setStage] = useState<Stage>('prep');
  const [paused, setPaused] = useState(false);
  const [peek, setPeek] = useState(false);
  const t = useBreathClock(stage === 'running' && !paused);
  const [result, setResult] = useState<{ id: string; seconds: number; from?: number; to?: number; saved: boolean; hr: number[] } | null>(null);
  const [rated, setRated] = useState(0);
  const [bpm, setBpm] = useState(0);
  const startBpm = useRef<number | undefined>(undefined);
  const bpmNow = useRef(liveBpm);
  bpmNow.current = liveBpm;
  const hrRef = useRef<number[]>([]);
  const lastPhase = useRef('');
  const tRef = useRef(0);
  tRef.current = t;
  const sRef = useRef(settings);
  sRef.current = settings;

  const finish = (elapsed: number) => {
    if (stage !== 'running') return;
    const seconds = Math.min(total, Math.max(0, Math.round(elapsed)));
    const from = startBpm.current;
    const nowBpm = bpmNow.current && bpmNow.current > 0 ? Math.round(bpmNow.current) : undefined;
    const to = from && nowBpm ? nowBpm : undefined;
    const saved = seconds >= MIN_SAVED_SEC;
    const id = `br-${Date.now()}`;
    const hr = thin(hrRef.current);
    if (saved) onSave({ id, at: Date.now(), patternId, seconds, bpmStart: from, bpmEnd: to, hr: hr.length >= 5 ? hr : undefined, journey: journey && seconds >= Math.min(60, total * 0.6) ? { id: journey.id, day: journey.day } : undefined });
    buzz(sRef.current.haptics, [40, 80, 40]);
    if (sRef.current.tones) endChime();
    if (sRef.current.voice) void speakCue('Well done.', true);
    stopAmbient();
    setPeek(false);
    setResult({ id, seconds, from, to, saved, hr });
    setStage('done');
  };

  // Back: end a session that is running (it is kept if it was long enough), else leave.
  useBack(true, () => (stage === 'running' ? finish(tRef.current) : onClose()));
  useEffect(() => () => stopAmbient(), []);

  // Keep the screen on and stop at the end of the time.
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

  // A heart-rate reading each second while it runs, when a sensor is connected.
  useEffect(() => {
    if (stage !== 'running' || paused) return undefined;
    const id = window.setInterval(() => {
      const v = bpmNow.current && bpmNow.current > 30 ? Math.round(bpmNow.current) : 0;
      setBpm(v);
      if (v) hrRef.current.push(v);
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, paused]);

  // Changing the sound or its loudness while the session is going.
  useEffect(() => {
    if (stage !== 'running') return;
    if (settings.ambient === 'off') stopAmbient();
    else startAmbient(settings.ambient, settings.ambientVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ambient, stage]);
  useEffect(() => {
    setAmbientVolume(settings.ambientVolume);
  }, [settings.ambientVolume]);

  // A cue at the start of each part of each breath.
  const pt = phaseAt(pattern, t);
  useEffect(() => {
    if (stage !== 'running' || paused) return;
    const id = `${pt.cycle}:${pt.index}`;
    if (id === lastPhase.current) return;
    lastPhase.current = id;
    const s = sRef.current;
    buzz(s.haptics, buzzFor(pt.kind));
    if (s.tones) chime(pt.kind, 1);
    if (s.voice && pt.cycle <= 2) void speakCue(PHASE_WORDS[pt.kind], true);
  }, [pt.cycle, pt.index, pt.kind, stage, paused]);

  // After a tap on the black screen it shows for a few seconds.
  useEffect(() => {
    if (!peek) return undefined;
    const id = window.setTimeout(() => setPeek(false), 5000);
    return () => window.clearTimeout(id);
  }, [peek]);

  const begin = () => {
    prepareAudio();
    startBpm.current = liveBpm && liveBpm > 0 ? Math.round(liveBpm) : undefined;
    hrRef.current = [];
    lastPhase.current = '';
    setPaused(false);
    setPeek(false);
    setStage('running');
    if (settings.voice) void speakCue(`${pattern.name}. Breathe naturally and follow the circle.`, true);
  };

  const again = () => {
    setResult(null);
    setRated(0);
    setStage('prep');
  };

  const dark = stage === 'running' && settings.eyesClosed && !peek;
  const noCues = !settings.haptics && !settings.tones && !settings.voice;
  const background = `radial-gradient(120% 70% at 50% 8%, ${hue}30 0%, rgba(7,11,20,0) 60%), linear-gradient(180deg, #0b1424 0%, #070b14 100%)`;
  const orbSize = Math.min(340, Math.round((typeof window !== 'undefined' ? window.innerWidth : 360) * 0.8));
  const ambientLabel = AMBIENTS.find((a) => a.id === settings.ambient)?.label ?? 'Off';

  return (
    <BreatheShell label={pattern.name} hue={hue}>
      <div className="br-player" style={{ background }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="br-eyebrow">{pattern.name}</span>
          <button type="button" className="br-icon-btn" onClick={() => (stage === 'running' ? finish(t) : onClose())} aria-label={stage === 'running' ? 'End session' : 'Close'}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {stage === 'prep' && (
          <div className="br-scroll flex flex-col items-center text-center">
            <div className="mt-4">
              <Orb pattern={pattern} t={0} hue={hue} size={Math.round(orbSize * 0.62)} reduce label={false} />
            </div>
            <h1 className="br-h1 mt-5">{journey ? `Day ${journey.day} of ${journey.days}` : 'Get comfortable'}</h1>
            <p className="br-dim mt-2 max-w-sm text-sm leading-relaxed">{journey ? journey.lesson : 'Sit or lie down, let your shoulders drop and relax your jaw. Close your eyes if you like.'}</p>
            <div className="br-card mt-5 w-full max-w-sm text-left">
              <div className="br-eyebrow">{pattern.rhythm}</div>
              <ol className="mt-2 space-y-1.5 text-sm">
                {(info?.how ?? []).slice(0, 3).map((h, i) => (
                  <li key={h} className="flex gap-2">
                    <span className="br-dim w-4 shrink-0">{i + 1}.</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ol>
              {pattern.phases.some((p) => p.kind === 'hold') && <p className="br-dim mt-3 border-t pt-2 text-xs leading-relaxed" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>{info?.caution ?? 'Keep any hold gentle and skip it if you feel dizzy, are pregnant, or have a heart or lung condition.'}</p>}
            </div>
            <div className="mt-4 flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
              <button type="button" className="br-chip" aria-pressed={settings.tones} onClick={() => onSettings({ ...settings, tones: !settings.tones })}>
                {settings.tones ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />} Chimes
              </button>
              <button type="button" className="br-chip" aria-pressed={settings.haptics} onClick={() => onSettings({ ...settings, haptics: !settings.haptics })}>
                <Vibrate className="h-4 w-4" aria-hidden="true" /> Buzz
              </button>
              <button type="button" className="br-chip" aria-pressed={settings.voice} onClick={() => onSettings({ ...settings, voice: !settings.voice })}>
                Voice
              </button>
              <button type="button" className="br-chip" aria-pressed={settings.eyesClosed} onClick={() => onSettings({ ...settings, eyesClosed: !settings.eyesClosed })}>
                <EyeOff className="h-4 w-4" aria-hidden="true" /> Eyes closed
              </button>
              <button type="button" className="br-chip" aria-pressed={settings.ambient !== 'off'} onClick={() => onSettings({ ...settings, ambient: nextAmbient(settings.ambient) })} aria-label={`Background sound: ${ambientLabel}. Tap to change.`}>
                Sound: {ambientLabel}
              </button>
            </div>
            {settings.eyesClosed && noCues && <p className="mt-3 max-w-sm text-xs" style={{ color: '#FDBA74' }}>With the screen black you will want Buzz or Chimes on, so you can follow the breath without looking.</p>}
            <button type="button" className="br-btn mt-5 w-full max-w-sm" onClick={begin}>
              <Play className="h-5 w-5" aria-hidden="true" /> Begin · {minutes} min
            </button>
          </div>
        )}

        {stage === 'running' && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <Orb pattern={pattern} t={t} hue={hue} size={orbSize} reduce={reduceMotion} progress={t / total} />
            <p className="br-dim mt-6 text-sm tabular-nums">
              Breath {pt.cycle} · {clock(total - t)} left
              {bpm > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 font-semibold" style={{ color: '#FDA4AF' }} aria-label={`Heart rate ${bpm}`}>
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" /> {bpm}
                </span>
              )}
            </p>
            {reduceMotion && (
              <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.round(pt.progress * 100)}%`, backgroundColor: hue }} />
              </div>
            )}
            <div className="mt-8 flex items-center gap-5">
              <button type="button" className="br-round" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play className="h-7 w-7" aria-hidden="true" /> : <Pause className="h-7 w-7" aria-hidden="true" />}
              </button>
              <button type="button" className="br-round br-round-quiet" onClick={() => finish(t)} aria-label="End session">
                <Square className="h-6 w-6" aria-hidden="true" />
              </button>
              <button type="button" className="br-round br-round-quiet" onClick={() => onSettings({ ...settings, tones: !settings.tones })} aria-label={settings.tones ? 'Mute chimes' : 'Turn chimes on'} aria-pressed={settings.tones}>
                {settings.tones ? <Volume2 className="h-6 w-6" aria-hidden="true" /> : <VolumeX className="h-6 w-6" aria-hidden="true" />}
              </button>
              <button type="button" className="br-round br-round-quiet" onClick={() => onSettings({ ...settings, eyesClosed: true })} aria-label="Black screen, eyes closed" aria-pressed={settings.eyesClosed}>
                <EyeOff className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            {settings.ambient !== 'off' && (
              <label className="mt-6 flex w-full max-w-xs items-center gap-3 text-xs br-dim">
                {ambientLabel}
                <input type="range" min={0.1} max={1} step={0.05} value={settings.ambientVolume} onChange={(e) => onSettings({ ...settings, ambientVolume: Number(e.target.value) })} aria-label="Background sound volume" className="flex-1" />
              </label>
            )}
            <div className="sr-only" role="status" aria-live="polite">
              {paused ? 'Paused' : PHASE_WORDS[pt.kind]}
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="br-scroll flex flex-col items-center text-center">
            <span className="mt-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${hue}26`, color: hue }}>
              <Check className="h-8 w-8" aria-hidden="true" />
            </span>
            <h1 className="br-h1 mt-4">Well done</h1>
            <p className="br-dim mt-1 text-sm">
              {clock(result.seconds)} of {pattern.name.toLowerCase()}
              {!result.saved && ' · too short to save'}
            </p>
            {result.hr.length >= 5 ? (
              <div className="br-card mt-4 w-full max-w-sm">
                <div className="br-eyebrow mb-2">Heart rate</div>
                <HrLine values={result.hr} hue={hue} />
              </div>
            ) : (
              result.from && result.to && (
                <p className="mt-3 text-sm font-semibold">
                  Heart rate {result.from} → {result.to} bpm
                </p>
              )
            )}
            {journey && result.saved && result.seconds >= Math.min(60, total * 0.6) && (
              <div className="br-card mt-4 w-full max-w-sm">
                <div className="br-eyebrow">Journey</div>
                <div className="mt-1 text-sm font-semibold">
                  {journey.title}: day {journey.day} of {journey.days} done
                </div>
              </div>
            )}
            {result.saved && (
              <div className="br-card mt-4 w-full max-w-sm">
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
            <button type="button" className="br-btn br-btn-quiet mt-2 w-full max-w-sm" onClick={again}>
              Again
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
