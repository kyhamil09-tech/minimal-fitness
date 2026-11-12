import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_STYLES } from '../lib/mapStyles';
import { LatLng, staticMapView, tileUrl } from '../lib/staticMap';
import { loadTile } from '../lib/tileCache';

const HEIGHT = 96;

/**
 * A small still map of a route for the history list: the dark map's tiles behind the line, laid out with the same math as the full map
 * so the line sits on the streets. The tiles are fetched only once the card scrolls into view, come from the phone's tile cache when
 * they have been seen before, and go through the same network guard as every other map request. With no signal (or maps switched off
 * in Privacy) it shows the route on a plain dark background, as before.
 */
export const RouteThumb: React.FC<{ route: LatLng[]; color: string }> = ({ route, color }) => {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [seen, setSeen] = useState(false);
  const [tiles, setTiles] = useState<Record<string, string>>({});

  // Fit the picture to the card, and only start loading once the card is on screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.max(120, Math.round(el.clientWidth)));
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' });
      io.observe(el);
    } else setSeen(true);
    return () => {
      ro?.disconnect();
      io?.disconnect();
    };
  }, []);

  const view = useMemo(() => staticMapView(route, width, HEIGHT, 14), [route, width]);

  useEffect(() => {
    if (!seen || !view) return undefined;
    let live = true;
    const made: string[] = [];
    const def = MAP_STYLES.dark;
    for (const t of view.tiles) {
      const key = `${view.zoom}/${t.x}/${t.y}`;
      void loadTile(tileUrl(def.url, view.zoom, t.x, t.y)).then((src) => {
        if (!live) {
          if (src.startsWith('blob:')) URL.revokeObjectURL(src);
          return;
        }
        if (src.startsWith('blob:')) made.push(src);
        setTiles((prev) => ({ ...prev, [key]: src }));
      });
    }
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [seen, view]);

  if (!view) return null;
  return (
    <div ref={box} className="w-full overflow-hidden rounded-xl border border-neutral-900" style={{ height: HEIGHT, background: '#0b0d11' }}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img" aria-label="Route on a map" className="block">
        {view.tiles.map((t) => {
          const src = tiles[`${view.zoom}/${t.x}/${t.y}`];
          return src ? <image key={`${t.x}/${t.y}`} href={src} x={t.px} y={t.py} width={256} height={256} opacity={0.95} /> : null;
        })}
        <polyline points={view.points} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={view.points} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={view.start.x} cy={view.start.y} r={4.5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
        <circle cx={view.end.x} cy={view.end.y} r={4.5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
      </svg>
    </div>
  );
};
