import { useCallback, useMemo } from 'react';
import { usePersistentState } from './usePersistentState';
import { FoodRecord } from '../lib/foodDb';
import { FoodEntry } from '../types/tracking';
import { normalize } from '../lib/foodSearch';

/**
 * Your own food library: favourites (starred foods) and the foods you made yourself. Both are kept as full copies, so they keep
 * working offline and whatever the database does later. They live in the phone's storage with everything else, and in backups.
 */
export function useFoodLibrary(entries: FoodEntry[]) {
  const [favorites, setFavorites] = usePersistentState<FoodRecord[]>('fav_foods', []);
  const [mine, setMine] = usePersistentState<FoodRecord[]>('my_foods', []);

  const isFavorite = useCallback((r: FoodRecord) => favorites.some((f) => f.id === r.id), [favorites]);
  const toggleFavorite = useCallback(
    (r: FoodRecord) => setFavorites((prev) => (prev.some((f) => f.id === r.id) ? prev.filter((f) => f.id !== r.id) : [r, ...prev].slice(0, 300))),
    [setFavorites]
  );
  const addMine = useCallback((r: FoodRecord) => setMine((prev) => [r, ...prev.filter((f) => f.id !== r.id)].slice(0, 500)), [setMine]);
  const removeMine = useCallback((id: string) => setMine((prev) => prev.filter((f) => f.id !== id)), [setMine]);

  // How often each food was logged, by name: the foods you eat a lot rise to the top of the search.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      const k = normalize(e.name.replace(/\s*×.*$/, ''));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const boost = useCallback(
    (r: FoodRecord) => {
      const used = counts.get(normalize(r.brand ? `${r.name} (${r.brand})` : r.name)) ?? counts.get(normalize(r.name)) ?? 0;
      return Math.min(3, used * 0.6) + (favorites.some((f) => f.id === r.id) ? 2.5 : 0);
    },
    [counts, favorites]
  );

  return { favorites, mine, isFavorite, toggleFavorite, addMine, removeMine, boost };
}
