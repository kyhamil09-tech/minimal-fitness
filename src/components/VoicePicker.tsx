import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { VoiceChoice, hasNativeTracker, listVoices, openVoiceSettings, previewVoice } from '../lib/tracker';
import { usePrefs } from '../lib/prefs';

const QUALITY: Record<number, string> = { 100: 'very low', 200: 'low', 300: 'normal', 400: 'high', 500: 'very high' };

/** "en-us-x-tpf-local" becomes "tpf": the part that tells two voices of the same language apart. */
export const voiceCode = (name: string): string => /-x-([a-z0-9]+)/i.exec(name)?.[1] ?? name;

/** A line for the picker: its place in the list, how good it is, and whether it needs a connection. */
export const voiceLabel = (v: VoiceChoice, index: number, auto: boolean): string =>
  `Voice ${index + 1}${auto ? ' (best)' : ''} - ${QUALITY[v.quality] ?? 'normal'} quality${v.online ? ', needs internet' : ''} - ${voiceCode(v.name)}`;

/** Pick the voice that says Run, Walk and the countdown, and hear it before choosing. Shown only inside the Android app. */
export const VoicePicker: React.FC = () => {
  const { prefs, setPrefs } = usePrefs();
  const [voices, setVoices] = useState<VoiceChoice[] | null>(null);
  const [auto, setAuto] = useState('');
  const native = hasNativeTracker();

  useEffect(() => {
    if (!native) return;
    let live = true;
    void listVoices().then((r) => {
      if (!live) return;
      setVoices(r.voices);
      setAuto(r.auto);
    });
    return () => {
      live = false;
    };
  }, [native]);

  if (!native) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          aria-label="Voice for interval cues"
          value={prefs.intervalVoiceName}
          onChange={(e) => setPrefs({ intervalVoiceName: e.target.value })}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-xs text-white"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}
        >
          <option value="">Automatic: the best voice installed</option>
          {(voices ?? []).map((v, i) => (
            <option key={v.name} value={v.name}>
              {voiceLabel(v, i, v.name === auto)}
            </option>
          ))}
        </select>
        <button
          onClick={() => void previewVoice(prefs.intervalVoiceName || auto, 'Run for one minute. Walk in ten seconds. Three, two, one. Walk.')}
          aria-label="Hear this voice"
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Volume2 className="h-4 w-4" /> Hear it
        </button>
      </div>
      {voices !== null && voices.length === 0 && <p className="text-xs text-neutral-400">No voices were found for your language. Install one below.</p>}
      <button onClick={() => void openVoiceSettings()} className="text-xs font-bold text-neutral-300 underline underline-offset-2">
        Get a more natural voice (Android text-to-speech settings)
      </button>
    </div>
  );
};
