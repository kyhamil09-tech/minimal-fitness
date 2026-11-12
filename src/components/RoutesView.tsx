import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronDown, ChevronUp, Download, FileUp, Flame, Navigation, Route as RouteIcon, Trash2, Trophy } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { MAP_STYLES } from '../lib/mapStyles';
import { addBaseMap } from '../lib/mapPackLayer';
import { MapPacksPanel } from './MapPacksPanel';
import { LatLng, routeToSvgPoints } from '../lib/geo';
import { RouteGroup, findRoutes, routeLabel, workoutPoints } from '../lib/routes';
import { SavedRoute, routeFromGpx } from '../lib/savedRoutes';
import { formatDuration, formatPaceSec } from '../lib/workoutStats';
import { distanceUnit, kmToDisplay } from '../lib/units';
import { shortMonthDay, toDateKey } from '../lib/dates';
import { gpxZip } from '../lib/gpxBundle';
import { downloadBinaryFile } from '../lib/backup';

const MAX_DRAWN = 600;

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  units: UnitSystem;
  onOpenWorkout: (w: WorkoutSession) => void;
  savedRoutes: SavedRoute[];
  onSaveRoute: (r: SavedRoute) => void;
  onDeleteRoute: (id: string) => void;
  /** Chooses a saved route for the next workout and returns to the Start view. */
  onFollow: (id: string) => void;
}

/** Routes you can follow: import a GPX file (a route from a website or another app), or save one of your own runs from its detail screen. */
const SavedRoutesSection: React.FC<Pick<Props, 'theme' | 'units' | 'savedRoutes' | 'onSaveRoute' | 'onDeleteRoute' | 'onFollow'>> = ({ theme, units, savedRoutes, onSaveRoute, onDeleteRoute, onFollow }) => {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    let added = 0;
    let failed = 0;
    for (const file of Array.from(list)) {
      try {
        const r = routeFromGpx(await file.text(), file.name);
        if (r) {
          onSaveRoute(r);
          added++;
        } else failed++;
      } catch {
        failed++;
      }
    }
    setMessage(`${added ? `Saved ${added} route${added === 1 ? '' : 's'}. ` : ''}${failed ? `${failed} file${failed === 1 ? '' : 's'} had no route in it.` : ''}`.trim());
    if (input.current) input.current.value = '';
  };

  return (
    <section className="rounded-[28px] border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Routes to follow</h3>
        </div>
        <button type="button" onClick={() => input.current?.click()} className="px-3.5 py-1.5 rounded-full glass-chip text-xs font-bold text-white flex items-center gap-1.5">
          <FileUp className="w-3.5 h-3.5" style={{ color: theme.primary }} /> Import GPX
        </button>
        <input ref={input} type="file" multiple accept=".gpx,application/gpx+xml,text/xml,application/xml" className="hidden" aria-label="Choose GPX files" onChange={(e) => void pick(e.target.files)} />
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed">
        Follow a line on the map with a buzz if you drift off it and a way back to the start. It needs only GPS, so it works with no signal. Save one of your own runs from its detail screen, or import a GPX file.
      </p>
      {message && <p className="text-xs text-emerald-300" role="status">{message}</p>}
      {savedRoutes.length === 0 ? (
        <div className="rounded-2xl glass-inset p-3.5 text-xs text-neutral-400">No saved routes yet.</div>
      ) : (
        <div className="space-y-2">
          {savedRoutes.map((r) => (
            <div key={r.id} className="rounded-2xl glass-inset p-3 flex items-center gap-3">
              <Thumb outline={r.points} color={theme.primary} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{r.name}</div>
                <div className="text-xs text-neutral-400">
                  {kmToDisplay(r.km, units, 1)} {distanceUnit(units)} · {r.source === 'gpx' ? 'GPX file' : 'your run'}
                </div>
              </div>
              {confirm === r.id ? (
                <span className="flex items-center gap-2 text-xs shrink-0">
                  <button type="button" onClick={() => { onDeleteRoute(r.id); setConfirm(null); }} className="text-rose-400 font-bold">Delete</button>
                  <button type="button" onClick={() => setConfirm(null)} className="text-neutral-400">Keep</button>
                </span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => onFollow(r.id)} className="px-3 py-1.5 rounded-full text-xs font-extrabold text-black" style={{ backgroundColor: theme.primary }}>
                    Follow
                  </button>
                  <button type="button" onClick={() => setConfirm(r.id)} aria-label={`Delete ${r.name}`} className="p-1.5 text-neutral-400 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const SPORT_CHIPS = ['All', 'Running', 'Walking', 'Hiking', 'Cycling'] as const;

/** Every route you have recorded drawn on one map: the places you go most glow brightest. */
const Heatmap: React.FC<{ theme: ColorPalette; lines: LatLng[][] }> = ({ theme, lines }) => {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || lines.length === 0) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, scrollWheelZoom: false, preferCanvas: true });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const canvas = L.canvas({ padding: 0.3 });
    const bounds = L.latLngBounds([]);
    for (const line of lines) line.forEach((p) => bounds.extend(p));
    const c = bounds.getCenter();
    addBaseMap(map, { url: MAP_STYLES.dark.url, attribution: MAP_STYLES.dark.attribution, maxZoom: MAP_STYLES.dark.maxZoom, maxNativeZoom: MAP_STYLES.dark.maxNativeZoom, dark: true, center: [c.lat, c.lng] });
    for (const line of lines) {
      // Each run is drawn faint; where many overlap the strokes add up and the line shines.
      L.polyline(line, { renderer: canvas, color: theme.primary, weight: 3, opacity: 0.28, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    }
    map.fitBounds(bounds, { padding: [24, 24] });
    const fix = window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24] });
    }, 300);
    return () => {
      window.clearTimeout(fix);
      map.remove();
    };
  }, [lines, theme.primary]);
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15 map-dark" style={{ height: 300, background: '#0b0d11' }}>
      <div ref={el} className="absolute inset-0" role="img" aria-label="Heatmap of every route you have recorded" />
    </div>
  );
};

const Thumb: React.FC<{ outline: LatLng[]; color: string }> = ({ outline, color }) => (
  <svg viewBox="0 0 64 64" className="w-14 h-14 shrink-0 rounded-xl bg-white/5" aria-hidden="true">
    <polyline points={routeToSvgPoints(outline, 64, 64, 8)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RouteRow: React.FC<{ g: RouteGroup; theme: ColorPalette; units: UnitSystem; byId: Map<string, WorkoutSession>; onOpenWorkout: (w: WorkoutSession) => void }> = ({ g, theme, units, byId, onOpenWorkout }) => {
  const [open, setOpen] = useState(false);
  const imperial = units === 'imperial';
  const latest = g.attempts[0];
  const behind = latest.seconds - g.best.seconds;
  return (
    <div className="rounded-2xl glass-inset overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-3 p-3 text-left">
        <Thumb outline={g.outline} color={theme.primary} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">{routeLabel(g, imperial)}</div>
          <div className="text-xs text-neutral-400 mt-0.5">
            {g.attempts.length} times · best {formatDuration(g.best.seconds)} · last {shortMonthDay(toDateKey(latest.at))}
          </div>
          <div className="text-xs mt-0.5" style={{ color: behind <= 0 ? '#6EE7B7' : '#9CA3AF' }}>
            {behind <= 0 ? 'Your latest was your best' : `Latest was ${formatDuration(behind)} off your best`}
            {g.trendPct !== undefined && Math.abs(g.trendPct) >= 1 && ` · lately ${Math.abs(g.trendPct)}% ${g.trendPct < 0 ? 'faster' : 'slower'}`}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-white/10">
          {[...g.attempts]
            .sort((a, b) => a.seconds - b.seconds)
            .map((a, i) => {
              const w = byId.get(a.workoutId);
              const pace = a.paceSecPerKm * (imperial ? 1.609344 : 1);
              return (
                <button
                  key={a.workoutId}
                  type="button"
                  disabled={!w}
                  onClick={() => w && onOpenWorkout(w)}
                  className="w-full grid grid-cols-[1.6rem_1fr_auto_auto] items-center gap-3 px-3 py-2 text-xs border-b border-white/5 last:border-none text-left"
                >
                  <span className="text-neutral-400 tabular-nums">{i === 0 ? <Trophy className="w-3.5 h-3.5 text-amber-300" /> : i + 1}</span>
                  <span className="text-neutral-300">{shortMonthDay(toDateKey(a.at))}</span>
                  <span className="tabular-nums text-neutral-400">
                    {formatPaceSec(pace)}/{distanceUnit(units)}
                  </span>
                  <span className="font-semibold tabular-nums text-white">{formatDuration(a.seconds)}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
};

/** The Run tab's Routes view: a heatmap of everywhere you have been, and the routes you repeat with your times on each. */
export const RoutesView: React.FC<Props> = ({ theme, workouts, units, onOpenWorkout, savedRoutes, onSaveRoute, onDeleteRoute, onFollow }) => {
  const [sport, setSport] = useState<(typeof SPORT_CHIPS)[number]>('All');
  const [year, setYear] = useState<number | 'all'>('all');

  const withRoutes = useMemo(() => workouts.filter((w) => w.startedAt && workoutPoints(w).length >= 2), [workouts]);
  const years = useMemo(() => [...new Set(withRoutes.map((w) => new Date(w.startedAt as number).getFullYear()))].sort((a, b) => b - a), [withRoutes]);
  const filtered = useMemo(
    () => withRoutes.filter((w) => (sport === 'All' || w.type === sport) && (year === 'all' || new Date(w.startedAt as number).getFullYear() === year)),
    [withRoutes, sport, year]
  );
  const lines = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => (b.startedAt as number) - (a.startedAt as number))
        .slice(0, MAX_DRAWN)
        .map((w) => (w.route && w.route.length >= 2 ? w.route : workoutPoints(w))),
    [filtered]
  );
  const [exportNote, setExportNote] = useState('');
  const exportAll = async () => {
    try {
      await downloadBinaryFile(`minimal-fitness-routes-${toDateKey(Date.now())}.zip`, gpxZip(filtered));
      setExportNote(`${filtered.length} route${filtered.length === 1 ? '' : 's'} exported as GPX.`);
    } catch (err: any) {
      setExportNote(err?.message || 'Export failed.');
    }
  };
  const km = filtered.reduce((s, w) => s + (w.distanceKm ?? 0), 0);
  const groups = useMemo(() => findRoutes(filtered), [filtered]);
  const byId = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);

  const saved = <SavedRoutesSection theme={theme} units={units} savedRoutes={savedRoutes} onSaveRoute={onSaveRoute} onDeleteRoute={onDeleteRoute} onFollow={onFollow} />;

  if (withRoutes.length === 0) {
    return (
      <div className="space-y-4">
        {saved}
        <MapPacksPanel theme={theme} />
        <section className="rounded-[28px] border p-6 text-center" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <RouteIcon className="w-8 h-8 mx-auto text-neutral-400" />
          <p className="text-sm font-semibold text-white mt-3">No routes yet</p>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">Record a GPS run, walk or ride, or import your history from another app, and every route shows up here as a heatmap.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saved}
      <MapPacksPanel theme={theme} />
      <section className="rounded-[28px] border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4" style={{ color: theme.primary }} />
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Your heatmap</h3>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Sport">
          {SPORT_CHIPS.map((s) => (
            <button key={s} type="button" aria-pressed={sport === s} onClick={() => setSport(s)} className="sport-pill !py-1.5 !px-3.5 !text-xs whitespace-nowrap">
              {s}
            </button>
          ))}
        </div>
        {years.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Year">
            {(['all', ...years] as (number | 'all')[]).map((y) => (
              <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)} className="sport-pill !py-1 !px-3 !text-xs whitespace-nowrap">
                {y === 'all' ? 'All years' : y}
              </button>
            ))}
          </div>
        )}
        {filtered.length === 0 ? <p className="text-xs text-neutral-400 py-6 text-center">No routes for that choice.</p> : <Heatmap theme={theme} lines={lines} />}
        <p className="text-xs text-neutral-400">
          {filtered.length} activit{filtered.length === 1 ? 'y' : 'ies'} · {kmToDisplay(km, units, 0)} {distanceUnit(units)} in total
          {filtered.length > MAX_DRAWN ? ` · newest ${MAX_DRAWN} drawn` : ''}. Drawn on this phone; brighter means you have been there more often.
        </p>
        {filtered.length > 0 && (
          <button type="button" onClick={() => void exportAll()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold text-[#E4E4E7]" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export these {filtered.length} as GPX (zip)
          </button>
        )}
        {exportNote && <p role="status" className="text-xs text-neutral-300">{exportNote}</p>}
      </section>

      <section className="space-y-2.5">
        <div className="px-1">
          <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>Routes you repeat</h3>
          <p className="text-xs text-neutral-400 mt-0.5">Found automatically: same start, finish and path, at least twice.</p>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-2xl glass-inset p-4 text-xs text-neutral-400 leading-relaxed">
            Nothing repeated yet. When you run, walk or ride the same route a second time, it appears here with your best time and how you are trending.
          </div>
        ) : (
          groups.map((g) => <RouteRow key={g.id} g={g} theme={theme} units={units} byId={byId} onOpenWorkout={onOpenWorkout} />)
        )}
      </section>
    </div>
  );
};
