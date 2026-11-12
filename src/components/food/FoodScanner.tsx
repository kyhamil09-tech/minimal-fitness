import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ScanBarcode } from 'lucide-react';
import { FoodRecord } from '../../lib/foodDb';
import { lookupPackaged } from '../../lib/barcode';
import { cachedBarcode, rememberBarcode } from '../../lib/barcodeCache';
import { KEY_STORE, hasOwnKey, lookupUsda } from '../../lib/usda';
import { haptic } from '../../lib/haptics';
import { makeFrameReader } from '../../lib/barcodeScan';

interface Props {
  onBack: () => void;
  onFound: (rec: FoodRecord) => void;
  /** The person chose to read the label of a product that was not found (with its barcode). */
  onLabel?: (barcode: string) => void;
  /** The person chose to type a product in by hand (with its barcode, so the next scan finds it). */
  onCreate?: (barcode: string) => void;
}

/** Scan a barcode with the camera or type the digits; the number alone is looked up on Open Food Facts. */
export const FoodScanner: React.FC<Props> = ({ onBack, onFound, onLabel, onCreate }) => {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [usda, setUsda] = useState<'idle' | 'loading' | 'none'>('idle');
  const [usdaError, setUsdaError] = useState('');
  const [keyText, setKeyText] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Any phone with a camera can scan: when the browser has no barcode detector the frames are decoded in the app (lib/barcodeScan).
  const canScan = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => stop, []);

  const lookup = async (digits: string) => {
    setState('loading');
    setError('');
    setUsda('idle');
    setUsdaError('');
    try {
      // A food scanned before works with no signal.
      const saved = cachedBarcode(digits);
      if (saved) {
        haptic.success();
        onFound(saved);
        return;
      }
      const rec = await lookupPackaged(digits);
      if (!rec) {
        setState('notfound');
        return;
      }
      rememberBarcode(rec);
      haptic.success();
      onFound(rec);
    } catch (e: any) {
      setState('error');
      setError(e instanceof TypeError || /failed to fetch|network/i.test(String(e?.message)) ? 'No connection, and this barcode is not saved on the phone yet. Scan it once with a connection and it will work offline after that. You can also create the food yourself.' : e?.message || 'Lookup failed. Check your connection.');
    }
  };

  /** The second look, only when asked for: the USDA branded-food list. Sends the barcode digits and nothing else. */
  const askUsda = async (digits: string) => {
    setUsda('loading');
    setUsdaError('');
    try {
      const rec = await lookupUsda(digits);
      if (!rec) {
        setUsda('none');
        return;
      }
      rememberBarcode({ ...rec, barcode: rec.barcode ?? digits });
      haptic.success();
      onFound(rec);
    } catch (e) {
      setUsda('idle');
      setUsdaError(e instanceof Error ? e.message : 'The USDA lookup failed.');
    }
  };

  const saveKey = () => {
    try {
      const k = keyText.trim();
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      // not saved
    }
    setKeyOpen(false);
    setUsdaError('');
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
        const reader = makeFrameReader();
        const loop = async () => {
          if (!streamRef.current) return;
          try {
            const found = await reader.read(video);
            if (found) {
              setCode(found);
              stop();
              void lookup(found);
              return;
            }
          } catch {
            // frame not ready
          }
          setTimeout(loop, 250);
        };
        loop();
      }, 50);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setState('error');
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'The camera is switched off for this app. Turn on Camera for Minimal Fitness in Android Settings, Apps, Permissions, or type the number instead.'
          : name === 'NotFoundError'
            ? 'No camera was found on this phone. You can type the number instead.'
            : 'The camera could not be opened. You can type the number instead.'
      );
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
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          Only the barcode number is sent, to Open Food Facts (a public food database), and only when you scan or look it up.
        </p>
        {scanning ? (
          <div className="rounded-3xl overflow-hidden relative" style={{ backgroundColor: 'var(--card)' }}>
            <video ref={videoRef} playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute inset-x-8 top-1/2 h-0.5 rounded-full" style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />
            <button onClick={stop} className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--card)', color: 'var(--ink)' }}>
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
        {!canScan && <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>This phone cannot scan with the camera here, so type the number printed under the barcode.</p>}
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
        {state === 'notfound' && (
          <div role="status" className="rounded-3xl border p-4 space-y-2.5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Open Food Facts does not have this one</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              {usda === 'none' ? 'The USDA list does not have it either.' : 'You have three more ways to get it in:'}
            </p>
            {usda !== 'none' && (
              <button onClick={() => void askUsda(digits)} disabled={usda === 'loading'} className="w-full rounded-2xl border px-4 py-3 text-left disabled:opacity-60" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
                <span className="block text-[13px] font-bold">{usda === 'loading' ? 'Asking USDA…' : 'Search the USDA branded-food list'}</span>
                <span className="block text-xs" style={{ color: 'var(--ink-dim)' }}>
                  US government database of US products. Only the barcode digits are sent{hasOwnKey() ? ', with your own key' : ", using USDA's shared key"}.
                </span>
              </button>
            )}
            {onLabel && (
              <button onClick={() => onLabel(digits)} className="w-full rounded-2xl border px-4 py-3 text-left" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
                <span className="block text-[13px] font-bold">Scan the nutrition label</span>
                <span className="block text-xs" style={{ color: 'var(--ink-dim)' }}>Photograph the label. It is read on this phone, and saved so the next scan of this barcode finds it.</span>
              </button>
            )}
            {onCreate && (
              <button onClick={() => onCreate(digits)} className="w-full rounded-2xl border px-4 py-3 text-left" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
                <span className="block text-[13px] font-bold">Type it in</span>
                <span className="block text-xs" style={{ color: 'var(--ink-dim)' }}>Enter the numbers yourself. The barcode is remembered for next time.</span>
              </button>
            )}
            {usdaError && <p role="alert" className="text-xs" style={{ color: 'var(--g-red)' }}>{usdaError}</p>}
            <button onClick={() => setKeyOpen((v) => !v)} className="text-xs underline" style={{ color: 'var(--ink-dim)' }}>
              {keyOpen ? 'Hide' : hasOwnKey() ? 'Change my USDA key' : 'Use my own free USDA key'}
            </button>
            {keyOpen && (
              <div className="flex gap-2">
                <input aria-label="USDA key" value={keyText} onChange={(e) => setKeyText(e.target.value)} placeholder="Paste a free key from api.data.gov (or leave empty)" autoCapitalize="none" autoComplete="off" className="flex-1 min-w-0 rounded-xl border px-3 py-2 text-xs outline-none" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--hairline)', color: 'var(--ink)' }} />
                <button onClick={saveKey} className="px-3 rounded-xl text-xs font-extrabold" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>Save</button>
              </div>
            )}
          </div>
        )}
        {state === 'error' && <p role="alert" className="text-xs" style={{ color: 'var(--g-red)' }}>{error}</p>}
      </div>
    </div>
  );
};
