import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { StoryData, renderStoryCard } from '../lib/storyCards';
import { getCardSkin } from '../lib/cardSkin';
import { shareImage } from '../lib/shareImage';
import { haptic } from '../lib/haptics';

/** Previews a story card (week, streak or milestone) in your current look and sends it through the phone's share sheet. */
export const StoryShareModal: React.FC<{ data: StoryData; name: string; onClose: () => void }> = ({ data, name, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    void renderStoryCard(data, getCardSkin()).then((u) => {
      if (live) {
        setUrl(u);
        haptic.success();
      }
    });
    return () => {
      live = false;
    };
  }, [data]);

  const send = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const result = await shareImage(url, `minimal-fitness-${name}-${day}.png`, 'My progress');
      setNote(result === 'saved' ? 'Image saved to your downloads.' : '');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setNote(/cancel/i.test(msg) ? '' : 'Could not share the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Share your progress" icon={<Share2 className="w-4 h-4 text-violet-300" />}>
      <div className="rounded-2xl overflow-hidden border border-[#1A1E26] mx-auto" style={{ maxWidth: 260 }}>
        {url ? (
          <img src={url} alt="Preview of your story card" className="w-full block pop-in" />
        ) : (
          <div className="aspect-[9/16] flex items-center justify-center text-xs text-neutral-400">Drawing...</div>
        )}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={!url || busy}
        className="mt-3 w-full py-3 rounded-2xl text-sm font-extrabold disabled:opacity-40"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {busy ? 'Opening...' : 'Share to a story'}
      </button>
      {note && <p className="text-xs text-neutral-400 mt-2 text-center">{note}</p>}
      <p className="text-xs text-neutral-400 mt-2 leading-relaxed text-center">
        Drawn on your phone from your own numbers, in the look you chose. It leaves the phone only if you pick an app in the share sheet.
      </p>
    </Modal>
  );
};
