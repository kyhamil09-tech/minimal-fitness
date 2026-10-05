import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { cachedTileLayer } from '../lib/tileCache';
import { addBaseMap } from '../lib/mapPackLayer';
import 'leaflet/dist/leaflet.css';
import { TrackPoint } from '../lib/geo';

interface RouteMapProps {
  /** Timestamped track (preferred: the line is coloured by speed). */
  track?: TrackPoint[];
  /** Plain route for older workouts that have no timestamps. */
  route?: [number, number][];
  height?: number;
}

type Style = 'dark' | 'street' | 'satellite';

const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
};

/** Dark reuses the street tiles with a CSS filter (see .map-dark in index.css), so no API key is needed. */
const TILES: Record<Style, { url: string; attribution: string; subdomains?: string }> = {
  dark: OSM,
  street: OSM,
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};
/** Red (slow) to green (fast) along the route. */
const speedColor = (t: number) => `hsl(${Math.round(8 + 132 * Math.max(0, Math.min(1, t)))}, 85%, 58%)`;

/**
 * Interactive map of a workout route (OpenStreetMap data). The line is coloured by speed with a
 * green start and a red finish marker. Without internet the route still draws on a plain
 * background; only the street tiles are missing.
 */
export const RouteMap: React.FC<RouteMapProps> = ({ track, route, height = 260 }) => {
  const el = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<Style>('dark');
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const coords: [number, number][] =
      track && track.length >= 2 ? track.map((p) => [p.lat, p.lng]) : (route ?? []);
    if (coords.length < 2) return;

    setTilesFailed(false);
    const map = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      scrollWheelZoom: false,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let errors = 0;
    // An offline map pack that covers the route is used instead of the online tiles (satellite is always online).
    const base =
      style === 'satellite'
        ? { offline: false, layer: cachedTileLayer(TILES[style].url, { attribution: TILES[style].attribution, maxZoom: 19 }).addTo(map) }
        : addBaseMap(map, { url: TILES[style].url, attribution: TILES[style].attribution, center: coords[0] });
    if (!base.offline) {
      base.layer.on('tileerror', () => {
        errors += 1;
        if (errors >= 3) setTilesFailed(true);
      });
    }

    // Speed per segment from the timestamps, shown as a colour ramp.
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
      // Soft halo under the line, then the coloured segments on top.
      L.polyline(coords, { color: '#ffffff', weight: 9, opacity: 0.12, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      for (let i = 1; i < track.length; i++) {
        const t = hi > lo ? (speeds[i - 1] - lo) / (hi - lo) : 0.5;
        L.polyline([coords[i - 1], coords[i]], {
          color: speedColor(speeds[i - 1] > 0.5 ? t : 0),
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
      }
    } else {
      L.polyline(coords, { color: '#05f196', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    }

    const dot = (color: string) => ({ radius: 7, color: '#ffffff', weight: 2.5, fillColor: color, fillOpacity: 1 });
    L.circleMarker(coords[0], dot('#34d399')).bindTooltip('Start').addTo(map);
    L.circleMarker(coords[coords.length - 1], dot('#f87171')).bindTooltip('Finish').addTo(map);

    map.fitBounds(L.latLngBounds(coords), { padding: [28, 28] });
    // The container is inside an animating sheet: re-measure once it has its final size.
    const fix = window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(coords), { padding: [28, 28] });
    }, 350);

    return () => {
      window.clearTimeout(fix);
      map.remove();
    };
  }, [track, route, style]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15" style={{ height, background: '#0b0d11' }}>
      <div ref={el} className={`absolute inset-0 ${style === 'dark' ? 'map-dark' : ''}`} role="img" aria-label="Map of your workout route" />
      <div className="absolute top-2 left-2 z-[500] flex rounded-full glass-chip p-0.5 text-[11px] font-semibold">
        {(['dark', 'street', 'satellite'] as Style[]).map((s) => (
          <button
            key={s}
            onClick={() => setStyle(s)}
            className={`px-3 py-1 rounded-full ${style === s ? 'bg-white/25 text-white' : 'text-neutral-300'}`}
          >
            {s === 'dark' ? 'Dark' : s === 'street' ? 'Street' : 'Satellite'}
          </button>
        ))}
      </div>
      {tilesFailed && (
        <div className="absolute bottom-2 left-2 right-12 z-[500] text-[10px] text-amber-200 glass-chip rounded-xl px-2.5 py-1.5">
          Street tiles need an internet connection. Your route is still shown.
        </div>
      )}
    </div>
  );
};
