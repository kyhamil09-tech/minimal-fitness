import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { buildShareData, renderShareCard } from '../lib/shareCard';
import { shareImage } from '../lib/shareImage';

/** Previews the workout's share image and sends it out through the phone's share sheet. */
export const ShareCardModal: React.FC<{ workout: WorkoutSession; units: UnitSystem; onClose: () => void }> = ({ workout, units, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    void renderShareCard(buildShareData(workout, units)).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [workout, units]);

  const send = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const day = workout.startedAt ? new Date(workout.startedAt).toISOString().slice(0, 10) : 'workout';
      const result = await shareImage(url, `minimal-fitness-${workout.type.toLowerCase()}-${day}.png`, `My ${workout.type.toLowerCase()}`);
      setNote(result === 'saved' ? 'Image saved to your downloads.' : '');
    } catch (e) {
      // Dismissing the share sheet is not an error worth showing.
      const msg = e instanceof Error ? e.message : '';
      setNote(/cancel/i.test(msg) ? '' : 'Could not share the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Share card" icon={<Share2 className="w-4 h-4 text-violet-300" />}>
      <div className="rounded-2xl overflow-hidden border border-[#1A1E26] bg-black">
        {url ? <img src={url} alt="Preview of your workout share image" className="w-full block" /> : <div className="aspect-[4/5] flex items-center justify-center text-xs text-neutral-400">Drawing…</div>}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={!url || busy}
        className="mt-3 w-full py-3 rounded-2xl text-sm font-extrabold text-black disabled:opacity-40"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {busy ? 'Opening…' : 'Share image'}
      </button>
      {note && <p className="text-xs text-neutral-400 mt-2 text-center">{note}</p>}
      <p className="text-xs text-neutral-400 mt-2 leading-relaxed text-center">
        The picture is drawn on your phone from your own data. It leaves the phone only if you pick an app in the share sheet.
      </p>
    </Modal>
  );
};
