import React, { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { VoiceLog, isAndroidApp } from '../lib/native';
import { VoiceResult, parseVoice } from '../lib/voiceLog';
import { NewFood } from './AddFoodModal';

interface Props {
  theme: ColorPalette;
  date: string;
  onAddFood: (date: string, food: NewFood) => void;
  onAddWater: (date: string, ml: number) => void;
}

/** Say what you ate or drank. Speech is turned into text by Android on the phone; nothing is recorded, saved or sent. */
export const VoiceLogCard: React.FC<Props> = ({ theme, date, onAddFood, onAddWater }) => {
  const [ready, setReady] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAndroidApp()) {
      setReady(false);
      return;
    }
    void VoiceLog.available().then((r) => setReady(r.available)).catch(() => setReady(false));
  }, []);

  if (ready === false) return null;
  if (ready === null) return null;

  const listen = async () => {
    setError('');
    setResult(null);
    setListening(true);
    try {
      const { text } = await VoiceLog.listen();
      setHeard(text);
      setResult(parseVoice(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not listen.');
    } finally {
      setListening(false);
    }
  };

  const confirm = () => {
    if (!result) return;
    for (const f of result.foods) {
      onAddFood(date, {
        meal: result.meal,
        name: f.qty === 1 ? f.item.name : `${f.qty} × ${f.item.name}`,
        calories: Math.round(f.item.calories * f.qty),
        proteinG: Math.round(f.item.proteinG * f.qty * 10) / 10,
        carbsG: Math.round(f.item.carbsG * f.qty * 10) / 10,
        fatG: Math.round(f.item.fatG * f.qty * 10) / 10,
      });
    }
    for (const w of result.water) onAddWater(date, w.ml);
    setResult(null);
    setHeard('');
  };

  const nothing = result && result.foods.length === 0 && result.water.length === 0;
  return (
    <section className="rounded-[22px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">Log by voice</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Try “two eggs and a banana” or “500 ml of water”. Works on the phone, no internet.</p>
        </div>
        <button
          type="button"
          onClick={() => void listen()}
          disabled={listening}
          aria-label="Start listening"
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-black disabled:opacity-60"
          style={{ backgroundColor: theme.primary, boxShadow: listening ? `0 0 0 6px ${theme.primary}33` : undefined }}
        >
          <Mic className="w-5 h-5" />
        </button>
      </div>
      {listening && <p className="text-xs text-neutral-300 mt-2" role="status">Listening…</p>}
      {error && <p className="text-xs text-amber-300 mt-2">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-neutral-500">Heard: “{heard}”</p>
          {result.foods.map((f, i) => (
            <div key={i} className="rounded-xl glass-inset px-3 py-2 text-xs text-white flex justify-between gap-2">
              <span>{f.qty === 1 ? '' : `${f.qty} × `}{f.item.name} <span className="text-neutral-500">({result.meal.toLowerCase()})</span></span>
              <span className="tabular-nums text-neutral-300">{Math.round(f.item.calories * f.qty)} kcal</span>
            </div>
          ))}
          {result.water.map((w, i) => (
            <div key={`w${i}`} className="rounded-xl glass-inset px-3 py-2 text-xs text-white flex justify-between">
              <span>Water</span>
              <span className="tabular-nums text-neutral-300">{w.ml} ml</span>
            </div>
          ))}
          {result.unmatched.length > 0 && <p className="text-[11px] text-amber-300">Not found in the foods list: {result.unmatched.join(', ')}. Add those by hand.</p>}
          {nothing ? (
            <p className="text-xs text-neutral-400">Nothing I could add from that. Try again, or add it by hand below.</p>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={confirm} className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-black" style={{ backgroundColor: theme.primary }}>
                Add these
              </button>
              <button type="button" onClick={() => setResult(null)} className="px-4 py-2.5 rounded-xl glass-chip text-xs text-neutral-300">
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
