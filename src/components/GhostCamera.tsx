import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
import { useT } from '../lib/i18n';

interface Props {
  /** Your last photo of this pose, drawn faintly over the live picture so you can line up the same way. */
  ghostUrl?: string;
  onCapture: (photo: Blob) => void;
  onClose: () => void;
}

const TIMERS = [0, 5, 10] as const;

/**
 * A camera for progress photos: a faint copy of your last photo of the same pose over the picture, a rule-of-thirds grid, a self-timer so
 * you can step back, and a switch between the front and back camera. The picture goes straight to your progress photos on this phone.
 * With the front camera the preview and the overlay are both mirrored (like a mirror), while the saved photo is not.
 */
export const GhostCamera: React.FC<Props> = ({ ghostUrl, onCapture, onClose }) => {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [opacity, setOpacity] = useState(0.35);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let live = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (!live || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        setError('');
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(t(name === 'NotAllowedError' || name === 'SecurityError' ? 'gc.error.denied' : 'gc.error.other'));
      }
    })();
    return () => {
      live = false;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [facing]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.92);
  };

  // The countdown: one tick a second, then the photo.
  useEffect(() => {
    if (count === null) return;
    if (count <= 0) {
      setCount(null);
      snap();
      return;
    }
    const id = window.setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = () => (timer === 0 ? snap() : setCount(timer));
  const mirror = facing === 'user' ? 'scaleX(-1)' : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('gc.title')} data-layout-guard="lyt_spacer_ghost_04f2" className="fixed inset-0 z-[90] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} aria-label={t('gc.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-sm font-bold">{t('gc.title')}</span>
        <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label={t('gc.flip')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative mx-auto aspect-[3/4] w-full max-w-md flex-1 overflow-hidden bg-neutral-900" style={{ maxHeight: '68vh' }}>
        <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" style={{ transform: mirror }} aria-label={t('gc.title')} />
        {ghostUrl && <img src={ghostUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity, transform: mirror }} />}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className={`${i % 3 !== 2 ? 'border-r' : ''} ${i < 6 ? 'border-b' : ''} border-white/20`} />
          ))}
        </div>
        {count !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30" role="status" aria-live="assertive">
            <span className="text-8xl font-extrabold tabular-nums">{count}</span>
            <span className="text-sm">{t('gc.count', { n: count })}</span>
          </div>
        )}
        {error && (
          <p role="alert" className="absolute inset-x-4 top-1/3 rounded-xl bg-black/80 p-4 text-sm">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="text-center text-xs text-white/80">{ghostUrl ? t('gc.hint') : t('gc.noGhost')}</p>
        {ghostUrl && (
          <label className="flex items-center gap-3 text-xs">
            <span className="w-44 shrink-0">{t('gc.ghost', { n: Math.round(opacity * 100) })}</span>
            <input type="range" min={0} max={0.75} step={0.05} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full" />
          </label>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setTimer((cur) => TIMERS[(TIMERS.indexOf(cur) + 1) % TIMERS.length])}
            className="min-h-11 rounded-full bg-white/15 px-4 text-xs font-bold"
          >
            {t('gc.timer', { s: timer === 0 ? t('gc.timerOff') : t('gc.timerSec', { n: timer }) })}
          </button>
          <button type="button" onClick={shoot} disabled={!!error || count !== null} aria-label={t('gc.shutter')} className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black disabled:opacity-40">
            <Camera className="h-7 w-7" aria-hidden="true" />
          </button>
          <span className="w-24" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};
