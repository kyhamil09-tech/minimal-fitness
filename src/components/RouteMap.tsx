import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { cachedTileLayer } from '../lib/tileCache';
import { addBaseMap } from '../lib/mapPackLayer';
import { FLUID_MAP_OPTIONS, FLUID_TILE_OPTIONS, MAP_STYLES, MapStyle, addLabelsOverlay, pinIcon, speedColor } from '../lib/mapStyles';
import 'leaflet/dist/leaflet.css';
import { TrackPoint, trackSegments } from '../lib/geo';

interface RouteMapProps {
  /** Timestamped track (preferred: the line is colored by speed). */
  track?: TrackPoint[];
  /** Plain route for older workouts that have no timestamps. */
  route?: [number, number][];
  height?: number;
}

const STYLE_LABEL: Record<MapStyle, string> = { dark: 'Dark', street: 'Street', terrain: 'Terrain', satellite: 'Satellite' };

/**
 * Interactive map of a workout route. The line is colored by speed over a dark casing and a soft glow, with a green start pin
 * and a red finish pin. Dark and Street are designed basemaps; without internet the route still draws on a plain background.
 */
export const RouteMap: React.FC<RouteMapProps> = ({ track, route, height = 260 }) => {
  const el = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<MapStyle>('dark');
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const coords: [number, number][] =
      track && track.length >= 2 ? track.map((p) => [p.lat, p.lng]) : (route ?? []);
    if (coords.length < 2) return;

    setTilesFailed(false);
    const map = L.map(el.current, { ...FLUID_MAP_OPTIONS, scrollWheelZoom: false });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let errors = 0;
    const def = MAP_STYLES[style];
    // An offline map pack that covers the route is used instead of the online tiles (satellite is always online).
    const base =
      style === 'satellite'
        ? { offline: false, layer: cachedTileLayer(def.url, { attribution: def.attribution, maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom, ...FLUID_TILE_OPTIONS }).addTo(map) }
        : addBaseMap(map, { url: def.url, attribution: def.attribution, maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom, dark: style === 'dark', center: coords[0] });
    // The dark canvas keeps its place names in a separate layer, drawn over the map (not when an offline pack is in use).
    if (!base.offline) addLabelsOverlay(map, style, cachedTileLayer);
    if (!base.offline) {
      base.layer.on('tileerror', () => {
        errors += 1;
        if (errors >= 3) setTilesFailed(true);
      });
    }

    const renderer = L.canvas({ padding: 0.4 });
    const lightMap = style === 'street' || style === 'terrain';
    const casing = lightMap ? 'rgba(15,23,42,0.55)' : 'rgba(0,0,0,0.7)';
    const common = { renderer, lineCap: 'round' as const, lineJoin: 'round' as const, interactive: false };

    // Speed per segment from the timestamps, shown as a color ramp.
    if (track && track.length >= 2) {
      const speeds: number[] = [];
      for (let i = 1; i < track.length; i++) {
        const dt = (track[i].t - track[i - 1].t) / 3600000;
        const dd = track[i].d - track[i - 1].d;
        speeds.push(dt > 0 && dd > 0 ? Math.min(60, dd / dt) : 0);
      }
      const moving = speeds.filter((s) => s > 0.5).sort((a, b) => a - b);
      const lo = moving[Math.floor(moving.length * 0.1)] ?? 0;
      const hi = moving[Math.floor(moving.length * 0.9)] ?? 1;
      // A wide soft halo, a dark casing so the line stands off the map, then the colored segments on top.
      // A line is never drawn across a gap (a stretch where the signal was lost), so it cannot show places you did not go.
      const stretches = trackSegments(track);
      L.polyline(stretches, { ...common, color: '#ffffff', weight: 14, opacity: lightMap ? 0 : 0.1 }).addTo(map);
      L.polyline(stretches, { ...common, color: casing, weight: 9, opacity: 1 }).addTo(map);
      for (let i = 1; i < track.length; i++) {
        if (track[i].gap) continue;
        const t = hi > lo ? (speeds[i - 1] - lo) / (hi - lo) : 0.5;
        L.polyline([coords[i - 1], coords[i]], { ...common, color: speedColor(speeds[i - 1] > 0.5 ? t : 0), weight: 5, opacity: 1 }).addTo(map);
      }
    } else {
      L.polyline(coords, { ...common, color: '#ffffff', weight: 14, opacity: lightMap ? 0 : 0.1 }).addTo(map);
      L.polyline(coords, { ...common, color: casing, weight: 9, opacity: 1 }).addTo(map);
      L.polyline(coords, { ...common, color: '#FF5500', weight: 5, opacity: 1 }).addTo(map);
    }

    L.marker(coords[0], { icon: pinIcon('start'), keyboard: false }).bindTooltip('Start').addTo(map);
    L.marker(coords[coords.length - 1], { icon: pinIcon('finish'), keyboard: false }).bindTooltip('Finish').addTo(map);

    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [34, 34] });
    // The container is inside an animating sheet: re-measure once it has its final size, then glide to the fitted view.
    const fix = window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [34, 34], animate: true, duration: 0.6 });
    }, 350);

    // If the box changes size after it opened (a sheet finishing its slide, the phone turning), the map re-measures and keeps the route in view.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [34, 34], animate: false });
    }) : null;
    if (el.current) ro?.observe(el.current);

    return () => {
      ro?.disconnect();
      window.clearTimeout(fix);
      map.remove();
    };
  }, [track, route, style]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15" style={{ height, background: '#0b0d11' }}>
      <div ref={el} className="absolute inset-0" role="img" aria-label="Map of your workout route" />
      <div className="absolute top-2 left-2 z-[500] flex rounded-full glass-chip p-0.5 text-xs font-semibold">
        {(['dark', 'street', 'terrain', 'satellite'] as MapStyle[]).map((s) => (
          <button
            key={s}
            onClick={() => setStyle(s)}
            aria-pressed={style === s}
            className={`min-h-9 px-2.5 rounded-full ${style === s ? 'bg-white/25 text-white' : 'text-neutral-300'}`}
          >
            {STYLE_LABEL[s]}
          </button>
        ))}
      </div>
      {tilesFailed && (
        <div className="absolute bottom-2 left-2 right-12 z-[500] text-xs text-amber-200 glass-chip rounded-xl px-2.5 py-1.5">
          The map background needs an internet connection. Your route is still shown.
        </div>
      )}
    </div>
  );
};
