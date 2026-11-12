import React, { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Exercise, Routine } from '../types/tracking';
import { DecodedRoutine, decodeRoutine, importRoutine, routineShareText } from '../lib/routineShare';
import { daysText } from '../lib/liftSchedule';
import { formatWeight } from '../lib/units';
import { UnitSystem } from '../types/tracking';
import { Sheet } from './ui';

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Send a routine as text through the phone's share sheet (or copy it). Nothing is uploaded by the app. */
export const ShareRoutineSheet: React.FC<{ routine: Routine | null; units: UnitSystem; onClose: () => void }> = ({ routine, units, onClose }) => {
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [routine]);
  const text = routine ? routineShareText(routine, (kg) => formatWeight(kg, units)) : '';
  const send = async () => {
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: routine?.name, text, dialogTitle: 'Share routine' });
      else if (navigator.share) await navigator.share({ title: routine?.name, text });
      else setNote((await copyText(text)) ? 'Copied. Paste it into a message.' : 'Could not share.');
    } catch {
      // closing the share sheet is not an error
    }
  };
  return (
    <Sheet open={!!routine} onClose={onClose} title={routine ? `Share ${routine.name}` : 'Share routine'}>
      <p className="l-dim mb-2 text-xs">Your friend pastes this into Minimal Fitness (Lift, Import a routine) and gets the same exercises, sets and days.</p>
      <pre className="l-card max-h-56 overflow-auto whitespace-pre-wrap break-all p-3 text-[11px] leading-snug">{text}</pre>
      <div className="mt-3 flex gap-2">
        <button type="button" className="l-btn l-btn-primary flex-1" onClick={() => void send()}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
        <button type="button" className="l-btn flex-1" onClick={async () => setNote((await copyText(text)) ? 'Copied.' : 'Could not copy.')}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy
        </button>
      </div>
      {note && (
        <p role="status" className="l-dim mt-2 text-sm">
          {note}
        </p>
      )}
    </Sheet>
  );
};

/** Paste a routine someone sent you, look it over, and add it. */
export const ImportRoutineSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  routines: Routine[];
  onRoutinesChange: (r: Routine[]) => void;
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
}> = ({ open, onClose, routines, onRoutinesChange, custom, onCustomChange }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DecodedRoutine | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setError('');
      setPreview(null);
    }
  }, [open]);
  const look = (value: string) => {
    setText(value);
    const d = value.trim() ? decodeRoutine(value) : null;
    setPreview(d);
    setError(value.trim() && !d ? 'That does not look like a routine from Minimal Fitness. Paste the whole message, including the long code at the end.' : '');
  };
  const add = () => {
    if (!preview) return;
    const out = importRoutine(preview, custom);
    if (out.custom !== custom) onCustomChange(out.custom);
    onRoutinesChange([...routines, out.routine]);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import a routine">
      <label htmlFor="ir-text" className="l-dim text-xs font-semibold">
        Paste the message here
      </label>
      <textarea id="ir-text" className="mt-1 h-28 w-full resize-none p-3 text-xs" value={text} onChange={(e) => look(e.target.value)} placeholder="KYFIT-ROUTINE-1:…" />
      {error && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--l-fail)' }}>
          {error}
        </p>
      )}
      {preview && (
        <div className="l-card mt-3 p-3" aria-label="Routine preview">
          <div className="text-[15px] font-bold">{preview.name}</div>
          {preview.days.length > 0 && <div className="text-xs font-semibold" style={{ color: 'var(--l-accent)' }}>{daysText(preview.days)}</div>}
          <ul className="l-dim mt-1 space-y-0.5 text-xs">
            {preview.exercises.map((e) => (
              <li key={e.id}>
                {e.name}
                {e.sets.length ? ` · ${e.sets.length} set${e.sets.length === 1 ? '' : 's'}` : ''}
                {e.custom ? ' · made by them (will be added to your exercises)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="l-btn l-btn-primary mt-3 w-full" disabled={!preview} onClick={add}>
        Add to my routines
      </button>
    </Sheet>
  );
};
