import React, { useEffect, useState } from 'react';
import { Exercise, MuscleGroup } from '../types/tracking';
import { MOTIONS } from '../data/motions';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { LibEntry, findEntry, levelLabel, libraryLoaded, loadLibrary } from '../lib/exerciseLib';
import { MuscleMap } from './MuscleMap';
import { Sheet } from './ui';
import { openOverlay, saveLink, savedLink, searchUrl } from '../lib/exerciseVideo';

/** The muscles to light up when the library has nothing more exact for an exercise: its group's main muscles. */
const GROUP_MUSCLES: Partial<Record<MuscleGroup, string[]>> = {
  Chest: ['chest'],
  Back: ['lats', 'middle back'],
  Shoulders: ['shoulders'],
  Arms: ['biceps', 'triceps'],
  Legs: ['quadriceps', 'hamstrings', 'calves'],
  Glutes: ['glutes'],
  Core: ['abdominals'],
};

/**
 * How to do an exercise: the muscles it works on a front and back figure, the side-view animation and three plain cues when the app has
 * them, and the written steps from the exercise library when it has the exercise.
 */
export const GuideSheet: React.FC<{ exercise: Exercise | null; onClose: () => void; extra?: React.ReactNode }> = ({ exercise, onClose, extra }) => {
  const motion = exercise?.pattern ? MOTIONS[exercise.pattern] : null;
  const [lib, setLib] = useState<LibEntry[] | null>(libraryLoaded());
  useEffect(() => {
    if (!exercise || lib) return;
    let alive = true;
    loadLibrary()
      .then((l) => alive && setLib(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [exercise, lib]);
  const entry = exercise && lib ? findEntry(lib, exercise) : undefined;
  const primary = entry?.p.length ? entry.p : exercise ? (GROUP_MUSCLES[exercise.muscle] ?? []) : [];
  const secondary = entry?.s ?? [];
  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.name ?? ''}>
      {exercise && (
        <div>
          <div className="l-dim mb-2 text-xs">
            {exercise.muscle} · {exercise.equipment}
            {entry ? ` · ${levelLabel(entry.l)}` : ''}
            {exercise.custom ? ' · made by you' : ''}
          </div>
          {primary.length > 0 && <MuscleMap primary={primary} secondary={secondary} />}
          {primary.length > 0 && (
            <p className="l-dim mt-2 text-xs">
              Main: {primary.join(', ')}.{secondary.length ? ` Helping: ${secondary.join(', ')}.` : ''}
            </p>
          )}
          {motion && exercise.pattern && (
            <>
              <div className="l-card mt-3 flex justify-center py-3">
                <ExerciseDemo pattern={exercise.pattern} />
              </div>
              {motion.note && <p className="l-dim mt-2 text-xs">{motion.note}</p>}
              <ol className="mt-3 space-y-3">
                {['Set up', 'Move', 'Watch for'].map((h, i) => (
                  <li key={h} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--l-fill)', color: 'var(--l-on-fill)' }}>
                      {i + 1}
                    </span>
                    <div>
                      <div className="l-dim text-xs font-bold uppercase">{h}</div>
                      <div className="text-sm">{motion.cues[i]}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="l-dim mt-3 text-xs">A simple side-view animation, not a filmed demonstration.</p>
            </>
          )}
          {entry && entry.i.length > 0 && (
            <>
              <h3 className="l-h2 !mt-4">Steps</h3>
              <ol className="space-y-2">
                {entry.i.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="l-dim w-5 shrink-0 text-right font-bold tabular-nums">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {!motion && !entry && <p className="mt-3 text-sm">There are no steps for this exercise yet. Start light, move with control and stop if something hurts.</p>}
          <p className="l-dim mt-4 text-xs">Start light and stop if something hurts.</p>
          <VideoBlock exercise={exercise} />
          {extra}
        </div>
      )}
    </Sheet>
  );
};

/** Watch a video of the exercise in an overlay over the app: a YouTube search, or a link the person saved for this exercise. Nothing is fetched until a button is tapped. */
const VideoBlock: React.FC<{ exercise: Exercise }> = ({ exercise }) => {
  const [link, setLink] = useState(() => savedLink(exercise.id));
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(link);
  const [bad, setBad] = useState(false);
  const save = () => {
    if (!saveLink(exercise.id, text)) {
      setBad(true);
      return;
    }
    setBad(false);
    setLink(savedLink(exercise.id));
    setEditing(false);
  };
  return (
    <div className="l-card mt-4 space-y-2 p-3">
      <h3 className="l-h2 !mt-0">Watch a video</h3>
      <div className="flex flex-wrap gap-2">
        {link && (
          <button type="button" className="l-btn l-btn-primary" onClick={() => void openOverlay(link)}>
            My video
          </button>
        )}
        <button type="button" className={link ? 'l-btn' : 'l-btn l-btn-primary'} onClick={() => void openOverlay(searchUrl(exercise.name))}>
          Find a video
        </button>
        <button type="button" className="l-btn l-btn-quiet" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {link ? 'Change my link' : 'Save my own link'}
        </button>
      </div>
      <p className="l-dim text-xs">Opens over the app, and Back returns here. Only the exercise name is sent to YouTube, and only when you tap Find a video.</p>
      {editing && (
        <div className="space-y-2">
          <label className="l-dim block text-xs" htmlFor={'vid-' + exercise.id}>
            A web address (https) of a video you like
          </label>
          <input id={'vid-' + exercise.id} value={text} onChange={(e) => setText(e.target.value)} inputMode="url" autoCapitalize="off" autoComplete="off" placeholder="https://" />
          {bad && (
            <p role="alert" className="text-xs" style={{ color: 'var(--l-danger, #ff6b6b)' }}>
              That is not a usable link. It must start with https and have no spaces.
            </p>
          )}
          <button type="button" className="l-btn l-btn-primary" onClick={save}>
            {text.trim() ? 'Save link' : 'Remove link'}
          </button>
        </div>
      )}
    </div>
  );
};
