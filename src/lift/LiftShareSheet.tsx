import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { shareImage } from '../lib/shareImage';
import { buildLiftCard, renderLiftCard } from './shareCard';
import { Sheet } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  workout: WorkoutSession;
  /** Your other workouts, to tell which sets were records. */
  others: WorkoutSession[];
  units: UnitSystem;
}

/** Shows the picture of a finished workout and sends it through the phone's share sheet. Nothing is uploaded by the app. */
export const LiftShareSheet: React.FC<Props> = ({ open, onClose, workout, others, units }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setUrl(null);
    setNote('');
    void renderLiftCard(buildLiftCard(workout, others.filter((w) => w.id !== workout.id), units)).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [open, workout, others, units]);

  const send = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const day = workout.startedAt ? new Date(workout.startedAt).toISOString().slice(0, 10) : 'workout';
      const result = await shareImage(url, `minimal-fitness-lift-${day}.png`, workout.title || 'My workout');
      setNote(result === 'saved' ? 'Image saved to your downloads.' : '');
    } catch (e) {
      // Closing the share sheet without choosing is not an error worth showing.
      const msg = e instanceof Error ? e.message : '';
      setNote(/cancel/i.test(msg) ? '' : 'Could not share the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share workout">
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--l-line)', background: '#000' }}>
        {url ? <img src={url} alt="Preview of your workout picture: the name, time, volume and sets, and your best set in each exercise" className="block w-full" /> : <div className="l-dim flex aspect-[4/5] items-center justify-center text-sm">Drawing…</div>}
      </div>
      <button type="button" className="l-btn l-btn-primary mt-3 w-full" disabled={!url || busy} onClick={() => void send()}>
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Opening…' : 'Share image'}
      </button>
      {note && (
        <p role="status" className="l-dim mt-2 text-sm">
          {note}
        </p>
      )}
    </Sheet>
  );
};
