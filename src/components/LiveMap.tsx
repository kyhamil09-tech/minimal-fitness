import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TrackPoint } from '../lib/geo';
import { addBaseMap } from '../lib/mapPackLayer';

interface LiveMapProps {
  /** Returns the route so far. Called when `pointCount` changes. */
  getPoints: () => TrackPoint[];
  pointCount: number;
  color: string;
  height?: number;
  /** A saved route being followed, drawn as a dashed guide line under your own track. */
  reference?: [number, number][];
}

/** A small live map while a GPS workout runs: your route so far and a dot where you are, following you. */
export const LiveMap: React.FC<LiveMapProps> = ({ getPoints, pointCount, color, height = 190, reference }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const followed = useRef(true);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.5 });
    m.attributionControl.setPrefix(false);
    const here = getPoints();
    const last = here[here.length - 1];
    addBaseMap(m, {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      center: last ? [last.lat, last.lng] : undefined,
    });
    if (reference && reference.length >= 2) {
      L.polyline(reference, { color: '#ffffff', weight: 5, opacity: 0.55, dashArray: '2 9', lineCap: 'round', lineJoin: 'round' }).addTo(m);
      L.circleMarker(reference[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#34d399', fillOpacity: 1 }).addTo(m);
      L.circleMarker(reference[reference.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#f87171', fillOpacity: 1 }).addTo(m);
    }
    line.current = L.polyline([], { color, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(m);
    dot.current = L.circleMarker([0, 0], { radius: 8, color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 });
    // Stop following once the user drags the map; tapping "centre" re-enables it.
    m.on('dragstart', () => {
      followed.current = false;
    });
    m.setView([0, 0], 2);
    map.current = m;
    const fix = window.setTimeout(() => m.invalidateSize(), 300);
    return () => {
      window.clearTimeout(fix);
      m.remove();
      map.current = null;
    };
  }, [color, reference]);

  useEffect(() => {
    const m = map.current;
    if (!m || !line.current || !dot.current) return;
    const pts = getPoints();
    if (pts.length === 0) return;
    const latlngs = pts.map((p) => [p.lat, p.lng] as [number, number]);
    line.current.setLatLngs(latlngs);
    const last = latlngs[latlngs.length - 1];
    dot.current.setLatLng(last);
    if (!m.hasLayer(dot.current)) dot.current.addTo(m);
    if (followed.current) m.setView(last, Math.max(m.getZoom(), 16), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15 map-dark" style={{ height, background: '#0b0d11' }}>
      <div ref={el} className="absolute inset-0" role="img" aria-label="Live map of your route" />
      <button
        onClick={() => {
          followed.current = true;
          const pts = getPoints();
          const last = pts[pts.length - 1];
          if (last && map.current) map.current.setView([last.lat, last.lng], Math.max(map.current.getZoom(), 16));
        }}
        className="absolute bottom-2 right-2 z-[500] glass-chip rounded-full px-3 py-1.5 text-[11px] font-semibold text-white"
      >
        Centre
      </button>
    </div>
  );
};
