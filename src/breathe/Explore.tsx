import React, { useState } from 'react';
import { ChevronRight, Plus, Star } from 'lucide-react';
import { BreathPattern, PATTERNS, cycleSec } from '../lib/breathing';
import { CATEGORIES, Category, categoryHue, hueFor, infoFor } from './content';
import { SectionTitle } from './ui';

const StarButton: React.FC<{ on: boolean; name: string; onToggle: () => void }> = ({ on, name, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    aria-label={on ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
    className="br-icon-btn absolute right-1 top-1"
  >
    <Star className="h-5 w-5" style={{ color: on ? '#FBBF24' : 'rgba(255,255,255,0.55)', fill: on ? '#FBBF24' : 'none' }} aria-hidden="true" />
  </button>
);

/** Every technique, with a filter for what you want it for, a star for favorites, and a place for rhythms you make. */
export const Explore: React.FC<{
  favs: string[];
  custom: BreathPattern[];
  onFav: (id: string) => void;
  onTechnique: (id: string) => void;
  onMake: () => void;
}> = ({ favs, custom, onFav, onTechnique, onMake }) => {
  const [cat, setCat] = useState<Category | 'all' | 'fav'>('all');
  const list = PATTERNS.filter((p) => cat === 'all' || (cat === 'fav' ? favs.includes(p.id) : infoFor(p.id)?.categories.includes(cat)));
  const mine = cat === 'all' || cat === 'fav' ? custom.filter((p) => cat === 'all' || favs.includes(p.id)) : [];

  return (
    <div className="br-scroll">
      <h1 className="br-h1 mt-3">Techniques</h1>
      <p className="br-dim mt-1 text-sm">{PATTERNS.length + custom.length} ways to breathe. Pick one to see exactly how it works before you start.</p>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="What for">
        <button type="button" className="br-chip shrink-0" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
          All
        </button>
        <button type="button" className="br-chip shrink-0" aria-pressed={cat === 'fav'} onClick={() => setCat('fav')}>
          <Star className="h-3.5 w-3.5" aria-hidden="true" /> Favorites
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className="br-chip shrink-0" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.hue }} aria-hidden="true" />
            {c.label}
          </button>
        ))}
      </div>
      {cat !== 'all' && cat !== 'fav' && <p className="br-dim mt-3 px-1 text-sm">{CATEGORIES.find((c) => c.id === cat)?.line}</p>}

      <SectionTitle
        right={
          <button type="button" className="br-chip" onClick={onMake}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Make your own
          </button>
        }
      >
        {cat === 'all' ? 'All techniques' : cat === 'fav' ? 'Favorites' : CATEGORIES.find((c) => c.id === cat)?.label}
      </SectionTitle>

      {cat === 'fav' && favs.length === 0 && <p className="br-dim px-1 text-sm">Tap the star on a technique to keep it here, one tap from Today.</p>}

      <ul className="space-y-2.5">
        {mine.map((p) => (
          <li key={p.id} className="relative">
            <button type="button" className="br-card br-row w-full pr-12 text-left" style={{ ['--row-hue' as string]: categoryHue('calm') }} onClick={() => onTechnique(p.id)} aria-label={`${p.name}, your rhythm. ${p.rhythm}. See details`}>
              <span className="h-12 w-12 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 38% 32%, #5EEAD4, #5EEAD444 70%)`, boxShadow: '0 0 22px #5EEAD444' }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{p.name}</span>
                <span className="block text-xs font-semibold" style={{ color: '#5EEAD4' }}>
                  {p.rhythm}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="br-tag">Yours</span>
                  <span className="br-tag">{Math.round((60 / cycleSec(p)) * 10) / 10}/min</span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
            <StarButton on={favs.includes(p.id)} name={p.name} onToggle={() => onFav(p.id)} />
          </li>
        ))}
        {list.map((p) => {
          const info = infoFor(p.id);
          const hue = hueFor(p.id);
          return (
            <li key={p.id} className="relative">
              <button type="button" className="br-card br-row w-full pr-12 text-left" style={{ ['--row-hue' as string]: hue }} onClick={() => onTechnique(p.id)} aria-label={`${p.name}. ${p.rhythm}. See details`}>
                <span className="h-12 w-12 shrink-0 rounded-full" style={{ background: `radial-gradient(circle at 38% 32%, ${hue}, ${hue}44 70%)`, boxShadow: `0 0 22px ${hue}44` }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{p.name}</span>
                  <span className="block text-xs font-semibold" style={{ color: hue }}>
                    {p.rhythm}
                  </span>
                  <span className="br-dim mt-1 line-clamp-2 block text-xs leading-relaxed">{p.blurb}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {info?.categories.map((c) => (
                      <span key={c} className="br-tag" style={{ color: categoryHue(c), borderColor: `${categoryHue(c)}55` }}>
                        {CATEGORIES.find((x) => x.id === c)?.label}
                      </span>
                    ))}
                    <span className="br-tag">{info?.minutes} min</span>
                    <span className="br-tag">{Math.round((60 / cycleSec(p)) * 10) / 10}/min</span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden="true" />
              </button>
              <StarButton on={favs.includes(p.id)} name={p.name} onToggle={() => onFav(p.id)} />
            </li>
          );
        })}
      </ul>
      <div className="h-4" />
    </div>
  );
};
