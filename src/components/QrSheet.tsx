import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { makeQrReader } from '../lib/barcodeScan';

interface ShowProps {
  text: string;
  title: string;
  onClose: () => void;
}

/** A QR code of some text, drawn on the phone, for a friend standing next to you to scan. Nothing is sent anywhere. */
export const QrShow: React.FC<ShowProps> = ({ text, title, onClose }) => {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import('@zxing/library')
      .then((lib) => {
        if (!live || !box.current) return;
        const svg = new lib.BrowserQRCodeSvgWriter().write(text, 280, 280);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'QR code of the challenge');
        box.current.replaceChildren(svg);
      })
      .catch(() => setFailed(true));
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-xs text-[#9AA3B2]">Ask your friend to open Minimal Fitness, Friends and challenges, Scan a code, and point their camera at this.</p>
      <div ref={box} className="mx-auto w-[280px] h-[280px] rounded-xl bg-white p-2" />
      {failed && <p className="text-xs text-amber-300">The code could not be drawn. Use Invite to send it in a message instead.</p>}
    </Sheet>
  );
};

interface ScanProps {
  onText: (text: string) => void;
  onClose: () => void;
}

/** Reads a QR code with the camera and hands back the text inside. The camera picture never leaves the phone. */
export const QrScan: React.FC<ScanProps> = ({ onText, onClose }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let live = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = video.current;
        if (!v || !live) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        const reader = makeQrReader();
        const loop = async () => {
          if (!live) return;
          try {
            const found = await reader.read(v);
            if (found) {
              live = false;
              onText(found);
              return;
            }
          } catch {
            // frame not ready
          }
          setTimeout(loop, 250);
        };
        loop();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'The camera is switched off for this app. Turn on Camera for Minimal Fitness in Android Settings, or paste the code instead.' : 'The camera could not be opened. Paste the code instead.');
      }
    })();
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title="Scan a code" onClose={onClose}>
      {error ? <p className="text-xs text-amber-300">{error}</p> : <video ref={video} playsInline muted aria-label="Camera" className="w-full aspect-square rounded-xl object-cover bg-black" />}
    </Sheet>
  );
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70" onClick={onClose}>
    <div className="w-full max-w-md space-y-3 rounded-t-3xl bg-[#0B0D11] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-700 text-neutral-300">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
