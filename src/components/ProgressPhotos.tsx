import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import { BodyEntry, UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { ProgressPhoto, deletePhoto, listPhotos, savePhoto, shrinkImage } from '../lib/photoStore';
import { shortMonthDay, todayKey } from '../lib/dates';
import { cmToDisplay, kgToDisplay, lengthUnit, weightUnit } from '../lib/units';
import { sortedBodyEntries } from '../lib/calc';
import { GhostCamera } from './GhostCamera';
import { useT } from '../lib/i18n';

const POSES: { id: ProgressPhoto['pose']; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'other', label: 'Other' },
];

interface Props {
  theme: ColorPalette;
  body: BodyEntry[];
  units: UnitSystem;
}

/** Changes since your first entry for each tape measurement and weight. */
const changes = (body: BodyEntry[], units: UnitSystem) => {
  const rows = sortedBodyEntries(body);
  if (rows.length < 2) return [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const out: { label: string; delta: number; unit: string }[] = [];
  const add = (label: string, a: number | undefined, b: number | undefined, conv: (v: number) => number, unit: string) => {
    if (a === undefined || b === undefined) return;
    out.push({ label, delta: Math.round((conv(b) - conv(a)) * 10) / 10, unit });
  };
  add('Weight', first.weightKg, last.weightKg, (v) => kgToDisplay(v, units), weightUnit(units));
  add('Body fat', first.bodyFatPct, last.bodyFatPct, (v) => v, '%');
  for (const [key, label] of [['waistCm', 'Waist'], ['chestCm', 'Chest'], ['hipsCm', 'Hips'], ['armCm', 'Arm']] as const) {
    add(label, first[key], last[key], (v) => cmToDisplay(v, units), lengthUnit(units));
  }
  return out;
};

/** Progress photos kept only on this phone, with a side-by-side compare and the change in each measurement since you began. */
export const ProgressPhotos: React.FC<Props> = ({ theme, body, units }) => {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pose, setPose] = useState<ProgressPhoto['pose']>('front');
  const [picked, setPicked] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const t = useT();
  const [cam, setCam] = useState(false);

  const refresh = useCallback(async () => setPhotos(await listPhotos()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Object URLs for the thumbnails; released when the list changes or the panel closes.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of photos) next[p.id] = URL.createObjectURL(p.blob);
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const saveBlob = async (f: Blob) => {
    setBusy(true);
    setError('');
    try {
      const blob = await shrinkImage(f);
      await savePhoto({ id: `ph-${Date.now()}`, date: todayKey(), pose, blob });
      await refresh();
    } catch {
      setError('That photo could not be saved. Try a different one.');
    } finally {
      setBusy(false);
    }
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await saveBlob(f);
  };
  /** Your most recent photo of the chosen pose, shown faintly in the guided camera. */
  const ghost = photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)))[0];

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const remove = async (id: string) => {
    await deletePhoto(id);
    setPicked((p) => p.filter((x) => x !== id));
    setViewing(null);
    await refresh();
  };

  const ch = changes(body, units);
  const cmp = picked.length === 2 ? picked.map((id) => photos.find((p) => p.id === id)).filter((p): p is ProgressPhoto => !!p) : [];
  const view = viewing ? photos.find((p) => p.id === viewing) : undefined;

  return (
    <>
      {ch.length > 0 && (
        <section className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <h3 className="text-sm font-bold text-neutral-200">Change since your first entry</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {ch.map((c) => (
              <div key={c.label} className="rounded-2xl bg-black/40 border border-[#1A1E26] p-2.5">
                <div className="text-base font-bold font-mono text-white">
                  {c.delta > 0 ? '+' : ''}
                  {c.delta}
                  <span className="text-xs text-neutral-400"> {c.unit}</span>
                </div>
                <div className="text-xs text-neutral-400">{c.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-200">Progress photos</h3>
          <span className="text-xs text-neutral-400">Only on this phone, in manual backups</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1" role="group" aria-label="Pose">
            {POSES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPose(p.id)}
                aria-pressed={pose === p.id}
                className="px-2.5 py-1.5 rounded-full text-xs font-bold border"
                style={{ background: pose === p.id ? theme.primary : 'transparent', color: pose === p.id ? 'var(--on-accent)' : '#9aa3b2', borderColor: pose === p.id ? 'transparent' : '#1A1E26' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="ml-auto px-3.5 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: theme.primary, color: 'var(--on-accent)' }}
          >
            <Camera className="w-4 h-4" /> {busy ? 'Saving…' : 'Add photo'}
          </button>
          <button
            onClick={() => setCam(true)}
            disabled={busy}
            className="px-3.5 py-2 rounded-full text-xs font-extrabold border disabled:opacity-50"
            style={{ borderColor: theme.primary, color: theme.primary }}
          >
            {t('gc.open')}
          </button>
          <input ref={input} type="file" accept="image/*" onChange={onFile} className="hidden" aria-label="Choose a progress photo" />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}

        {photos.length === 0 ? (
          <p className="text-xs text-neutral-400">Take a photo in the same light and pose every few weeks. Pick two to compare them side by side.</p>
        ) : (
          <>
            <p className="text-xs text-neutral-400">Tap a photo to open it. Select two (the tick) to compare.</p>
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <li key={p.id} className="relative aspect-[3/4] rounded-xl overflow-hidden border" style={{ borderColor: picked.includes(p.id) ? theme.primary : '#1A1E26' }}>
                  <button onClick={() => setViewing(p.id)} aria-label={`Open ${p.pose} photo from ${shortMonthDay(p.date)}`} className="absolute inset-0">
                    {urls[p.id] && <img src={urls[p.id]} alt="" className="w-full h-full object-cover" />}
                  </button>
                  <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-xs font-bold text-white" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
                    {shortMonthDay(p.date)} · {p.pose}
                  </div>
                  <button
                    onClick={() => toggle(p.id)}
                    aria-pressed={picked.includes(p.id)}
                    aria-label="Select to compare"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-extrabold"
                    style={{ background: picked.includes(p.id) ? theme.primary : 'rgba(0,0,0,0.55)', color: picked.includes(p.id) ? 'var(--on-accent)' : '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                  >
                    {picked.includes(p.id) ? picked.indexOf(p.id) + 1 : ''}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {cmp.length === 2 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[...cmp].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p, i) => (
              <figure key={p.id} className="rounded-xl overflow-hidden border border-[#1A1E26]">
                {urls[p.id] && <img src={urls[p.id]} alt={`${i === 0 ? 'Earlier' : 'Later'} photo`} className="w-full aspect-[3/4] object-cover" />}
                <figcaption className="text-xs text-center py-1 text-neutral-300">
                  {i === 0 ? 'Before' : 'After'} · {shortMonthDay(p.date)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {cam && (
        <GhostCamera
          ghostUrl={ghost ? urls[ghost.id] : undefined}
          onClose={() => setCam(false)}
          onCapture={(b) => {
            setCam(false);
            void saveBlob(b);
          }}
        />
      )}

      {view && urls[view.id] && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Progress photo">
          <button onClick={() => setViewing(null)} aria-label="Close" className="absolute top-4 right-4 text-white p-2" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
            <X className="w-6 h-6" />
          </button>
          <img src={urls[view.id]} alt={`${view.pose} photo`} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
          <div className="mt-3 text-sm text-white">
            {shortMonthDay(view.date)} · {view.pose}
          </div>
          <button onClick={() => void remove(view.id)} className="mt-3 px-4 py-2 rounded-full text-xs font-bold text-rose-300 border border-rose-400/40 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Delete this photo
          </button>
        </div>
      )}
    </>
  );
};
