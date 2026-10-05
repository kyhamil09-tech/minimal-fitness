import React, { useEffect, useState } from 'react';
import { Download, Map as MapIcon, Trash2 } from 'lucide-react';
import { isAndroidApp, MapPack } from '../lib/native';
import { MapPackInfo, describePack, formatSize, readPacks, writePacks } from '../lib/mapPacks';
import { forgetPack } from '../lib/mapPackLayer';
import { ColorPalette } from '../types/theme';

/** Import, list and remove offline map files. A pack covering where you run replaces the online map there, so no map server is asked for tiles. */
export const MapPacksPanel: React.FC<{ theme: ColorPalette }> = ({ theme }) => {
  const [packs, setPacks] = useState<MapPackInfo[]>(() => readPacks());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const android = isAndroidApp();

  const save = (next: MapPackInfo[]) => {
    setPacks(next);
    writePacks(next);
  };

  // Forget packs whose file is gone (after a restore or a reinstall).
  useEffect(() => {
    if (!android) return;
    void MapPack.list()
      .then(({ packs: files }) => {
        const have = new Set(files.map((f) => f.id));
        const kept = readPacks().filter((p) => have.has(p.id));
        if (kept.length !== readPacks().length) save(kept);
      })
      .catch(() => undefined);
  }, [android]);

  const add = async () => {
    setBusy(true);
    setMessage('');
    setProgress('');
    const sub = await MapPack.addListener('progress', (p) => setProgress(`Copying… ${formatSize(p.copied)}${p.total > 0 ? ` of ${formatSize(p.total)}` : ''}`)).catch(() => null);
    try {
      const file = await MapPack.importPack();
      try {
        const info = await describePack(file.id, file.name, file.size, async (id, offset, length) => (await MapPack.read({ id, offset, length })).data);
        save([...readPacks(), info]);
        setMessage(`Added ${info.name} (${info.kind === 'vector' ? 'vector' : 'picture'} map, ${formatSize(info.sizeBytes)}).`);
      } catch (e) {
        await MapPack.remove({ id: file.id }).catch(() => undefined);
        setMessage(e instanceof Error ? e.message : 'That file could not be used.');
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setMessage(m === 'cancelled' || !m ? '' : m);
    } finally {
      await sub?.remove();
      setBusy(false);
      setProgress('');
    }
  };

  const remove = async (p: MapPackInfo) => {
    await MapPack.remove({ id: p.id }).catch(() => undefined);
    forgetPack(p.id);
    save(readPacks().filter((x) => x.id !== p.id));
  };

  return (
    <section className="rounded-[28px] border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Offline maps</h3>
        </div>
        {android && (
          <button type="button" onClick={() => void add()} disabled={busy} className="px-3.5 py-1.5 rounded-full glass-chip text-[11px] font-bold text-white flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" style={{ color: theme.primary }} /> {busy ? 'Working…' : 'Add a map file'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        Where a map file covers your run, the map draws from it with no internet. The app never downloads maps for you (free map servers forbid bulk downloads), so you bring the file: a <b>.pmtiles</b> file saved on your phone.
        Protomaps (protomaps.com) lets you download a region of the world as one; picture-tile PMTiles files work too. Files stay in this app's private storage.
      </p>
      {!android && <p className="text-[11px] text-amber-300">Offline maps work in the Android app.</p>}
      {progress && <p className="text-[11px] text-neutral-300" role="status">{progress}</p>}
      {message && <p className="text-[11px] text-emerald-300" role="status">{message}</p>}
      {packs.length === 0 ? (
        <div className="rounded-2xl glass-inset p-3.5 text-xs text-neutral-400">No map files yet. Online maps are used, and tiles you have looked at are remembered.</div>
      ) : (
        <div className="space-y-2">
          {packs.map((p) => (
            <div key={p.id} className="rounded-2xl glass-inset p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{p.name}</div>
                <div className="text-[11px] text-neutral-400">
                  {p.kind === 'vector' ? 'Vector map' : 'Picture map'} · zoom {p.minZoom}–{p.maxZoom} · {formatSize(p.sizeBytes)}
                </div>
              </div>
              <button type="button" onClick={() => void remove(p)} aria-label={`Remove ${p.name}`} className="p-1.5 text-neutral-500 hover:text-rose-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
