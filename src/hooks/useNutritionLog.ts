import { usePersistentState } from './usePersistentState';
import { FoodEntry, SavedMeal, WaterEntry } from '../types/tracking';
import { makeId } from '../lib/ids';
import { deleteFromHc, writeFoodToHc, writeWaterToHc } from '../lib/healthWrite';

/**
 * Food, water and saved meals: the three lists, and adding to or deleting from them. Each change is also mirrored into Health
 * Connect when that is switched on (see lib/healthWrite, which does nothing when it is off).
 */
export function useNutritionLog() {
  const [food, setFood] = usePersistentState<FoodEntry[]>('food', []);
  const [water, setWater] = usePersistentState<WaterEntry[]>('water', []);
  const [savedMeals, setSavedMeals] = usePersistentState<SavedMeal[]>('saved_meals', []);

  const addFood = (date: string, f: Omit<FoodEntry, 'id' | 'date'>) => {
    const entry: FoodEntry = { ...f, id: makeId('f'), date };
    setFood((prev) => [...prev, entry]);
    void writeFoodToHc(entry);
    return entry.id;
  };
  const deleteFood = (id: string) => {
    setFood((prev) => prev.filter((f) => f.id !== id));
    void deleteFromHc('nutrition', [id]);
  };
  /** Changes a logged food in place (its amount, meal or numbers) and rewrites it in Health Connect. */
  const updateFood = (id: string, patch: Partial<FoodEntry>) => {
    const cur = food.find((f) => f.id === id);
    if (!cur) return;
    const updated: FoodEntry = { ...cur, ...patch, id: cur.id, date: cur.date };
    setFood((prev) => prev.map((f) => (f.id === id ? updated : f)));
    void writeFoodToHc(updated);
  };
  const addWater = (date: string, ml: number) => {
    const entry: WaterEntry = { id: makeId('wt'), date, ml };
    setWater((prev) => [...prev, entry]);
    void writeWaterToHc(entry);
  };
  const deleteWater = (id: string) => {
    setWater((prev) => prev.filter((w) => w.id !== id));
    void deleteFromHc('hydration', [id]);
  };
  const saveMeal = (name: string, items: SavedMeal['items']) => setSavedMeals((prev) => [...prev, { id: makeId('meal'), name, items }]);
  const deleteMeal = (id: string) => setSavedMeals((prev) => prev.filter((m) => m.id !== id));

  return { food, water, savedMeals, addFood, deleteFood, updateFood, addWater, deleteWater, saveMeal, deleteMeal };
}
