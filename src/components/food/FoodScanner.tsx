import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ScanBarcode } from 'lucide-react';
import { FoodRecord } from '../../lib/foodDb';
import { lookupPackaged } from '../../lib/barcode';
import { haptic } from '../../lib/haptics';

interface Props {
  onBack: () => void;
  onFound: (rec: FoodRecord) => void;
}

/** Scan a barcode with the camera (where the phone supports it) or type the digits; the number alone is looked up on Open Food Facts. */
export const FoodScanner: React.FC<Props> = ({ onBack, onFound }) => {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices;

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => stop, []);

  const lookup = async (digits: string) => {
    setState('loading');
    setError('');
    try {
      const rec = await lookupPackaged(digits);
      if (!rec) {
        setState('notfound');
        return;
      }
      haptic.success();
      onFound(rec);
    } catch (e: any) {
      setState('error');
      setError(e?.message || 'Lookup failed. Check your connection.');
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      setTimeout(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const loop = async () => {
          if (!streamRef.current) return;
          try {
            const found = await detector.detect(video);
            if (found.length > 0) {
              setCode(found[0].rawValue);
              stop();
              void lookup(found[0].rawValue);
              return;
            }
          } catch {
            // frame not ready
          }
          setTimeout(loop, 300);
        };
        loop();
      }, 50);
    } catch {
      setState('error');
      setError('Camera access was denied or is unavailable. You can type the number instead.');
    }
  };

  const digits = code.replace(/\D/g, '');
  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center gap-3 px-4 pt-1 pb-2">
        <button aria-label="Back" onClick={() => { stop(); onBack(); }} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>Scan a barcode</h2>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 space-y-3">
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          Only the barcode number is sent, to Open Food Facts (a public food database), and only when you scan or look it up.
        </p>
        {scanning ? (
          <div className="rounded-3xl overflow-hidden relative" style={{ backgroundColor: 'var(--card)' }}>
            <video ref={videoRef} playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute inset-x-8 top-1/2 h-0.5 rounded-full" style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />
            <button onClick={stop} className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: 'var(--card)', color: 'var(--ink)' }}>
              Stop camera
            </button>
          </div>
        ) : (
          canScan && (
            <button onClick={start} className="w-full rounded-3xl border py-10 flex flex-col items-center gap-2" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}>
              <ScanBarcode className="w-10 h-10" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-bold">Open the camera</span>
            </button>
          )
        )}
        {!canScan && <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>This phone cannot scan with the camera here, so type the number printed under the barcode.</p>}
        <div className="flex gap-2">
          <input
            aria-label="Barcode number"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && digits.length >= 6 && void lookup(digits)}
            placeholder="Barcode digits"
            className="flex-1 min-w-0 rounded-2xl border px-4 py-3 text-sm outline-none"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          />
          <button
            onClick={() => void lookup(digits)}
            disabled={digits.length < 6 || state === 'loading'}
            className="px-5 rounded-2xl text-sm font-extrabold disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {state === 'loading' ? '...' : 'Look up'}
          </button>
        </div>
        {state === 'notfound' && <p role="status" className="text-xs" style={{ color: 'var(--g-yellow)' }}>That product is not in the database. You can create it yourself with Create food.</p>}
        {state === 'error' && <p role="alert" className="text-xs" style={{ color: 'var(--g-red)' }}>{error}</p>}
      </div>
    </div>
  );
};
