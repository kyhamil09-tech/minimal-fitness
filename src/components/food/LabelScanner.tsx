import React, { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, Image as ImageIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LabelScan } from '../../lib/native';
import { ParsedLabel, mainFound, parseLabel, rowsFromLines } from '../../lib/labelScan';
import { haptic } from '../../lib/haptics';

interface Props {
  onBack: () => void;
  /** Called with what was read (possibly little or nothing: the person checks and fills in the rest). */
  onRead: (p: ParsedLabel) => void;
}

const MAX_SIDE = 1800;

/** Photograph a nutrition facts label (or pick a photo of one) and have the phone read the numbers. Nothing leaves the phone. */
export const LabelScanner: React.FC<Props> = ({ onBack, onRead }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
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

  const process = async (source: CanvasImageSource, width: number, height: number) => {
    setBusy(true);
    setNote('');
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
      const { lines } = await LabelScan.read({ image });
      const parsed = parseLabel(rowsFromLines(lines));
      stop();
      haptic.success();
      if (mainFound(parsed) === 0) setNote('');
      onRead(parsed);
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : 'The label could not be read. Try again with more light, holding the phone flat above the label.');
    } finally {
      setBusy(false);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    void process(v, v.videoWidth, v.videoHeight);
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      void process(img, img.naturalWidth, img.naturalHeight).finally(() => URL.revokeObjectURL(url));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setNote('That picture could not be opened.');
    };
    img.src = url;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center gap-3 px-4 pt-1 pb-2">
        <button aria-label="Back" onClick={() => { stop(); onBack(); }} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>Scan the nutrition label</h2>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          The picture is read on this phone and is not saved or sent anywhere. Hold the phone flat above the “Nutrition Facts” panel, in good light, with the whole table in view.
        </p>
        {!native && <p className="text-xs" style={{ color: 'var(--g-yellow)' }}>Label reading works in the Android app. In a browser you can still type the numbers in.</p>}
        {live ? (
          <div className="rounded-3xl overflow-hidden relative" style={{ backgroundColor: 'var(--card)' }}>
            <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover" />
            <div className="absolute inset-6 rounded-2xl border-2 border-dashed pointer-events-none" style={{ borderColor: 'var(--accent)' }} />
            <button onClick={capture} disabled={busy} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-extrabold disabled:opacity-60" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
              {busy ? 'Reading…' : 'Capture'}
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
          Choose a photo of the label
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {note && (
          <p role="alert" className="text-xs" style={{ color: 'var(--g-red)' }}>
            {note}
          </p>
        )}
        <button onClick={() => onRead({ basis: 'serving', micros: {}, found: [] })} className="w-full text-center text-xs underline py-2" style={{ color: 'var(--ink-dim)' }}>
          Skip and type the numbers in myself
        </button>
      </div>
    </div>
  );
};
