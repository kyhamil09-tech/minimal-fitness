import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronRight, HeartPulse, Search, SlidersHorizontal, TrendingUp, Utensils, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { APP_MAP, MapArea, MapItem, MapTarget, searchMap } from '../lib/appMap';

interface AppMapScreenProps {
  theme: ColorPalette;
  onGo: (target: MapTarget) => void;
  onClose: () => void;
}

const AREA_ICON: Record<MapArea['id'], React.ElementType> = {
  move: Activity,
  fuel: Utensils,
  body: HeartPulse,
  progress: TrendingUp,
  setup: SlidersHorizontal,
};

/** Everything the app does, in five areas, with search. Tap anything to go straight there. */
export const AppMapScreen: React.FC<AppMapScreenProps> = ({ theme, onGo, onClose }) => {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchMap(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (item: MapItem) => (
    <li key={item.id}>
      <button onClick={() => onGo(item.target)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{item.label}</span>
          <span className="block text-xs leading-snug text-[#9AA3B2]">{item.sub}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
    </li>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Map of the app" className="fixed inset-0 z-50 flex flex-col bg-[#0B0D11]/95 backdrop-blur-md animate-fadeIn">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <p className="gh-eyebrow">Minimal Fitness</p>
            <h1 className="mt-1">Map</h1>
          </div>
          <button onClick={onClose} aria-label="Close the map" className="rounded-full p-2 text-neutral-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <label className="relative block">
            <span className="sr-only">Search the app</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find anything: sleep, backup, groceries…"
              className="w-full rounded-2xl border border-[#1A1E26] bg-black/50 py-3 pl-10 pr-4 text-sm text-white placeholder:text-neutral-400"
              enterKeyHint="search"
            />
          </label>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto px-5 pb-10">
          {searching ? (
            results.length > 0 ? (
              <ul className="divide-y divide-[#1A1E26] overflow-hidden rounded-2xl border border-[#1A1E26] bg-black/30">{results.map(row)}</ul>
            ) : (
              <p className="px-1 py-6 text-center text-sm text-[#9AA3B2]">Nothing matches “{query.trim()}”. Try a simpler word, like “sleep” or “backup”.</p>
            )
          ) : (
            APP_MAP.map((area) => {
              const Icon = AREA_ICON[area.id];
              return (
                <section key={area.id} aria-label={area.title}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${theme.primary}22`, color: theme.primary }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="text-sm font-bold text-white">{area.title}</h2>
                    <span className="text-xs text-[#9AA3B2]">{area.blurb}</span>
                  </div>
                  <ul className="divide-y divide-[#1A1E26] overflow-hidden rounded-2xl border border-[#1A1E26] bg-black/30">{area.items.map(row)}</ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
