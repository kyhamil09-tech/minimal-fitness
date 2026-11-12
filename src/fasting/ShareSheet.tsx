import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { FastingSession } from '../types/health';
import { StoryData, buildFastStory, renderStoryCard } from '../lib/storyCards';
import { getCardSkin } from '../lib/cardSkin';
import { shareImage } from '../lib/shareImage';
import { stageAt } from './content';
import { Sheet } from './ui';

/** A picture of a finished fast (hours, goal and stage) in your current look, sent through the phone's share sheet. Made on the phone. */
export const ShareSheet: React.FC<{ fast: FastingSession | null; onClose: () => void }> = ({ fast, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fast) return undefined;
    let live = true;
    const data: StoryData = buildFastStory(fast.actualHours ?? 0, fast.targetDurationHours, stageAt(fast.actualHours ?? 0).name, fast.fastProtocolName, fast.endTimestamp ?? Date.now());
    void renderStoryCard(data, getCardSkin()).then((u) => live && setUrl(u));
    return () => {
      live = false;
      setUrl(null);
      setNote('');
    };
  }, [fast]);

  const send = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const r = await shareImage(url, `minimal-fitness-fast-${new Date().toISOString().slice(0, 10)}.png`, 'My fast');
      setNote(r === 'saved' ? 'Image saved to your downloads.' : '');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setNote(/cancel/i.test(msg) ? '' : 'Could not share the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!fast} onClose={onClose} title="Share your fast">
      {url ? <img src={url} alt="Your fast as a picture" className="mx-auto max-h-[55vh] rounded-2xl border" style={{ borderColor: 'var(--fa-line)' }} /> : <p className="fa-dim py-10 text-center text-sm">Making the picture…</p>}
      <button type="button" className="fa-btn mt-4 w-full" onClick={() => void send()} disabled={!url || busy}>
        <Share2 className="h-5 w-5" aria-hidden="true" /> Share
      </button>
      {note && <p className="fa-dim mt-2 text-center text-xs">{note}</p>}
      <p className="fa-dim mt-2 text-center text-xs">Drawn on your phone. It leaves only if you pick an app in the share sheet.</p>
    </Sheet>
  );
};
