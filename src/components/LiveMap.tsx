import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TrackPoint, trackSegments } from '../lib/geo';
import { addBaseMap } from '../lib/mapPackLayer';
import { cachedTileLayer } from '../lib/tileCache';
import { FLUID_MAP_OPTIONS, MAP_STYLES, addLabelsOverlay, headingDeg, pinIcon, youIcon } from '../lib/mapStyles';

interface LiveMapProps {
  /** Returns the route so far. Called when `pointCount` changes. */
  getPoints: () => TrackPoint[];
  pointCount: number;
  color: string;
  height?: number;
  /** A saved route being followed, drawn as a dashed guide line under your own track. */
  reference?: [number, number][];
}

const TWEEN_MS = 900;

/**
 * A live map while a GPS workout runs: your route so far over a dark casing, and a glowing marker that glides to each new position,
 * turns to face the way you are heading, and keeps you in view. Drag the map to look around; Center brings you back.
 */
export const LiveMap: React.FC<LiveMapProps> = ({ getPoints, pointCount, color, height = 190, reference }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const casingLine = useRef<L.Polyline | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const drawn = useRef(0);
  const shown = useRef<[number, number] | null>(null);
  const raf = useRef(0);
  const followed = useRef(true);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, FLUID_MAP_OPTIONS);
    m.attributionControl.setPrefix(false);
    const here = getPoints();
    const last = here[here.length - 1];
    const def = MAP_STYLES.dark;
    const base = addBaseMap(m, { url: def.url, attribution: def.attribution, maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom, dark: true, center: last ? [last.lat, last.lng] : undefined });
    if (!base.offline) addLabelsOverlay(m, 'dark', cachedTileLayer);
    if (reference && reference.length >= 2) {
      L.polyline(reference, { color: '#ffffff', weight: 5, opacity: 0.6, dashArray: '2 9', lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(m);
      L.marker(reference[0], { icon: pinIcon('start'), keyboard: false, interactive: false }).addTo(m);
      L.marker(reference[reference.length - 1], { icon: pinIcon('finish'), keyboard: false, interactive: false }).addTo(m);
    }
    const renderer = L.canvas({ padding: 0.5 });
    // A dark casing under the line keeps it readable over roads and parks.
    casingLine.current = L.polyline([], { renderer, color: 'rgba(0,0,0,0.7)', weight: 10, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(m);
    line.current = L.polyline([], { renderer, color, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(m);
    // Stop following once the user drags the map; tapping "center" re-enables it.
    m.on('dragstart', () => {
      followed.current = false;
    });
    m.setView([0, 0], 2);
    map.current = m;
    drawn.current = 0;
    shown.current = null;
    const fix = window.setTimeout(() => m.invalidateSize(), 300);
    return () => {
      window.clearTimeout(fix);
      cancelAnimationFrame(raf.current);
      m.remove();
      map.current = null;
      line.current = null;
      casingLine.current = null;
      marker.current = null;
    };
  }, [color, reference]);

  useEffect(() => {
    const m = map.current;
    if (!m || !line.current) return;
    const pts = getPoints();
    if (pts.length === 0) return;
    // Only the new points are added, so a long workout stays smooth.
    if (pts.length < drawn.current) {
      line.current.setLatLngs([]);
      casingLine.current?.setLatLngs([]);
      drawn.current = 0;
    }
    // New points are added to the end; a gap (the signal came back somewhere else) starts a separate stretch, so no line crosses it.
    if (pts.slice(drawn.current).some((p) => p.gap)) {
      const stretches = trackSegments(pts);
      line.current.setLatLngs(stretches);
      casingLine.current?.setLatLngs(stretches);
    } else {
      for (let i = drawn.current; i < pts.length; i++) {
        line.current.addLatLng([pts[i].lat, pts[i].lng]);
        casingLine.current?.addLatLng([pts[i].lat, pts[i].lng]);
      }
    }
    drawn.current = pts.length;

    const target: [number, number] = [pts[pts.length - 1].lat, pts[pts.length - 1].lng];
    // Heading from the last few points, so the arrow turns with you without twitching on every fix.
    const back = pts[Math.max(0, pts.length - 4)];
    const moved = Math.hypot(back.lat - target[0], back.lng - target[1]) > 0.00002;
    const heading = moved ? headingDeg([back.lat, back.lng], target) : null;

    if (!marker.current) {
      marker.current = L.marker(target, { icon: youIcon(color), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(m);
      shown.current = target;
      m.setView(target, 17, { animate: false });
    } else {
      // Glide the marker from where it is to the new fix instead of jumping.
      const from = shown.current ?? target;
      const start = performance.now();
      cancelAnimationFrame(raf.current);
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / TWEEN_MS);
        const e = 1 - Math.pow(1 - k, 3);
        const at: [number, number] = [from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e];
        shown.current = at;
        marker.current?.setLatLng(at);
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    }
    const dom = marker.current.getElement()?.querySelector<HTMLElement>('.ky-you');
    if (dom) {
      if (heading === null) {
        dom.removeAttribute('data-heading');
      } else {
        dom.setAttribute('data-heading', String(Math.round(heading)));
        dom.style.setProperty('--heading', `${Math.round(heading)}deg`);
      }
    }
    // Keep you in view without re-centring on every fix: pan smoothly only once you drift out of the middle of the map.
    if (followed.current) {
      const size = m.getSize();
      const pt = m.latLngToContainerPoint(target);
      const outside = pt.x < size.x * 0.3 || pt.x > size.x * 0.7 || pt.y < size.y * 0.3 || pt.y > size.y * 0.7;
      if (outside) m.panTo(target, { animate: true, duration: 1.1, easeLinearity: 0.35, noMoveStart: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15" style={{ height, background: '#0b0d11' }}>
      <div ref={el} className="absolute inset-0" role="img" aria-label="Live map of your route" />
      <button
        onClick={() => {
          followed.current = true;
          const pts = getPoints();
          const last = pts[pts.length - 1];
          if (last && map.current) map.current.flyTo([last.lat, last.lng], Math.max(map.current.getZoom(), 16), { duration: 0.8 });
        }}
        className="absolute bottom-2 right-2 z-[500] min-h-11 glass-chip rounded-full px-4 text-xs font-semibold text-white"
      >
        Center
      </button>
    </div>
  );
};
