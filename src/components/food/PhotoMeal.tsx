import React, { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, Image as ImageIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LabelScan } from '../../lib/native';
import { FoodRecord, defaultAmount, displayName, nutrientsFor } from '../../lib/foodDb';
import { PhotoSuggestion, suggestFoods } from '../../lib/foodPhoto';
import { haptic } from '../../lib/haptics';

interface Props {
  onBack: () => void;
  /** Looks a word up in the app's own food list. */
  findFoods: (q: string) => FoodRecord[];
  /** The person picked a food: the usual screen for choosing the amount opens. */
  onPick: (rec: FoodRecord) => void;
}

const MAX_SIDE = 1024;

/**
 * Photograph a meal and get suggestions for what is on the plate. An image model inside the app names what it sees (pizza, salad, banana,
 * rice...), each name is looked up in the food list, and you tap the right ones and set the amount. It cannot see portion sizes or tell
 * similar dishes apart, so it suggests and you decide. The picture is not saved or sent anywhere.
 */
export const PhotoMeal: React.FC<Props> = ({ onBack, findFoods, onPick }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<PhotoSuggestion[] | null>(null);
  const native = Capacitor.isNativePlatform();
  const canCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  };
  useEffect(() => stop, []);

  const start = async () => {
    setNote('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } } });
      streamRef.current = stream;
      setLive(true);
      setTimeout(async () => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }, 50);
    } catch {
      setNote('The camera could not be opened. Check that Camera is allowed for this app, or choose a photo instead.');
    }
  };

  const look = async (source: CanvasImageSource, width: number, height: number) => {
    setBusy(true);
    setNote('');
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      const { labels } = await LabelScan.labels({ image });
      const found = suggestFoods(labels, findFoods);
      stop();
      haptic.success();
      setResult(found);
      if (found.length === 0) setNote('Nothing on the plate could be matched to a food. Try a closer photo in good light, or search for it by name.');
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : 'The photo could not be looked at. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    void look(v, v.videoWidth, v.videoHeight);
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => void look(img, img.naturalWidth, img.naturalHeight).finally(() => URL.revokeObjectURL(url));
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setNote('That picture could not be opened.');
    };
    img.src = url;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center gap-3 px-4 pt-1 pb-2">
        <button
          aria-label="Back"
          onClick={() => {
            stop();
            onBack();
          }}
          className="round-btn !w-10 !h-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
          Photo of your meal
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3 pb-6">
        {!result && (
          <>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              The phone names what it sees and suggests foods. It cannot judge portions, so you pick the foods and set the amounts. The picture is looked at on this phone and is not saved or sent anywhere.
            </p>
            {!native && <p className="text-xs" style={{ color: 'var(--g-yellow)' }}>Photo suggestions work in the Android app.</p>}
            {live ? (
              <div className="rounded-3xl overflow-hidden relative" style={{ backgroundColor: 'var(--card)' }}>
                <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover" />
                <button onClick={capture} disabled={busy} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-extrabold disabled:opacity-60" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                  {busy ? 'Looking…' : 'Capture'}
                </button>
              </div>
            ) : (
              canCamera && (
                <button onClick={start} className="w-full rounded-3xl border py-10 flex flex-col items-center gap-2" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}>
                  <Camera className="w-10 h-10" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-bold">Open the camera</span>
                </button>
              )
            )}
            <label className="w-full rounded-2xl border px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold cursor-pointer" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}>
              <ImageIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Choose a photo
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
        {note && (
          <p role="alert" className="text-xs" style={{ color: result ? 'var(--ink-dim)' : 'var(--g-red)' }}>
            {note}
          </p>
        )}
        {result && result.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              Tap each food that is on your plate, then set the amount.
            </p>
            {result.map((s) => (
              <section key={s.label} aria-label={s.label}>
                <div className="stat-label mb-1">
                  {s.label} · {Math.round(s.confidence * 100)}% sure
                </div>
                <ul className="rounded-2xl border divide-y" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
                  {s.foods.map((f) => {
                    const a = defaultAmount(f);
                    const kcal = nutrientsFor(f, a.unit, a.qty).kcal;
                    return (
                      <li key={f.id} style={{ borderColor: 'var(--hairline)' }}>
                        <button onClick={() => onPick(f)} className="w-full min-h-12 px-4 py-2.5 flex items-center justify-between gap-3 text-left" aria-label={`${displayName(f)}, ${kcal} calories. Open`}>
                          <span className="min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                            {displayName(f)}
                          </span>
                          <span className="shrink-0 text-xs" style={{ color: 'var(--ink-dim)' }}>
                            {kcal} kcal
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {result && (
          <button
            onClick={() => {
              setResult(null);
              setNote('');
            }}
            className="w-full min-h-11 rounded-2xl border text-sm font-bold"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          >
            Take another photo
          </button>
        )}
      </div>
    </div>
  );
};
